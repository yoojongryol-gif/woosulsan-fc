/* 웃을산 FC — 개발용 목(mock) Firebase 공급자
 * Java(=Firestore 에뮬레이터 필수 의존성)가 없어 에뮬레이터를 못 쓰므로, 5959 와 같은 방식으로
 * 메모리 Firestore/Auth 를 만들어 3역할 흐름을 e2e 로 검증한다.
 * 프로덕션 경로와 무관: cloud.js 는 provider 인터페이스만 보고, 실제 배선은 firebase-provider.js 가 한다.
 *
 * 규칙(rules) 시뮬레이션: firestore.rules 의 핵심 거부 경로만 흉내 낸다.
 *  - 남의 팀 선수 평가 / 권한 밖 필드 수정 / 초대 토큰 목록 조회(list) / 승인 전 이름 가로채기
 */

export function createMockProvider({ rules = true } = {}) {
  const docs = new Map();          // "a/b/c" → object
  const collSubs = new Map();      // "a/b" → Set(cb)
  const docSubs = new Map();       // "a/b/c" → Set(cb)
  let current = null;              // 현재 로그인 사용자
  const authCbs = new Set();
  const log = [];                  // 감사 로그 (테스트 확인용)

  const key = (p) => p.join('/');
  const parentOf = (p) => p.slice(0, -1);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function notifyDoc(p) {
    const k = key(p);
    const set = docSubs.get(k);
    if (set) for (const cb of set) cb(docs.has(k) ? clone(docs.get(k)) : null);
    const pk = key(parentOf(p));
    const cset = collSubs.get(pk);
    if (cset) {
      const list = listColl(parentOf(p));
      for (const cb of cset) cb(list);
    }
  }
  function listColl(p) {
    const prefix = key(p) + '/';
    const out = [];
    for (const [k, v] of docs) {
      if (!k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length);
      if (rest.includes('/')) continue;           // 하위 컬렉션 제외
      out.push({ id: rest, ...clone(v) });
    }
    return out;
  }

  /* ---------- 규칙 시뮬레이션 ---------- */
  function clubOf(clubId) { return docs.get(key(['clubs', clubId])) || null; }
  function memberOf(clubId, mid) { return docs.get(key(['clubs', clubId, 'members', mid])) || null; }
  function roleFor(clubId, uid) {
    const club = clubOf(clubId);
    if (!club || !uid) return 'guest';
    if (club.ownerUid === uid) return 'owner';
    const t = ['A', 'B', 'C', 'D'].find((k) => club.teams?.[k]?.coachUid === uid);
    if (t) return 'coach:' + t;
    const list = listColl(['clubs', clubId, 'members']);
    if (list.some((m) => m.memberUid === uid)) return 'member';
    return 'guest';
  }
  function deny(msg) {
    const e = new Error(msg || 'Missing or insufficient permissions.');
    e.code = 'permission-denied';
    throw e;
  }
  function checkWrite(p, patch, mode) {
    if (!rules) return;
    const uid = current?.uid;
    if (!uid) deny('로그인이 필요합니다.');
    const [c0, clubId, c2, id, c4] = p;

    if (c0 === 'inviteIndex') {
      // 생성은 운영자만, 읽기는 토큰을 아는 사람만(get). list 는 provider 에 아예 없음.
      if (mode !== 'delete') {
        const club = clubOf(patch?.clubId);
        if (!club || club.ownerUid !== uid) deny('초대 링크는 운영자만 만들 수 있습니다.');
      }
      return;
    }
    if (c0 !== 'clubs') return;
    const role = roleFor(clubId, uid);

    if (p.length === 2) { // 클럽 문서
      if (mode === 'create') return;              // 새 클럽 생성(ownerUid 본인)은 아래에서 검사
      if (role === 'owner') return;
      // 책임자 초대 수락: teams 만 바꾸되 자기 uid 를 자기 팀에만
      if (patch && Object.keys(patch).length === 1 && patch.teams) {
        const before = clubOf(clubId)?.teams || {};
        const changed = ['A', 'B', 'C', 'D'].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(patch.teams[k]));
        const ok = changed.length === 1 && patch.teams[changed[0]].coachUid === uid
          && !before[changed[0]]?.coachUid;
        if (ok) return;
      }
      deny('클럽 설정은 운영자만 바꿀 수 있습니다.');
    }

    if (c2 === 'members') {
      const before = memberOf(clubId, id);
      if (role === 'owner') return;
      if (mode === 'create' || mode === 'delete') deny('회원 추가·삭제는 운영자만 할 수 있습니다.');
      const fields = Object.keys(patch || {});
      if (role.startsWith('coach:')) {
        const team = role.split(':')[1];
        if (before?.team !== team) deny('자기 팀 선수만 평가할 수 있습니다.');
        const allowed = ['skill', 'abil', 'pos', 'skillUpdatedAt', 'skillUpdatedBy', 'abilUpdatedAt', 'abilUpdatedBy'];
        if (!fields.every((f) => allowed.includes(f))) deny('책임자가 고칠 수 없는 항목입니다.');
        return;
      }
      if (role === 'member') {
        if (before?.memberUid !== uid) deny('본인 정보만 고칠 수 있습니다.');
        const allowed = ['birthYear', 'gender', 'pos', 'selfAbil'];
        if (!fields.every((f) => allowed.includes(f))) deny('회원이 고칠 수 없는 항목입니다.');
        return;
      }
      // 초대 수락 대기: pendingUid 를 "본인 uid 로" 거는 것만 허용 (이름 가로채기 방지)
      const onlyPending = fields.every((f) => ['pendingUid', 'pendingAt'].includes(f));
      if (onlyPending && (patch.pendingUid === uid || patch.pendingUid === null)) {
        if (before?.memberUid && before.memberUid !== uid) deny('이미 다른 사람과 연결된 이름입니다.');
        return;
      }
      deny('권한이 없습니다.');
    }

    if (c2 === 'matches') {
      if (role === 'owner') return;
      if (c4 === 'attendance' || p[4] === 'attendance') {
        const memberId = p[5];
        const m = memberOf(clubId, memberId);
        if (role.startsWith('coach:') && m?.team === role.split(':')[1]) return;
        if (role === 'member' && m?.memberUid === uid) return;
        deny('출석을 대신 체크할 권한이 없습니다.');
      }
      deny('경기 정보는 운영자만 고칠 수 있습니다.');
    }
    if (c2 === 'tactics') {
      if (role === 'owner' || role.startsWith('coach:')) return;
      deny('전술은 운영자·책임자만 저장할 수 있습니다.');
    }
  }

  const provider = {
    auth: {
      onChange(cb) { authCbs.add(cb); cb(current); return () => authCbs.delete(cb); },
      async signInGoogle(profile = {}) {
        current = { uid: profile.uid || 'google_' + Math.random().toString(36).slice(2, 8),
          displayName: profile.displayName || '구글 사용자', isAnonymous: false };
        for (const cb of authCbs) cb(current);
        return current;
      },
      async signInAnonymous() {
        current = { uid: 'anon_' + Math.random().toString(36).slice(2, 8), displayName: null, isAnonymous: true };
        for (const cb of authCbs) cb(current);
        return current;
      },
      async signOut() { current = null; for (const cb of authCbs) cb(null); },
      _setUser(u) { current = u; for (const cb of authCbs) cb(u); },
      _user() { return current; },
    },
    db: {
      async getDoc(p) {
        const v = docs.get(key(p));
        return v ? clone(v) : null;
      },
      async setDoc(p, data) {
        const existed = docs.has(key(p));
        // 새 클럽 생성은 ownerUid 가 본인일 때만
        if (!existed && p[0] === 'clubs' && p.length === 2 && rules) {
          if (!current || data.ownerUid !== current.uid) deny('클럽은 본인 uid 로만 만들 수 있습니다.');
        } else {
          checkWrite(p, data, existed ? 'update' : 'create');
        }
        docs.set(key(p), clone(data));
        log.push({ op: existed ? 'set' : 'create', path: key(p), uid: current?.uid });
        notifyDoc(p);
      },
      async updateDoc(p, patch) {
        checkWrite(p, patch, 'update');
        const cur = docs.get(key(p)) || {};
        docs.set(key(p), clone({ ...cur, ...patch }));
        log.push({ op: 'update', path: key(p), uid: current?.uid, fields: Object.keys(patch) });
        notifyDoc(p);
      },
      async deleteDoc(p) {
        checkWrite(p, null, 'delete');
        docs.delete(key(p));
        log.push({ op: 'delete', path: key(p), uid: current?.uid });
        notifyDoc(p);
      },
      onDoc(p, cb) {
        const k = key(p);
        if (!docSubs.has(k)) docSubs.set(k, new Set());
        docSubs.get(k).add(cb);
        cb(docs.has(k) ? clone(docs.get(k)) : null);
        return () => docSubs.get(k)?.delete(cb);
      },
      onCollection(p, cb) {
        const k = key(p);
        if (!collSubs.has(k)) collSubs.set(k, new Set());
        collSubs.get(k).add(cb);
        cb(listColl(p));
        return () => collSubs.get(k)?.delete(cb);
      },
      /** 내 uid 가 속한 클럽 찾기 — 실제 구현은 rules 상 제한된 쿼리로 대체될 예정 */
      async findClubForUid(uid) {
        for (const [k, v] of docs) {
          const parts = k.split('/');
          if (parts.length !== 2 || parts[0] !== 'clubs') continue;
          if (v.ownerUid === uid) return parts[1];
          if (['A', 'B', 'C', 'D'].some((t) => v.teams?.[t]?.coachUid === uid)) return parts[1];
          const members = listColl(['clubs', parts[1], 'members']);
          if (members.some((m) => m.memberUid === uid || m.pendingUid === uid)) return parts[1];
        }
        return null;
      },
      /** 테스트 편의 */
      _dump() { return Object.fromEntries([...docs].map(([k, v]) => [k, clone(v)])); },
      _log() { return log; },
      _reset() { docs.clear(); collSubs.clear(); docSubs.clear(); log.length = 0; },
    },
  };
  return provider;
}
