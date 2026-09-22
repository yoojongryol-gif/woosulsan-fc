/* 웃을산 FC — 저장 계층 어댑터
 * 지금: localStorage 어댑터 1개.
 * 나중: 같은 인터페이스로 FirestoreAdapter 를 끼우면 앱 코드는 그대로.
 * 모든 메서드는 async — 원격 저장소로 바꿔도 호출부가 안 바뀌게.
 */

/** 버전 스탬프 — app.js 와 다르면 캐시가 섞인 것이므로 앱이 스스로 복구한다 */
export const MODULE_VERSION = 'v0.5.5';

export const SCHEMA_VERSION = 2;

/** 고정 소속 팀 키 (회원은 이 중 하나에 소속되거나 미배정) */
export const TEAM_KEYS = ['A', 'B', 'C', 'D'];
export const DEFAULT_TEAM_NAMES = { A: '교역', B: '장년', C: '청년', D: '체육' };
/** v0.5.3 까지 쓰던 기본 이름 — 사용자가 손대지 않았으면 새 기본값으로 올린다 */
export const OLD_DEFAULT_TEAM_NAMES = { A: 'A팀', B: 'B팀', C: 'C팀', D: 'D팀' };
/** 일괄 추가에서 줄 맨 앞에 쓰는 팀 약자 (1~2글자, 편집 가능) */
export const DEFAULT_TEAM_ALIASES = { A: '교', B: '장', C: '청', D: '체' };

/** 흔한 한 글자 성 — 팀 약자로 못 읽은 토큰이 성이면 이름의 일부로 본다 ("홍 길동") */
const COMMON_SURNAMES = new Set(('김이박최정강조윤장임한오서신권황안송전홍유고문양손배백허남심노하곽성차주우구민류나진지엄채원천방공현함변염여추도소石마길연위표명기반왕琴옥육印맹제모남궁탁국여진어은편구용').split(''));

/** 줄 맨 앞 토큰이 어느 팀을 가리키나 (약자 → 팀 이름 → A~D 순) */
export function matchTeamToken(token, { teamNames = null, teamAliases = null } = {}) {
  const t = String(token ?? '').trim();
  if (!t) return null;
  const aliases = teamAliases || DEFAULT_TEAM_ALIASES;
  for (const k of TEAM_KEYS) {
    const a = String(aliases[k] || '').trim();
    if (a && t === a) return k;
  }
  if (teamNames) {
    for (const k of TEAM_KEYS) {
      const nm = String(teamNames[k] || '').trim();
      if (nm && (t === nm || (t.length === 1 && nm[0] === t))) return k;
    }
  }
  const up = t.toUpperCase();
  if (TEAM_KEYS.includes(up)) return up;
  if (/^[ABCD]팀$/.test(up)) return up[0];
  return null;
}

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

/* ---------------- 포지션 토큰 ----------------
 * 사장님이 실제로 붙여넣는 형식: "교 진혜린 95 여 포워드", "정지원 96 여 레프트 윙", "정성현 85 남 센터백"
 *  - 한 단어(포워드·미들·백·골키퍼)와 두 단어(레프트 윙·라이트 백·센터 백) 모두 인식
 *  - 레프트/라이트/센터/사이드는 수식어로 소비 (뒤 단어와 합쳐 판단)
 *  - 토큰이 "따로 떨어져 있을 때만" 인정 → "김수비" 같은 이름은 건드리지 않는다
 */
export const POS_TOKENS = {
  GK: ['gk', '골키퍼', '키퍼', '골키', '골', '지키미'],
  DF: ['df', 'cb', 'lb', 'rb', 'wb', '수비', '수비수', '백', '센터백', '풀백', '레프트백', '라이트백',
    '사이드백', '윙백', '중앙수비', '측면수비'],
  MF: ['mf', 'cm', 'dm', 'am', '미들', '미드', '미드필더', '중미', '센터미드', '중앙미드', '중앙', '허리', '링커'],
  FW: ['fw', 'st', 'cf', 'lw', 'rw', '포워드', '공격', '공격수', '스트라이커', '스트', '윙', '윙어',
    '윙포워드', '레프트윙', '라이트윙', '센터포워드', '최전방', '원톱', '투톱'],
};
/** 두 단어 포지션의 앞말 (레프트 윙 / 라이트 백 / 센터 백 …) */
export const POS_MODIFIERS = ['레프트', '라이트', '센터', '사이드', '중앙', '좌', '우', 'left', 'right', 'center', 'centre', 'side'];

const normTok = (t) => String(t ?? '').trim().toLowerCase().replace(/[.\-_]/g, '');

/** 토큰 1개 → { pos, gk } (아니면 null) */
export function parsePositionToken(tok) {
  const t = normTok(tok);
  if (!t) return null;
  for (const [pos, list] of Object.entries(POS_TOKENS)) {
    if (list.some((x) => normTok(x) === t)) return { pos, gk: pos === 'GK' };
  }
  return null;
}

/**
 * tokens[i] 부터 포지션을 읽는다 (두 단어 우선).
 * @returns {{pos:string|null, gk:boolean, consumed:number}|null}
 */
export function matchPositionAt(tokens, i) {
  const a = tokens[i];
  const b = tokens[i + 1];
  if (b) {
    const joined = parsePositionToken(normTok(a) + normTok(b));   // "레프트"+"윙" → 레프트윙
    if (joined) return { ...joined, consumed: 2 };
  }
  const one = parsePositionToken(a);
  if (one) {
    // "윙" 다음에 "백" 이 오면 윙백(수비)로 읽는다
    if (b && normTok(a) === '윙' && normTok(b) === '백') return { pos: 'DF', gk: false, consumed: 2 };
    return { ...one, consumed: 1 };
  }
  if (POS_MODIFIERS.some((m) => normTok(m) === normTok(a))) {
    // 수식어인데 뒤에 포지션이 없으면 그냥 버린다 (이름으로 오인하지 않게)
    return { pos: null, gk: false, consumed: 1 };
  }
  return null;
}

/** 이름 문자열에서 포지션 토큰만 떼어낸다 (기존 회원 정리 도구용) */
export function splitNamePosition(rawName, opts = {}) {
  const tokens = String(rawName ?? '').split(/[\s,/()·|]+/).filter(Boolean);
  const nameParts = [];
  let pos = null; let gk = false; let team = null; const extras = [];
  // 이름이 "체 진혜린" 처럼 팀 약자로 시작하면 떼어낸다
  if (tokens.length > 1) {
    const hit = matchTeamToken(tokens[0], opts);
    if (hit) { team = hit; tokens.shift(); }
  }
  for (let i = 0; i < tokens.length; i += 1) {
    const hit = matchPositionAt(tokens, i);
    if (hit) {
      if (hit.pos) {
        if (!pos) { pos = hit.pos; gk = hit.gk; }
        else { extras.push(hit.pos); if (hit.gk) gk = true; }
      }
      i += hit.consumed - 1;
      continue;
    }
    nameParts.push(tokens[i]);
  }
  const name = nameParts.join(' ').trim();
  return {
    name: name || String(rawName ?? '').trim(), pos, gk, team, extras,
    changed: !!name && (!!pos || !!team) && name !== String(rawName ?? '').trim(),
  };
}

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
    club: {
      name: '웃을산 FC', teamNames: { ...DEFAULT_TEAM_NAMES },
      teamAliases: { ...DEFAULT_TEAM_ALIASES },
      mixedTeams: ['D'], lockWomen: true,   // 체육(D)이 혼성팀 (사장님 확정)
      coaches: { A: null, B: null, C: null, D: null }, // 팀별 감독 memberId (단일 출처)
    },
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
/**
 * 일괄 추가 한 줄 파싱.
 *   "홍길동" / "홍길동 90" / "김철수,1988" / "이영희 92 여"
 *   "교 진혜린 95 여 포워드" / "정지원 96 여 레프트 윙" / "정성현 85 남 센터백"
 * 순서 무관. 줄 맨 앞의 팀 약자(팀 이름 첫 글자 또는 팀 이름 전체)는 team 으로 읽는다.
 * @param {string} line
 * @param {{teamNames?:Object}} opts  { A:'교역', B:'장년', ... } 형태면 약자 매칭에 쓴다
 */
export function parseMemberLine(line, opts = {}) {
  const raw = String(line ?? '').trim();
  if (!raw) return null;
  const tokens = raw.split(/[\s,/()·|\t]+/).filter(Boolean);

  const nameParts = [];
  let birthYear = null; let gender = null; let pos = null; let gk = false; let team = null;
  const extraPos = [];

  // 줄 맨 앞 팀 약자 ("체" / "체육" / "D")
  let unknownTeam = null;
  if (tokens.length > 1) {
    const t0 = String(tokens[0]).trim();
    const hit = matchTeamToken(t0, opts);
    if (hit) { team = hit; tokens.shift(); }
    else if (t0.length === 1 && !/^\d+$/.test(t0) && !parseGender(t0) && !parsePositionToken(t0)) {
      // 한 글자인데 어느 팀도 아닌 토큰: 성(姓)이면 이름으로 두고("홍 길동"), 아니면 빼고 알려 준다.
      // 두 글자 이상은 이름일 가능성이 커서 절대 건드리지 않는다("한별 95 남 골키퍼").
      const restHasName = tokens.slice(1).some((x) => x.length >= 2 && !/^\d+$/.test(x) && !parsePositionToken(x));
      if (restHasName && !COMMON_SURNAMES.has(t0)) { unknownTeam = t0; tokens.shift(); }
    }
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    if (birthYear == null && /^(\d{2}|\d{4})$/.test(tok)) {
      const y = parseBirthYear(tok);
      if (y) { birthYear = y; continue; }
    }
    if (gender == null) {
      const g = parseGender(tok);
      if (g) { gender = g; continue; }
    }
    const ph = matchPositionAt(tokens, i);
    if (ph) {
      if (ph.pos) {
        if (!pos) { pos = ph.pos; gk = ph.gk; }
        else { extraPos.push(ph.pos); if (ph.gk) gk = true; }
      }
      i += ph.consumed - 1;
      continue;
    }
    nameParts.push(tok);
  }

  const name = nameParts.join(' ').replace(/\s+/g, ' ').trim();
  return { name, birthYear, gender, pos, gk, team, unknownTeam, extraPos };
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
    const savedNames = raw?.club?.teamNames || null;
    // v0.5.3 까지의 기본 이름(A팀~D팀)을 그대로 쓰고 있었다면 새 기본값(교역/장년/청년/체육)으로 올린다.
    const untouched = !savedNames
      || TEAM_KEYS.every((k) => !savedNames[k] || savedNames[k] === OLD_DEFAULT_TEAM_NAMES[k]);
    s.club.teamNames = untouched
      ? { ...DEFAULT_TEAM_NAMES }
      : Object.assign({ ...DEFAULT_TEAM_NAMES }, savedNames);
    s.club.teamAliases = Object.fromEntries(TEAM_KEYS.map((k) => {
      const v = raw?.club?.teamAliases?.[k];
      const clean = typeof v === 'string' ? v.trim().slice(0, 2) : '';
      return [k, clean || DEFAULT_TEAM_ALIASES[k]];
    }));
    // 혼성팀: 저장된 값이 없으면 체육(D)을 기본 혼성팀으로 (사장님 확정)
    s.club.mixedTeams = Array.isArray(raw?.club?.mixedTeams)
      ? raw.club.mixedTeams.filter((k) => TEAM_KEYS.includes(k))
      : ['D'];
    if (untouched && !raw?.club?.mixedTeams?.length) s.club.mixedTeams = ['D'];
    s.club.lockWomen = raw?.club?.lockWomen !== false; // 기본 ON
    s.club.coaches = Object.fromEntries(TEAM_KEYS.map((k) => {
      const v = raw?.club?.coaches?.[k];
      return [k, typeof v === 'string' && v ? v : null];
    }));
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
      // 평가 메타 — 3단계에서 감독 uid 가 들어갈 자리 (지금은 'owner')
      skillUpdatedAt: m.skillUpdatedAt || null,
      skillUpdatedBy: m.skillUpdatedBy || null,
      abilUpdatedAt: m.abilUpdatedAt || null,
      abilUpdatedBy: m.abilUpdatedBy || null,
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
        const teamNames = state.club?.teamNames || null;
        const teamAliases = api.club.teamAliases();
        const expand = (raw) => {
          const line = String(raw ?? '').trim();
          if (!line) return [];
          // "김철수, 이영희" 처럼 콤마로 여러 명을 적은 줄과
          // "홍길동,90" / "이영희,여,미드" 처럼 한 명의 정보를 콤마로 적은 줄을 구분한다.
          if (line.includes(',')) {
            const pieces = line.split(',').map((x) => x.trim()).filter(Boolean);
            const parsedPieces = pieces.map((x) => parseMemberLine(x, { teamNames, teamAliases })).filter(Boolean);
            const everyHasName = parsedPieces.length >= 2 && parsedPieces.every((x) => x.name);
            if (everyHasName) return parsedPieces;      // 이름 목록
          }
          const parsed = parseMemberLine(line, { teamNames, teamAliases });
          return parsed && parsed.name ? [parsed] : [];
        };
        for (const raw of names) {
          for (const parsed of expand(raw)) {
            if (!parsed.name || seen.has(parsed.name)) continue;
            seen.add(parsed.name);
            const m = normalizeMember({ ...defaults, name: parsed.name,
              birthYear: parsed.birthYear ?? defaults.birthYear ?? null,
              gender: parsed.gender ?? defaults.gender ?? null,
              pos: parsed.pos ?? defaults.pos ?? 'MF',
              gk: parsed.gk || defaults.gk || false,
              team: parsed.team ?? defaults.team ?? null });
            state.members.push(m);
            added.push(m);
          }
        }
        touch();
        return added;
      },
      byTeam(key) { return state.members.filter((m) => m.active && m.team === key); },
      /** 종합 실력 평가 (누가 언제 고쳤는지 기록) */
      setSkill(id, skill, by = 'owner') {
        return api.members.update(id, { skill, skillUpdatedAt: new Date().toISOString(), skillUpdatedBy: by });
      },
      /** 간단 체크 평가 */
      setAbil(id, abil, by = 'owner') {
        const cur = api.members.byId(id);
        if (!cur) return null;
        return api.members.update(id, {
          abil: { ...cur.abil, ...abil },
          abilUpdatedAt: new Date().toISOString(), abilUpdatedBy: by,
        });
      },
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
        const c = state.club.coaches || {};
        for (const k of TEAM_KEYS) if (c[k] === id) c[k] = null;
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
      /** 팀 약자 (일괄 추가에서 줄 맨 앞에 쓰는 1~2글자) */
      teamAlias(key) { return state.club.teamAliases?.[key] || DEFAULT_TEAM_ALIASES[key] || key; },
      teamAliases() {
        return Object.fromEntries(TEAM_KEYS.map((k) => [k, api.club.teamAlias(k)]));
      },
      setTeamAlias(key, v) {
        if (!TEAM_KEYS.includes(key)) return;
        const clean = String(v ?? '').trim().slice(0, 2);
        state.club.teamAliases = { ...(state.club.teamAliases || {}), [key]: clean || DEFAULT_TEAM_ALIASES[key] };
        touch();
      },
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
      /** 팀 감독 (그 팀 소속 회원 1명, 없으면 null) */
      coach(key) { return state.club.coaches?.[key] || null; },
      coaches() { return { ...(state.club.coaches || {}) }; },
      setCoach(key, memberId) {
        if (!TEAM_KEYS.includes(key)) return;
        state.club.coaches = { ...(state.club.coaches || {}), [key]: memberId || null };
        touch();
      },
      /** 이 회원이 감독인 팀 키 (아니면 null) */
      coachTeamOf(memberId) {
        const c = state.club.coaches || {};
        return TEAM_KEYS.find((k) => c[k] && c[k] === memberId) || null;
      },
      /** 감독인데 그 팀 소속이 아닌 경우 목록 (안내용, 오류 아님) */
      coachMismatches() {
        const c = state.club.coaches || {};
        return TEAM_KEYS.filter((k) => c[k]).map((k) => {
          const m = state.members.find((x) => x.id === c[k]);
          if (!m) return { key: k, member: null, reason: 'missing' };
          if (!m.active) return { key: k, member: m, reason: 'inactive' };
          if (m.team !== k) return { key: k, member: m, reason: 'moved' };
          return null;
        }).filter(Boolean);
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
