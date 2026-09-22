/* 웃을산 FC — 클럽 서버 연결 (Firebase Auth + Firestore)
 *
 * 설계 요점
 *  1) 공급자(provider) 추상화: 실제 Firebase SDK 와 개발용 목(mock) 이 같은 인터페이스를 구현한다.
 *     → Java 없이(에뮬레이터 없이) e2e 가 가능하고, 실 config 가 오면 provider 만 갈아끼운다. (5959 방식)
 *  2) 앱 화면은 기존 store.js 와 같은 모양의 객체를 계속 쓴다. 클라우드 모드에서는
 *     onSnapshot 으로 받은 "거울(mirror)" 을 동기 읽기로 제공하고, 쓰기는 Firestore 로 보낸다.
 *  3) 첫 화면 즉시 표시를 위해 마지막 스냅샷을 localStorage 에 캐시한다.
 *     (오프라인 persistence 는 5959 와 같은 이유로 쓰지 않는다: 여러 기기·역할이 섞이면
 *      로컬 캐시와 서버 권한 상태가 어긋나 "내 화면엔 보이는데 저장이 안 되는" 혼란이 생긴다.)
 *
 * 권한 3등급 (firestore.rules 와 1:1)
 *   운영자(owner)  : club.ownerUid — 전부
 *   책임자(coach)  : club.teams[K].coachUid — 자기 팀 선수 평가/소속 내 필드, 자기 팀 출석 대리, 전술
 *   회원(member)   : members/{id}.memberUid — 본인 프로필 일부 + 본인 출석
 */

export const CLOUD_CACHE_KEY = 'woosulsan-fc:cloud-cache';
export const TEAM_KEYS = ['A', 'B', 'C', 'D'];
const INVITE_TTL_DAYS = 7;

/* ---------------- 유틸 ---------------- */
export function newId(prefix = 'id') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
export function newToken() {
  // 초대 토큰: 추측 어려운 22자 (문서 id 로 쓰므로 list 금지 규칙과 짝)
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  const rnd = globalThis.crypto?.getRandomValues
    ? globalThis.crypto.getRandomValues(new Uint32Array(22))
    : Array.from({ length: 22 }, () => Math.floor(Math.random() * 2 ** 32));
  for (const n of rnd) out += chars[n % chars.length];
  return out;
}
export function inviteExpiry(days = INVITE_TTL_DAYS) {
  return Date.now() + days * 24 * 60 * 60 * 1000;
}
export function isExpired(invite, now = Date.now()) {
  return !invite || (invite.expiresAt && Number(invite.expiresAt) < now);
}

/* ---------------- 역할 판정 ---------------- */
export function roleOf(club, uid, members = []) {
  if (!club || !uid) return { role: 'guest', team: null };
  if (club.ownerUid === uid) return { role: 'owner', team: null };
  const team = TEAM_KEYS.find((k) => club.teams?.[k]?.coachUid === uid);
  if (team) return { role: 'coach', team };
  const me = members.find((m) => m.memberUid === uid);
  if (me) return { role: 'member', team: me.team || null, memberId: me.id };
  const pending = members.find((m) => m.pendingUid === uid);
  if (pending) return { role: 'pending', team: pending.team || null, memberId: pending.id };
  return { role: 'guest', team: null };
}

/** 이 사용자가 이 회원 문서의 해당 필드를 고칠 수 있는가 (UI 가드 — 서버 rules 와 같은 판단) */
export function canEditMember(club, uid, member, fields, members = []) {
  const { role, team } = roleOf(club, uid, members);
  if (role === 'owner') return true;
  const OWNER_ONLY = ['name', 'active', 'gk', 'team', 'memberUid'];
  if (role === 'coach') {
    if (member.team !== team) return false;
    const allowed = ['skill', 'abil', 'pos', 'skillUpdatedAt', 'skillUpdatedBy', 'abilUpdatedAt', 'abilUpdatedBy'];
    return fields.every((f) => allowed.includes(f));
  }
  if (role === 'member') {
    if (member.memberUid !== uid) return false;
    const allowed = ['birthYear', 'gender', 'pos', 'selfAbil'];
    return fields.every((f) => allowed.includes(f));
  }
  return !fields.some((f) => OWNER_ONLY.includes(f)) && false;
}

/** 출석 대리 체크 권한 */
export function canSetAttendance(club, uid, member, members = []) {
  const { role, team } = roleOf(club, uid, members);
  if (role === 'owner') return true;
  if (role === 'coach') return member.team === team;
  if (role === 'member') return member.memberUid === uid;
  return false;
}

/* ---------------- 클라우드 스토어 ---------------- */
/**
 * @param {object} provider  { auth:{ signInGoogle, signInAnonymous, signOut, onChange(cb) },
 *                             db:{ getDoc, setDoc, updateDoc, deleteDoc, onCollection, onDoc } }
 */
export function createCloud(provider, { cacheKey = CLOUD_CACHE_KEY } = {}) {
  const state = {
    ready: false,
    user: null,          // { uid, displayName, isAnonymous }
    clubId: null,
    club: null,
    members: [],
    matches: [],
    attendance: {},      // matchId -> { memberId: status }
    tactics: [],
    error: null,
  };
  const listeners = new Set();
  const unsubs = [];

  function emit() { for (const fn of listeners) { try { fn(snapshot()); } catch (e) { console.error(e); } } }
  function snapshot() {
    return {
      ready: state.ready, user: state.user, clubId: state.clubId, club: state.club,
      members: state.members, matches: state.matches, attendance: state.attendance,
      tactics: state.tactics, role: roleOf(state.club, state.user?.uid, state.members), error: state.error,
    };
  }
  function cache() {
    try {
      localStorage.setItem(cacheKey, JSON.stringify({
        clubId: state.clubId, club: state.club, members: state.members,
        matches: state.matches, attendance: state.attendance, at: Date.now(),
      }));
    } catch (e) { /* 저장 실패는 무시 (첫 화면 캐시일 뿐) */ }
  }
  function loadCache() {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      const j = JSON.parse(raw);
      if (!j?.clubId) return null;
      state.clubId = j.clubId; state.club = j.club || null;
      state.members = j.members || []; state.matches = j.matches || [];
      state.attendance = j.attendance || {};
      return j;
    } catch (e) { return null; }
  }

  const path = {
    club: (id) => ['clubs', id],
    members: (id) => ['clubs', id, 'members'],
    member: (id, mid) => ['clubs', id, 'members', mid],
    matches: (id) => ['clubs', id, 'matches'],
    match: (id, gid) => ['clubs', id, 'matches', gid],
    attendance: (id, gid) => ['clubs', id, 'matches', gid, 'attendance'],
    tactics: (id) => ['clubs', id, 'tactics'],
    invite: (token) => ['inviteIndex', token],
  };

  async function attach(clubId) {
    detach();
    state.clubId = clubId;
    unsubs.push(provider.db.onDoc(path.club(clubId), (doc) => {
      state.club = doc ? { id: clubId, ...doc } : null;
      cache(); emit();
    }));
    unsubs.push(provider.db.onCollection(path.members(clubId), (docs) => {
      state.members = docs;
      cache(); emit();
    }));
    unsubs.push(provider.db.onCollection(path.matches(clubId), (docs) => {
      state.matches = docs;
      cache(); emit();
      // 예정/확정 경기의 출석만 구독 (읽기 비용 절약)
      for (const g of docs.slice(0, 3)) subscribeAttendance(g.id);
    }));
    unsubs.push(provider.db.onCollection(path.tactics(clubId), (docs) => {
      state.tactics = docs; emit();
    }));
  }
  const attSubs = new Map();
  function subscribeAttendance(matchId) {
    if (attSubs.has(matchId)) return;
    const un = provider.db.onCollection(path.attendance(state.clubId, matchId), (docs) => {
      state.attendance[matchId] = Object.fromEntries(docs.map((d) => [d.id, d.status]));
      cache(); emit();
    });
    attSubs.set(matchId, un);
    unsubs.push(un);
  }
  function detach() {
    while (unsubs.length) { const u = unsubs.pop(); try { u && u(); } catch (e) { /* noop */ } }
    attSubs.clear();
  }

  const api = {
    state: snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get user() { return state.user; },
    get club() { return state.club; },
    role() { return roleOf(state.club, state.user?.uid, state.members); },
    isActive() { return !!(state.user && state.clubId); },

    /** 앱 시작 시 1회 — 캐시 표시 후 인증 상태 반영 */
    async init() {
      loadCache();
      emit();
      provider.auth.onChange(async (user) => {
        state.user = user || null;
        if (!user) { detach(); state.ready = true; emit(); return; }
        try {
          const clubId = await api.findMyClub(user.uid);
          if (clubId) await attach(clubId);
        } catch (e) {
          state.error = e.message;
        }
        state.ready = true;
        emit();
      });
      return snapshot();
    },

    async signInGoogle() { return provider.auth.signInGoogle(); },
    async signInAnonymous() { return provider.auth.signInAnonymous(); },
    async signOut() { detach(); try { localStorage.removeItem(cacheKey); } catch (e) { /* noop */ } return provider.auth.signOut(); },

    /** 내 uid 가 속한 클럽 찾기 (운영자/책임자/회원 순) */
    async findMyClub(uid) {
      const known = state.clubId || (loadCache() || {}).clubId;
      if (known) {
        const doc = await provider.db.getDoc(path.club(known));
        if (doc) return known;
      }
      const found = await provider.db.findClubForUid?.(uid);
      return found || null;
    },

    /* ---------- 클럽 만들기 / 이관 ---------- */
    async createClub({ name = '웃을산 FC', color = '#1f7a4d', teamNames = {}, localData = null } = {}) {
      const user = state.user;
      if (!user) throw new Error('먼저 로그인해 주세요.');
      const clubId = newId('club');
      const teams = Object.fromEntries(TEAM_KEYS.map((k) => [k, {
        name: teamNames[k] || `${k}팀`, color: null, mixed: false, coachUid: null,
      }]));
      await provider.db.setDoc(path.club(clubId), {
        name, color, ownerUid: user.uid, teams, lockWomen: true, createdAt: Date.now(),
      });
      if (localData) await api.importLocal(clubId, localData);
      await attach(clubId);
      return clubId;
    },

    /** 로컬(혼자 쓰던) 데이터 → 클럽으로 1회 업로드 */
    async importLocal(clubId, data) {
      const id = clubId || state.clubId;
      if (!id) throw new Error('클럽이 없습니다.');
      const club = data.club || {};
      const teams = Object.fromEntries(TEAM_KEYS.map((k) => [k, {
        name: club.teamNames?.[k] || `${k}팀`,
        color: null,
        mixed: (club.mixedTeams || []).includes(k),
        coachUid: null,
      }]));
      await provider.db.updateDoc(path.club(id), {
        name: club.name || '웃을산 FC',
        teams,
        lockWomen: club.lockWomen !== false,
      });
      const idMap = {};
      for (const m of data.members || []) {
        const mid = newId('m');
        idMap[m.id] = mid;
        await provider.db.setDoc(path.member(id, mid), {
          name: m.name, skill: m.skill ?? 3, gk: !!m.gk, pos: m.pos || 'MF',
          team: m.team || null, birthYear: m.birthYear || null, gender: m.gender || null,
          abil: m.abil || {}, active: m.active !== false,
          memberUid: null, pendingUid: null,
          skillUpdatedAt: m.skillUpdatedAt || null, skillUpdatedBy: m.skillUpdatedBy || null,
          abilUpdatedAt: m.abilUpdatedAt || null, abilUpdatedBy: m.abilUpdatedBy || null,
        });
      }
      // 감독 지정은 uid 가 아직 없으므로 이름만 메모로 남긴다(책임자 초대 수락 시 연결).
      const coachNames = {};
      for (const k of TEAM_KEYS) {
        const cid = club.coaches?.[k];
        const m = (data.members || []).find((x) => x.id === cid);
        if (m) coachNames[k] = m.name;
      }
      if (Object.keys(coachNames).length) await provider.db.updateDoc(path.club(id), { coachNames });

      for (const g of data.matches || []) {
        const gid = newId('g');
        await provider.db.setDoc(path.match(id, gid), {
          date: g.date, time: g.time || '20:00', place: g.place || '', status: g.status || '예정',
          teamCount: g.teamCount || 2,
          teams: (g.teams || []).map((arr) => arr.map((x) => idMap[x]).filter(Boolean)),
          teamPlan: g.teamPlan || null, createdAt: Date.now(),
        });
        for (const [mid, st] of Object.entries(g.attendance || {})) {
          if (!idMap[mid]) continue;
          await provider.db.setDoc([...path.attendance(id, gid), idMap[mid]], { status: st, by: 'import', ts: Date.now() });
        }
      }
      return { members: (data.members || []).length, matches: (data.matches || []).length };
    },

    /* ---------- 초대 ---------- */
    async createInvite({ role, team = null, days = INVITE_TTL_DAYS }) {
      if (!state.clubId) throw new Error('클럽이 없습니다.');
      if (api.role().role !== 'owner') throw new Error('초대 링크는 운영자만 만들 수 있습니다.');
      if (role === 'coach' && !TEAM_KEYS.includes(team)) throw new Error('팀을 고르세요.');
      const token = newToken();
      await provider.db.setDoc(path.invite(token), {
        clubId: state.clubId, role, team: role === 'coach' ? team : null,
        createdAt: Date.now(), expiresAt: inviteExpiry(days), createdBy: state.user.uid,
      });
      return { token, url: `${location.origin}${location.pathname}#invite=${token}` };
    },

    async readInvite(token) {
      const doc = await provider.db.getDoc(path.invite(token));
      if (!doc) throw new Error('초대 링크가 올바르지 않습니다.');
      if (isExpired(doc)) throw new Error('초대 링크가 만료되었습니다. 운영자에게 새 링크를 받아 주세요.');
      const club = await provider.db.getDoc(path.club(doc.clubId));
      return { ...doc, token, clubName: club?.name || '클럽' };
    },

    /** 책임자 초대 수락 (구글 로그인 상태여야 함) */
    async acceptCoachInvite(token) {
      const inv = await api.readInvite(token);
      if (inv.role !== 'coach') throw new Error('책임자용 초대가 아닙니다.');
      if (!state.user) throw new Error('먼저 구글 로그인해 주세요.');
      if (state.user.isAnonymous) throw new Error('책임자는 구글 로그인이 필요합니다.');
      const club = await provider.db.getDoc(path.club(inv.clubId));
      const teams = { ...(club.teams || {}) };
      teams[inv.team] = { ...(teams[inv.team] || {}), coachUid: state.user.uid, coachName: state.user.displayName || null };
      await provider.db.updateDoc(path.club(inv.clubId), { teams });
      await provider.db.deleteDoc(path.invite(token));   // 1회용
      await attach(inv.clubId);
      return { clubId: inv.clubId, team: inv.team };
    },

    /** 회원 초대 수락 1단계: 명단에서 본인 선택 → 승인 대기 */
    async requestMemberLink(token, memberId) {
      const inv = await api.readInvite(token);
      if (inv.role !== 'member') throw new Error('회원용 초대가 아닙니다.');
      if (!state.user) throw new Error('먼저 시작하기를 눌러 주세요.');
      const m = await provider.db.getDoc(path.member(inv.clubId, memberId));
      if (!m) throw new Error('명단에서 이름을 찾지 못했습니다.');
      if (m.memberUid && m.memberUid !== state.user.uid) throw new Error('이미 다른 기기와 연결된 이름입니다. 운영자에게 문의해 주세요.');
      await provider.db.updateDoc(path.member(inv.clubId, memberId), { pendingUid: state.user.uid, pendingAt: Date.now() });
      await attach(inv.clubId);
      return { clubId: inv.clubId, memberId };
    },

    /** 승인/거절 (운영자 또는 해당 팀 책임자) */
    async approveMember(memberId, approve = true) {
      const m = state.members.find((x) => x.id === memberId);
      if (!m) throw new Error('회원을 찾지 못했습니다.');
      const { role, team } = api.role();
      if (!(role === 'owner' || (role === 'coach' && m.team === team))) throw new Error('승인 권한이 없습니다.');
      await provider.db.updateDoc(path.member(state.clubId, memberId),
        approve ? { memberUid: m.pendingUid, pendingUid: null, pendingAt: null }
          : { pendingUid: null, pendingAt: null });
      return true;
    },
    pendingRequests() {
      const { role, team } = api.role();
      return state.members.filter((m) => m.pendingUid
        && (role === 'owner' || (role === 'coach' && m.team === team)));
    },

    /* ---------- 데이터 쓰기 (권한은 rules 가 최종 판정, UI 는 미리 막는다) ---------- */
    async addMember(data) {
      if (api.role().role !== 'owner') throw new Error('회원 추가는 운영자만 할 수 있습니다.');
      const mid = newId('m');
      await provider.db.setDoc(path.member(state.clubId, mid), {
        name: data.name, skill: data.skill ?? 3, gk: !!data.gk, pos: data.pos || 'MF',
        team: data.team || null, birthYear: data.birthYear || null, gender: data.gender || null,
        abil: data.abil || {}, active: true, memberUid: null, pendingUid: null,
      });
      return mid;
    },
    async updateMember(memberId, patch) {
      const m = state.members.find((x) => x.id === memberId);
      if (!m) throw new Error('회원을 찾지 못했습니다.');
      const fields = Object.keys(patch);
      if (!canEditMember(state.club, state.user?.uid, m, fields, state.members)) {
        throw new Error('이 항목을 고칠 권한이 없습니다.');
      }
      await provider.db.updateDoc(path.member(state.clubId, memberId), patch);
      return true;
    },
    async removeMember(memberId) {
      if (api.role().role !== 'owner') throw new Error('회원 삭제는 운영자만 할 수 있습니다.');
      await provider.db.deleteDoc(path.member(state.clubId, memberId));
      return true;
    },
    async setAttendance(matchId, memberId, status) {
      const m = state.members.find((x) => x.id === memberId);
      if (!m) throw new Error('회원을 찾지 못했습니다.');
      if (!canSetAttendance(state.club, state.user?.uid, m, state.members)) {
        throw new Error('출석을 대신 체크할 권한이 없습니다.');
      }
      const by = api.role().role;
      if (status == null) await provider.db.deleteDoc([...path.attendance(state.clubId, matchId), memberId]);
      else await provider.db.setDoc([...path.attendance(state.clubId, matchId), memberId], { status, by, ts: Date.now() });
      subscribeAttendance(matchId);
      return true;
    },
    async addMatch(data) {
      if (api.role().role !== 'owner') throw new Error('경기 만들기는 운영자만 할 수 있습니다.');
      const gid = newId('g');
      await provider.db.setDoc(path.match(state.clubId, gid), { ...data, createdAt: Date.now() });
      return gid;
    },
    async updateMatch(matchId, patch) {
      const { role } = api.role();
      const onlyAttendanceless = Object.keys(patch).every((k) => k === 'attendance');
      if (role !== 'owner' && !onlyAttendanceless) throw new Error('경기 정보는 운영자만 고칠 수 있습니다.');
      await provider.db.updateDoc(path.match(state.clubId, matchId), patch);
      return true;
    },
    async saveTactic(data) {
      const { role } = api.role();
      if (role !== 'owner' && role !== 'coach') throw new Error('전술은 운영자와 책임자만 저장할 수 있습니다.');
      const tid = data.id || newId('t');
      await provider.db.setDoc([...path.tactics(state.clubId), tid], { ...data, id: tid, updatedAt: Date.now() });
      return tid;
    },
    async setTeamMeta(teamKey, patch) {
      if (api.role().role !== 'owner') throw new Error('팀 설정은 운영자만 할 수 있습니다.');
      const teams = { ...(state.club?.teams || {}) };
      teams[teamKey] = { ...(teams[teamKey] || {}), ...patch };
      await provider.db.updateDoc(path.club(state.clubId), { teams });
      return true;
    },
    subscribeAttendance,
    _paths: path,
  };

  return api;
}
