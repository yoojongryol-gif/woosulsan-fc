/* 웃을산 FC — 저장 계층 어댑터
 * 지금: localStorage 어댑터 1개.
 * 나중: 같은 인터페이스로 FirestoreAdapter 를 끼우면 앱 코드는 그대로.
 * 모든 메서드는 async — 원격 저장소로 바꿔도 호출부가 안 바뀌게.
 */

export const SCHEMA_VERSION = 1;

export function emptyState() {
  return {
    schema: SCHEMA_VERSION,
    club: { name: '웃을산 FC' },
    members: [],
    matches: [],
    tactics: [],
    updatedAt: new Date().toISOString(),
  };
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
      teamCount: x.teamCount === 3 ? 3 : 2,
      teams: Array.isArray(x.teams) ? x.teams : [],
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
      bulkAdd(names) {
        const added = [];
        const seen = new Set(state.members.map((m) => m.name));
        for (const raw of names) {
          const name = String(raw).trim();
          if (!name || seen.has(name)) continue;
          seen.add(name);
          const m = normalizeMember({ name });
          state.members.push(m);
          added.push(m);
        }
        touch();
        return added;
      },
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
      setTeams(matchId, teams, teamCount) {
        const g = api.matches.byId(matchId);
        if (!g) return null;
        g.teams = teams;
        if (teamCount) g.teamCount = teamCount;
        touch();
        return g;
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
