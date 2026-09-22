/* 웃을산 FC — 저장 계층 어댑터
 * 지금: localStorage 어댑터 1개.
 * 나중: 같은 인터페이스로 FirestoreAdapter 를 끼우면 앱 코드는 그대로.
 * 모든 메서드는 async — 원격 저장소로 바꿔도 호출부가 안 바뀌게.
 */

export const SCHEMA_VERSION = 2;

/** 고정 소속 팀 키 (회원은 이 중 하나에 소속되거나 미배정) */
export const TEAM_KEYS = ['A', 'B', 'C', 'D'];
export const DEFAULT_TEAM_NAMES = { A: 'A팀', B: 'B팀', C: 'C팀', D: 'D팀' };

/** 간단 체크 6항목 (각 1~5, 미입력 허용). 순서 고정 */
export const ABILITIES = [
  { key: 'speed', label: '스피드' },
  { key: 'stamina', label: '지구력' },
  { key: 'basic', label: '기본기', hint: '볼컨트롤·패스' },
  { key: 'shoot', label: '슈팅' },
  { key: 'defense', label: '수비' },
  { key: 'physical', label: '피지컬', hint: '몸싸움' },
];
export const ABILITY_KEYS = ABILITIES.map((a) => a.key);

/** 성별 (미입력 허용) */
export const GENDERS = ['남', '여'];
export function parseGender(v) {
  const t = String(v ?? '').trim().toLowerCase();
  if (!t) return null;
  if (['남', '남자', 'm', 'male', '♂'].includes(t)) return '남';
  if (['여', '여자', 'f', 'female', 'w', '♀'].includes(t)) return '여';
  return null;
}

export function normalizeAbil(raw) {
  const out = {};
  for (const k of ABILITY_KEYS) {
    const n = Math.round(Number(raw?.[k]));
    out[k] = Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
  }
  return out;
}

/** 입력된 항목만의 평균 (없으면 null) */
export function abilAvg(abil) {
  const vals = ABILITY_KEYS.map((k) => abil?.[k]).filter((v) => typeof v === 'number');
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

export function emptyState() {
  return {
    schema: SCHEMA_VERSION,
    club: { name: '웃을산 FC', teamNames: { ...DEFAULT_TEAM_NAMES }, mixedTeams: [], lockWomen: true },
    members: [],
    matches: [],
    tactics: [],
    updatedAt: new Date().toISOString(),
  };
}

/** 연 나이 = 올해 - 출생년도 (만 나이 아님) */
export function ageOf(birthYear, now = new Date()) {
  if (!birthYear) return null;
  return now.getFullYear() - Number(birthYear);
}

/** 나이 표기: "90년생 · 36세" */
export function ageLabel(birthYear, now = new Date()) {
  const a = ageOf(birthYear, now);
  if (a == null) return '';
  return `${String(birthYear).slice(-2)}년생 · ${a}세`;
}

/**
 * 출생년도 파싱. 4자리는 그대로, 2자리는 19xx/20xx 자동 보정.
 * 규칙: 20xx 로 봤을 때 15세 이상이면 20xx, 아니면 19xx (19xx 가 100세 초과면 다시 20xx).
 */
export function parseBirthYear(v, now = new Date()) {
  const raw = String(v ?? '').trim();
  if (!raw) return null;
  if (!/^\d{1,4}$/.test(raw)) return null;
  const n = Number(raw);
  const year = now.getFullYear();
  if (raw.length === 4) {
    if (n < 1900 || n > year) return null;
    return n;
  }
  if (raw.length <= 2) {
    const c20 = 2000 + n;
    const c19 = 1900 + n;
    if (c20 <= year && year - c20 >= 15) return c20;
    if (year - c19 <= 100) return c19;
    return c20 <= year ? c20 : null;
  }
  return null; // 3자리는 오타로 본다
}

/**
 * 일괄 추가 한 줄 파싱: "홍길동", "홍길동 90", "홍길동,1990", "홍길동 90 여", "홍길동 여 90"
 * 출생년도·성별 토큰은 순서 무관, 없으면 null.
 */
export function parseMemberLine(line) {
  const raw = String(line ?? '').trim();
  if (!raw) return null;
  let rest = raw;
  let birthYear = null;
  let gender = null;

  // 뒤에서부터 최대 2개 토큰을 떼어 본다
  for (let i = 0; i < 2; i += 1) {
    const m = rest.match(/^(.*?)[\s,\t]+([^\s,\t]+)$/);
    if (!m || !m[1].trim()) break;
    const tok = m[2];
    if (birthYear == null && /^\d{2}$|^\d{4}$/.test(tok) && parseBirthYear(tok)) {
      birthYear = parseBirthYear(tok);
      rest = m[1].trim();
      continue;
    }
    if (gender == null && parseGender(tok)) {
      gender = parseGender(tok);
      rest = m[1].trim();
      continue;
    }
    break;
  }
  return { name: rest.replace(/[\s,]+$/, '').trim(), birthYear, gender };
}

export function uid(prefix = 'id') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------------- 어댑터 ---------------- */

export class LocalStorageAdapter {
  constructor(key = 'woosulsan-fc:v1') {
    this.key = key;
  }
  async load() {
    try {
      const raw = globalThis.localStorage?.getItem(this.key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) {
      console.warn('[store] load 실패', e);
      return null;
    }
  }
  async save(state) {
    try {
      globalThis.localStorage?.setItem(this.key, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error('[store] save 실패', e);
      throw new Error('저장 공간이 가득 찼거나 브라우저가 저장을 막았습니다.');
    }
  }
  async clear() {
    try { globalThis.localStorage?.removeItem(this.key); } catch (e) { /* noop */ }
  }
}

/* ---------------- 스토어 ---------------- */

export function createStore(adapter = new LocalStorageAdapter()) {
  let state = emptyState();
  const listeners = new Set();
  let saveTimer = null;

  function emit() {
    for (const fn of listeners) {
      try { fn(state); } catch (e) { console.error(e); }
    }
  }

  function touch() {
    state.updatedAt = new Date().toISOString();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { adapter.save(state).catch(() => {}); }, 60);
    emit();
  }

  function migrate(raw) {
    const base = emptyState();
    const s = Object.assign(base, raw || {});
    s.schema = SCHEMA_VERSION;
    s.club = Object.assign({ name: '웃을산 FC' }, raw?.club || {});
    s.club.teamNames = Object.assign({ ...DEFAULT_TEAM_NAMES }, raw?.club?.teamNames || {});
    s.club.mixedTeams = Array.isArray(raw?.club?.mixedTeams) ? raw.club.mixedTeams.filter((k) => TEAM_KEYS.includes(k)) : [];
    s.club.lockWomen = raw?.club?.lockWomen !== false; // 기본 ON
    s.members = Array.isArray(s.members) ? s.members.map(normalizeMember) : [];
    s.matches = Array.isArray(s.matches) ? s.matches.map(normalizeMatch) : [];
    s.tactics = Array.isArray(s.tactics) ? s.tactics : [];
    return s;
  }

  function normalizeMember(m) {
    return {
      id: m.id || uid('m'),
      name: String(m.name ?? '').trim(),
      skill: clampSkill(m.skill),
      gk: !!m.gk,
      pos: ['FW', 'MF', 'DF', 'GK'].includes(m.pos) ? m.pos : 'MF',
      team: TEAM_KEYS.includes(m.team) ? m.team : null, // 고정 소속 팀 (없으면 미배정)
      birthYear: parseBirthYear(m.birthYear), // 선택 입력 (없으면 null)
      abil: normalizeAbil(m.abil),           // 간단 체크 6항목 (미입력은 null)
      gender: parseGender(m.gender),         // '남' | '여' | null
      active: m.active !== false,
      createdAt: m.createdAt || new Date().toISOString(),
    };
  }

  function normalizeMatch(x) {
    return {
      id: x.id || uid('g'),
      date: x.date || new Date().toISOString().slice(0, 10),
      time: x.time || '20:00',
      place: x.place || '',
      status: ['예정', '확정', '종료'].includes(x.status) ? x.status : '예정',
      teamCount: [2, 3, 4].includes(x.teamCount) ? x.teamCount : 2,
      teams: Array.isArray(x.teams) ? x.teams : [],
      // 오늘의 팀 구성 방식: 고정 팀 합치기(merge) 또는 소속 무시 재배분(shuffle)
      teamPlan: x.teamPlan && typeof x.teamPlan === 'object'
        ? {
          mode: x.teamPlan.mode === 'shuffle' ? 'shuffle' : 'merge',
          groups: Array.isArray(x.teamPlan.groups) ? x.teamPlan.groups : [],
          labels: Array.isArray(x.teamPlan.labels) ? x.teamPlan.labels.map(String) : [], // AI가 지은 팀 이름
        }
        : null,
      attendance: x.attendance && typeof x.attendance === 'object' ? x.attendance : {},
      createdAt: x.createdAt || new Date().toISOString(),
    };
  }

  function clampSkill(v) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return 3;
    return Math.min(5, Math.max(1, n));
  }

  const api = {
    /* 수명주기 */
    async init() {
      const raw = await adapter.load();
      state = migrate(raw);
      emit();
      return state;
    },
    get() { return state; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async flush() { clearTimeout(saveTimer); return adapter.save(state); },

    /* 회원 */
    members: {
      all() { return state.members; },
      active() { return state.members.filter((m) => m.active); },
      byId(id) { return state.members.find((m) => m.id === id) || null; },
      add(data) {
        const m = normalizeMember(data);
        state.members.push(m);
        touch();
        return m;
      },
      /** names 는 "홍길동" 또는 "홍길동 90" 같은 줄도 허용 */
      bulkAdd(names, defaults = {}) {
        const added = [];
        const seen = new Set(state.members.map((m) => m.name));
        const expand = (raw) => {
          const parsed = parseMemberLine(raw);
          if (!parsed) return [];
          // "홍길동,90" 처럼 뒤가 출생년도면 한 명, "김철수, 이영희" 처럼 아니면 이름 목록
          if (parsed.birthYear || !parsed.name.includes(',')) return [parsed];
          return parsed.name.split(',').map((x) => parseMemberLine(x)).filter((x) => x && x.name);
        };
        for (const raw of names) {
          for (const parsed of expand(raw)) {
            if (!parsed.name || seen.has(parsed.name)) continue;
            seen.add(parsed.name);
            const m = normalizeMember({ ...defaults, name: parsed.name,
              birthYear: parsed.birthYear ?? defaults.birthYear ?? null,
              gender: parsed.gender ?? defaults.gender ?? null });
            state.members.push(m);
            added.push(m);
          }
        }
        touch();
        return added;
      },
      byTeam(key) { return state.members.filter((m) => m.active && m.team === key); },
      unassigned() { return state.members.filter((m) => m.active && !m.team); },
      update(id, patch) {
        const i = state.members.findIndex((m) => m.id === id);
        if (i < 0) return null;
        state.members[i] = normalizeMember(Object.assign({}, state.members[i], patch, { id }));
        touch();
        return state.members[i];
      },
      remove(id) {
        state.members = state.members.filter((m) => m.id !== id);
        for (const g of state.matches) {
          delete g.attendance[id];
          g.teams = (g.teams || []).map((t) => t.filter((x) => x !== id));
        }
        state.tactics = state.tactics.map((t) => ({
          ...t,
          pins: (t.pins || []).filter((p) => p.memberId !== id),
        }));
        touch();
      },
    },

    /* 경기 */
    matches: {
      all() { return state.matches; },
      byId(id) { return state.matches.find((g) => g.id === id) || null; },
      sorted() {
        return [...state.matches].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
      },
      upcoming() {
        const today = new Date().toISOString().slice(0, 10);
        return [...state.matches]
          .filter((g) => g.date >= today && g.status !== '종료')
          .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      },
      add(data) {
        const g = normalizeMatch(data);
        state.matches.push(g);
        touch();
        return g;
      },
      update(id, patch) {
        const i = state.matches.findIndex((g) => g.id === id);
        if (i < 0) return null;
        state.matches[i] = normalizeMatch(Object.assign({}, state.matches[i], patch, { id }));
        touch();
        return state.matches[i];
      },
      remove(id) {
        state.matches = state.matches.filter((g) => g.id !== id);
        state.tactics = state.tactics.filter((t) => t.matchId !== id);
        touch();
      },
      setAttendance(matchId, memberId, status) {
        const g = api.matches.byId(matchId);
        if (!g) return null;
        if (status == null) delete g.attendance[memberId];
        else g.attendance[memberId] = status; // 'in' | 'out' | 'maybe'
        touch();
        return g;
      },
      setAttendanceBulk(matchId, map) {
        const g = api.matches.byId(matchId);
        if (!g) return null;
        g.attendance = Object.assign({}, map);
        touch();
        return g;
      },
      attendees(matchId) {
        const g = api.matches.byId(matchId);
        if (!g) return [];
        return state.members.filter((m) => g.attendance[m.id] === 'in');
      },
      setTeams(matchId, teams, teamCount, teamPlan) {
        const g = api.matches.byId(matchId);
        if (!g) return null;
        g.teams = teams;
        if (teamCount) g.teamCount = teamCount;
        if (teamPlan !== undefined) g.teamPlan = teamPlan;
        touch();
        return g;
      },
      /** 이번 경기의 소속 팀별 참석 현황 */
      teamAttendance(matchId) {
        const g = api.matches.byId(matchId);
        const out = {};
        for (const k of TEAM_KEYS) out[k] = [];
        out.none = [];
        if (!g) return out;
        for (const m of state.members) {
          if (!m.active || g.attendance[m.id] !== 'in') continue;
          (out[m.team] || out.none).push(m);
        }
        return out;
      },
    },

    /* 출석률 */
    stats: {
      attendance(memberId) {
        let total = 0; let present = 0;
        for (const g of state.matches) {
          const v = g.attendance[memberId];
          if (v === 'in' || v === 'out') { total += 1; if (v === 'in') present += 1; }
        }
        return { total, present, rate: total ? Math.round((present / total) * 100) : null };
      },
    },

    /* 전술 */
    tactics: {
      byMatch(matchId) { return state.tactics.filter((t) => t.matchId === matchId); },
      byId(id) { return state.tactics.find((t) => t.id === id) || null; },
      save(data) {
        if (data.id) {
          const i = state.tactics.findIndex((t) => t.id === data.id);
          if (i >= 0) {
            state.tactics[i] = Object.assign({}, state.tactics[i], data, { updatedAt: new Date().toISOString() });
            touch();
            return state.tactics[i];
          }
        }
        // data.id 가 undefined 로 들어와도 생성된 id 를 덮어쓰지 않도록 뒤에서 확정
        const t = Object.assign({}, data, { id: data.id || uid('t'), updatedAt: new Date().toISOString() });
        state.tactics.push(t);
        touch();
        return t;
      },
      remove(id) {
        state.tactics = state.tactics.filter((t) => t.id !== id);
        touch();
      },
    },

    /* 클럽 설정 (팀 이름) */
    club: {
      get() { return state.club; },
      teamName(key) { return state.club.teamNames?.[key] || DEFAULT_TEAM_NAMES[key] || key; },
      /** 혼성팀 여부 */
      isMixed(key) { return (state.club.mixedTeams || []).includes(key); },
      mixedTeams() { return [...(state.club.mixedTeams || [])]; },
      setMixed(key, on) {
        if (!TEAM_KEYS.includes(key)) return;
        const set = new Set(state.club.mixedTeams || []);
        if (on) set.add(key); else set.delete(key);
        state.club.mixedTeams = TEAM_KEYS.filter((k) => set.has(k));
        touch();
      },
      /** 여성 회원 혼성팀 고정 (기본 ON) */
      lockWomen() { return state.club.lockWomen !== false; },
      setLockWomen(on) { state.club.lockWomen = !!on; touch(); },
      setTeamName(key, name) {
        if (!TEAM_KEYS.includes(key)) return;
        state.club.teamNames = Object.assign({ ...DEFAULT_TEAM_NAMES }, state.club.teamNames, { [key]: String(name).trim() || DEFAULT_TEAM_NAMES[key] });
        touch();
      },
    },

    /* 백업 / 이관 */
    exportJSON() {
      return JSON.stringify({ app: '웃을산 FC', exportedAt: new Date().toISOString(), data: state }, null, 2);
    },
    async importJSON(text, { merge = false } = {}) {
      let parsed;
      try { parsed = JSON.parse(text); } catch (e) { throw new Error('JSON 형식이 아닙니다.'); }
      const incoming = parsed?.data && parsed.data.members ? parsed.data : parsed;
      if (!incoming || !Array.isArray(incoming.members)) throw new Error('회원 목록이 없는 파일입니다.');
      if (!merge) {
        state = migrate(incoming);
      } else {
        const next = migrate(incoming);
        const names = new Set(state.members.map((m) => m.name));
        for (const m of next.members) if (!names.has(m.name)) state.members.push(m);
        const ids = new Set(state.matches.map((g) => g.id));
        for (const g of next.matches) if (!ids.has(g.id)) state.matches.push(g);
        const tids = new Set(state.tactics.map((t) => t.id));
        for (const t of next.tactics) if (!tids.has(t.id)) state.tactics.push(t);
      }
      await adapter.save(state);
      emit();
      return { members: state.members.length, matches: state.matches.length };
    },
    async resetAll() {
      state = emptyState();
      await adapter.clear();
      await adapter.save(state);
      emit();
    },
  };

  return api;
}
