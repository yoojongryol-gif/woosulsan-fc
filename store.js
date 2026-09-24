/* 축구&joy — 저장 계층 어댑터
 * 지금: localStorage 어댑터 1개.
 * 나중: 같은 인터페이스로 FirestoreAdapter 를 끼우면 앱 코드는 그대로.
 * 모든 메서드는 async — 원격 저장소로 바꿔도 호출부가 안 바뀌게.
 */

/** 버전 스탬프 — app.js 와 다르면 캐시가 섞인 것이므로 앱이 스스로 복구한다 */
export const MODULE_VERSION = 'v0.6.3';

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

/* ---------------- 평가 기준표 (v0.6.0, 2026-09-22 사장님) ----------------
 * "남자와 여자 기준이 달라야 되는데 기준을 잡아놓고 평가를 해야 될 듯"
 * - 남성 기준: 이 동호회 남성 회원들 사이의 비교
 * - 여성 기준: 여성 회원끼리 비교하되, 혼성 경기에서 어느 정도인지를 함께 적는다
 *   (예: 스피드 5 = 여성 중 최고 속도이고 남성 평균과 대등)
 * 각 줄은 22자 이내. 설정 → 평가 기준표에서 사장님이 고칠 수 있고, 기본값으로 되돌릴 수 있다.
 */
export const RUBRIC_GENDERS = [
  { key: 'male', label: '남성', badge: '남성 회원 기준' },
  { key: 'female', label: '여성', badge: '여성 회원 기준(혼성 경기)' },
];
export const DEFAULT_RUBRIC = {
  male: {
    speed: ['걷는 수준·쉽게 따라잡힘', '느리지만 위치로 보완', '팀 평균 속도', '빠름·역습 가담 가능', '팀 최고속·뒷공간 전담'],
    stamina: ['15분 후 급격히 처짐', '전반만 뛸 수 있음', '풀타임 무난', '후반에도 압박 유지', '연속 경기도 소화'],
    basic: ['트래핑 불안', '짧은 패스는 가능', '한쪽 발은 안정', '압박 속에서도 패스', '볼 키핑·공격 전환 주도'],
    shoot: ['골대 안에 넣기 어려움', '근거리만 마무리', '박스 안에서 정확', '중거리·감아차기 가능', '결정력 팀 1위'],
    defense: ['위치 잡기 어려움', '1:1에서 밀림', '기본 커버는 됨', '태클·가로채기 능숙', '수비 조직 지휘'],
    physical: ['몸싸움 회피', '몸싸움에서 밀림', '대등하게 버팀', '몸싸움 우위', '몸싸움 압도'],
  },
  female: {
    speed: ['걷는 수준·쉽게 따라잡힘', '여성 중 느린 편·위치로 보완', '여성 평균 속도', '여성 중 빠름·역습 가담', '여성 최고속·남성 평균과 대등'],
    stamina: ['15분 후 급격히 처짐', '전반만·여성 중 낮은 편', '여성 평균·풀타임 무난', '후반에도 압박 유지', '여성 최고·연속 경기 가능'],
    basic: ['트래핑 불안', '짧은 패스는 가능', '여성 평균·한쪽 발 안정', '압박 속에서도 패스 성공', '여성 최고·혼성서도 키핑'],
    shoot: ['골대 안에 넣기 어려움', '근거리만 마무리', '여성 평균·박스 안 정확', '중거리·감아차기 가능', '여성 최고·혼성서도 위협'],
    defense: ['위치 잡기 어려움', '1:1에서 밀림', '여성 평균·기본 커버', '태클·가로채기 능숙', '여성 최고·수비 조직 지휘'],
    physical: ['몸싸움 회피', '여성 중에도 밀림', '여성끼리는 대등', '여성 중 우위·혼성서 버팀', '여성 최고·남성과도 대등'],
  },
};
/* ---------------- 측정 기록 (v0.6.0, 2026-09-22 사장님) ----------------
 * "스피드·지구력은 각각 20미터 왕복 달리기와 1.5키로 달리기로"
 * 기록이 있으면 성별 기준표의 경계값으로 1~5 를 자동 환산해 넣는다(사람이 매기지 않는다).
 * 경계값은 동호회 성인 기준 초안이라, 첫 측정 뒤 사장님이 설정에서 조정하는 것을 전제로 한다.
 */
export const TESTS = [
  {
    key: 'shuttle20', abil: 'speed', label: '20m 왕복 달리기', unit: 'sec',
    hint: '20m 가서 찍고 돌아오기(총 40m)', placeholder: '예: 9.4', suffix: '초',
  },
  {
    key: 'run1500', abil: 'stamina', label: '1.5km 달리기', unit: 'mmss',
    hint: '', placeholder: '예: 7:20', suffix: '',
  },
];
export const TEST_KEYS = TESTS.map((t) => t.key);
/** abil 항목 → 측정 종목 (스피드·지구력만 있다) */
export function testForAbil(abilKey) { return TESTS.find((t) => t.abil === abilKey) || null; }

/** 5·4·3·2 등급의 상한선 (초). 이보다 느리면 1점. 작을수록 좋다. */
export const DEFAULT_TEST_THRESHOLDS = {
  shuttle20: { male: [8, 9, 10, 11.5], female: [9.5, 10.5, 11.5, 13] },
  run1500: { male: [360, 420, 480, 570], female: [450, 510, 585, 660] },
};
export function normalizeTestThresholds(raw) {
  const out = {};
  for (const t of TESTS) {
    out[t.key] = {};
    for (const g of ['male', 'female']) {
      const def = DEFAULT_TEST_THRESHOLDS[t.key][g];
      const got = Array.isArray(raw?.[t.key]?.[g]) ? raw[t.key][g] : null;
      const vals = def.map((d, i) => {
        const n = Number(got?.[i]);
        return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : d;
      });
      // 5→2 로 갈수록 느려져야 한다 (오름차순 보정)
      for (let i = 1; i < vals.length; i += 1) if (vals[i] <= vals[i - 1]) vals[i] = Math.round((vals[i - 1] + 0.1) * 10) / 10;
      out[t.key][g] = vals;
    }
  }
  return out;
}

/** "9.4" → 9.4초 / "7:20" → 440초 / "440" → 440초 (분:초는 콜론이 있을 때만) */
export function parseTestInput(testKey, raw) {
  const txt = String(raw ?? '').trim().replace(/\s/g, '');
  if (!txt) return null;
  if (txt.includes(':')) {
    const [mm, ss] = txt.split(':');
    const m = Number(mm); const sec = Number(ss);
    if (!Number.isFinite(m) || !Number.isFinite(sec) || sec >= 60 || m < 0 || sec < 0) return null;
    return Math.round((m * 60 + sec) * 10) / 10;
  }
  const n = Number(txt);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10) / 10;
}
/** 초 → 화면 표기 ("9.4초" / "7:20") */
export function formatTestValue(testKey, sec) {
  const n = Number(sec);
  if (!Number.isFinite(n)) return '';
  const t = TESTS.find((x) => x.key === testKey);
  if (t?.unit === 'mmss') {
    const m = Math.floor(n / 60);
    const r = Math.round(n - m * 60);
    return `${m}:${String(r).padStart(2, '0')}`;
  }
  return `${n.toFixed(1)}초`;   // 8 → "8.0초" (경계값 표기 통일)
}
/** 기록(초) → 1~5 점 */
export function scoreFromTest(testKey, sec, gender, thresholds) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return null;
  const g = rubricKeyFor(gender);
  const th = (thresholds || DEFAULT_TEST_THRESHOLDS)[testKey]?.[g] || DEFAULT_TEST_THRESHOLDS[testKey][g];
  if (n <= th[0]) return 5;
  if (n <= th[1]) return 4;
  if (n <= th[2]) return 3;
  if (n <= th[3]) return 2;
  return 1;
}
/** 기준표 한 줄에 끼워 넣을 경계 문구 — 예: "8.0초 이하", "9:30 초과" */
export function testBoundLabel(testKey, level, gender, thresholds) {
  const g = rubricKeyFor(gender);
  const th = (thresholds || DEFAULT_TEST_THRESHOLDS)[testKey]?.[g] || DEFAULT_TEST_THRESHOLDS[testKey][g];
  const i = Math.round(Number(level)) - 1;   // level 5 → index 0
  if (i < 0 || i > 4) return '';
  if (level === 1) return `${formatTestValue(testKey, th[3])} 초과`;
  return `${formatTestValue(testKey, th[5 - level])} 이하`;
}

export function normalizeTests(raw) {
  const out = {};
  for (const t of TESTS) {
    const got = raw?.[t.key];
    const sec = Number(got?.sec);
    out[t.key] = Number.isFinite(sec) && sec > 0
      ? { sec: Math.round(sec * 10) / 10, at: typeof got.at === 'string' ? got.at : null, manual: got.manual === true }
      : null;
  }
  return out;
}

/** 회원 성별 → 기준표 키 (미입력은 남성 기준으로 보되 화면에 "성별 미입력"을 표시한다) */
export function rubricKeyFor(gender) { return gender === '여' ? 'female' : 'male'; }

/** 저장된 값 + 기본값을 합쳐 6항목 × 5단계를 항상 채운 기준표로 만든다 */
export function normalizeRubric(raw) {
  const out = {};
  for (const g of RUBRIC_GENDERS) {
    out[g.key] = {};
    for (const k of ABILITY_KEYS) {
      const def = DEFAULT_RUBRIC[g.key][k];
      const got = raw?.[g.key]?.[k];
      out[g.key][k] = [0, 1, 2, 3, 4].map((i) => {
        const v = Array.isArray(got) ? got[i] : undefined;
        const clean = typeof v === 'string' ? v.trim().slice(0, 40) : '';
        return clean || def[i];
      });
    }
  }
  return out;
}

/* ---------------- 혼성 환산 계수 (v0.6.0) ----------------
 * 여성 점수는 "여성 기준" 으로 매겨지므로, 팀 전력을 남성 기준 한 자로 합칠 때
 * 여성 회원의 종합 실력에 곱할 값. 1.0 = 끄기(지금까지와 동일).
 */
/* 팀당 기본 인원 (v0.6.0 사장님: "축구 경기니 11대11이 기본 인원으로") */
export const SQUAD_SIZES = [5, 6, 7, 9, 11];
export const DEFAULT_SQUAD_SIZE = 11;
export function clampSquadSize(v) {
  const n = Math.round(Number(v));
  return SQUAD_SIZES.includes(n) ? n : DEFAULT_SQUAD_SIZE;
}

export const MIXED_FACTOR_MIN = 0.5;
export const MIXED_FACTOR_MAX = 1;
export function clampMixedFactor(v) {
  const n = Math.round(Number(v) * 10) / 10;
  if (!Number.isFinite(n)) return 1;
  return Math.min(MIXED_FACTOR_MAX, Math.max(MIXED_FACTOR_MIN, n));
}

/* ---------------- 포지션 토큰 ----------------
 * 사장님이 실제로 붙여넣는 형식: "교 한가람 95 여 포워드", "서보라 96 여 레프트 윙", "오태경 85 남 센터백"
 *  - 한 단어(포워드·미들·백·골키퍼)와 두 단어(레프트 윙·라이트 백·센터 백) 모두 인식
 *  - 레프트/라이트/센터/사이드는 수식어로 소비 (뒤 단어와 합쳐 판단)
 *  - 토큰이 "따로 떨어져 있을 때만" 인정 → "김수비" 같은 이름은 건드리지 않는다
 */
export const POS_TOKENS = {
  GK: ['gk', 'goalkeeper', 'goalie', 'keeper', '골키퍼', '골기퍼', '골키', '키퍼', '골리', '골', '수문장', '지키미'],
  DF: ['df', 'cb', 'lb', 'rb', 'wb', 'lwb', 'rwb', 'fb', 'sw', 'def', 'defender', '디펜더',
    '수비', '수비수', '백', '센터백', '센백', '풀백', '레프트백', '라이트백', '좌백', '우백',
    '사이드백', '윙백', '중앙수비', '센터수비', '측면수비', '스토퍼', '스위퍼'],
  MF: ['mf', 'cm', 'dm', 'am', 'cdm', 'cam', 'lm', 'rm', 'mid', 'midfielder',
    '미들', '미드', '미드필더', '미들필더', '중미', '센터미드', '중앙미드', '중앙', '허리', '링커', '중원',
    '수미', '공미', '볼란치', '수비형미드', '공격형미드', '수비형미드필더', '공격형미드필더'],
  FW: ['fw', 'st', 'cf', 'ss', 'lw', 'rw', 'lf', 'rf', 'striker', 'forward', 'winger',
    '포워드', '공격', '공격수', '스트라이커', '스트', '윙', '윙어', '측면공격',
    '윙포워드', '레프트윙', '라이트윙', '센터포워드', '최전방', '원톱', '투톱', '타겟맨', '타깃맨', '세컨톱', '섀도'],
};
/** 두 단어 포지션의 앞말 (레프트 윙 / 라이트 백 / 센터 백 …) */
export const POS_MODIFIERS = ['레프트', '라이트', '센터', '사이드', '중앙', '측면', '좌', '우',
  '오른쪽', '왼쪽', '오른', '왼', '우측', '좌측', '공격형', '수비형',
  'left', 'right', 'center', 'centre', 'side'];

const normTok = (t) => String(t ?? '').trim().toLowerCase().replace(/[.\-_]/g, '');

/** 붙여 쓸 수 있는 수식어 (두 글자 이상만 — 한 글자 "우·좌" 는 성씨일 수 있어 떼지 않는다) */
const GLUED_MODIFIERS = POS_MODIFIERS.map(normTok).filter((m) => m.length >= 2).sort((a, b) => b.length - a.length);

/** 토큰 1개 → { pos, gk } (아니면 null) */
export function parsePositionToken(tok) {
  const t = normTok(tok);
  if (!t) return null;
  for (const [pos, list] of Object.entries(POS_TOKENS)) {
    if (list.some((x) => normTok(x) === t)) return { pos, gk: pos === 'GK' };
  }
  // v0.6.3: "왼쪽풀백"·"오른쪽윙"·"우측수비" 처럼 수식어를 붙여 쓴 경우
  for (const mod of GLUED_MODIFIERS) {
    if (t.length > mod.length && t.startsWith(mod)) {
      const rest = t.slice(mod.length);
      for (const [pos, list] of Object.entries(POS_TOKENS)) {
        if (list.some((x) => normTok(x) === rest)) return { pos, gk: pos === 'GK' };
      }
    }
  }
  return null;
}
/** 쉼표·슬래시·괄호 경계 표시 (그 너머와는 두 단어 포지션으로 합치지 않는다) */
export const TOKEN_SEP = '\u0000';

/**
 * tokens[i] 부터 포지션을 읽는다 (두 단어 우선).
 * @returns {{pos:string|null, gk:boolean, consumed:number}|null}
 */
export function matchPositionAt(tokens, i) {
  const a = tokens[i];
  if (a === TOKEN_SEP) return { pos: null, gk: false, consumed: 1 };
  // "왼쪽 윙,백" 의 "윙" 과 "백" 은 쉼표로 갈라져 있으니 윙백으로 합치지 않는다
  const b = tokens[i + 1] === TOKEN_SEP ? undefined : tokens[i + 1];
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

/**
 * 이름 한 칸에 여러 정보가 들어간 경우를 분석한다 (정리 도구 / 회원 폼 공용).
 * @returns {{name, team, pos, gk, birthYear, gender, reasons:string[], glued:boolean, changed:boolean}}
 */
export function analyzeMemberName(rawName, opts = {}) {
  const raw = String(rawName ?? '').trim();
  const reasons = [];
  if (!raw) return { name: '', team: null, pos: null, gk: false, birthYear: null, gender: null, reasons, glued: false, changed: false };

  // 구분자가 섞였는지 먼저 본다 (쉼표·괄호·슬래시·이중 공백)
  if (/[,()/·|]/.test(raw)) reasons.push('구분기호');
  if (/\s{2,}/.test(raw)) reasons.push('공백');

  const parsed = parseMemberLine(raw, opts) || {};
  if (parsed.team) reasons.push('팀 약자');
  if (parsed.pos) reasons.push('포지션');
  if (parsed.gender) reasons.push('성별');
  if (parsed.birthYear) reasons.push('출생년도');

  let name = parsed.name || raw;
  let team = parsed.team || null;
  let glued = false;

  // 약자가 공백 없이 붙은 경우: "체한가람" → 체 + 한가람 (확인 후 적용)
  if (!team && /^[가-힣]{3,5}$/.test(raw)) {
    const aliases = opts.teamAliases || DEFAULT_TEAM_ALIASES;
    for (const k of TEAM_KEYS) {
      const a = String(aliases[k] || '').trim();
      if (!a || a.length !== 1 || !raw.startsWith(a)) continue;
      const rest = raw.slice(1);
      if (rest.length >= 2 && rest.length <= 4) {
        team = k; name = rest; glued = true; reasons.push('붙은 약자');
        break;
      }
    }
  }

  const changed = !!name && (name !== raw || !!team || !!parsed.pos || !!parsed.gender || !!parsed.birthYear);
  return {
    name: name.trim(), team, pos: parsed.pos || null, gk: !!parsed.gk,
    birthYear: parsed.birthYear || null, gender: parsed.gender || null,
    reasons, glued, changed,
  };
}

/** 이름 문자열에서 포지션 토큰만 떼어낸다 (기존 회원 정리 도구용) */
export function splitNamePosition(rawName, opts = {}) {
  const tokens = String(rawName ?? '').split(/[\s,/()·|]+/).filter(Boolean);
  const nameParts = [];
  let pos = null; let gk = false; let team = null; const extras = [];
  // 이름이 "체 한가람" 처럼 팀 약자로 시작하면 떼어낸다
  if (tokens.length > 1) {
    const hit = matchTeamToken(tokens[0], opts);
    if (hit) { team = hit; tokens.shift(); if (tokens[0] === TOKEN_SEP) tokens.shift(); }
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

/**
 * 종합 실력 (v0.5.6부터 자동)
 *  - 간단 체크 6항목 중 입력된 것들의 평균(소수 1자리)
 *  - 하나도 없으면 기존 수동 값(기본 3)을 그대로 쓴다 → 화면에는 "미평가"로 표시
 */
export function effectiveSkill(member) {
  const avg = abilAvg(member?.abil);
  if (avg != null) return avg;
  const n = Number(member?.skill);
  return Number.isFinite(n) ? n : 3;
}
/** 자동 평균이 아니라 예전 수동 값을 쓰는 중인가 */
export function isUnrated(member) { return abilAvg(member?.abil) == null; }

/**
 * 팀 전력 계산용 실력 (v0.6.0)
 * 여성 회원의 점수는 여성 기준이라, 혼성 환산 계수를 곱해 남성 기준 한 자로 맞춘다.
 * 계수 1.0 이면 종합 실력 그대로 → 기존 동작과 완전히 같다.
 */
export function weightedSkill(member, factor = 1) {
  const base = effectiveSkill(member);
  if (member?.gender !== '여') return base;
  return Math.round(base * clampMixedFactor(factor) * 10) / 10;
}

export function emptyState() {
  return {
    schema: SCHEMA_VERSION,
    club: {
      name: '웃을산 FC', teamNames: { ...DEFAULT_TEAM_NAMES },
      teamAliases: { ...DEFAULT_TEAM_ALIASES },
      mixedTeams: ['D'], lockWomen: true,   // 체육(D)이 혼성팀 (사장님 확정)
      rubric: normalizeRubric(null),        // 남/여 평가 기준표 (v0.6.0)
      tests: normalizeTestThresholds(null), // 측정 경계값 (v0.6.0)
      mixedFactor: 1,                       // 혼성 환산 계수 — 1.0 = 끔
      squadSize: DEFAULT_SQUAD_SIZE,        // 팀당 기본 인원 (11대11)
      coaches: { A: null, B: null, C: null, D: null }, // 팀별 감독 memberId (단일 출처)
    },
    members: [],
    matches: [],
    tactics: [],
    updatedAt: new Date().toISOString(),
  };
}

/** 연 나이 = 올해 - 출생년도 (만 나이 아님) */
/* ---------------- 백업 JSON 읽기 (v0.6.3) ----------------
 * 2026-09-23 사장님(아이폰 홈화면 앱) "명단 JSON 가져오기가 안 됨".
 * 라이브 실측: 스마트 따옴표(“ ”)나 채팅 앱이 끼워 넣는 제로폭 문자·NBSP 가 섞이면
 * "JSON 형식이 아닙니다." 한 줄만 뜨고 실패했다. 어디가 문제인지도 알 수 없었다.
 */
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;
/** 붙여넣은 글에서 안전하게 걷어낼 수 있는 것만 걷어낸다 (따옴표 모양은 건드리지 않음) */
export function cleanJSONText(raw) {
  let t = String(raw ?? '');
  t = t.replace(ZERO_WIDTH, '');                  // BOM · 제로폭 · 소프트 하이픈
  t = t.replace(/[\u00A0\u2007\u202F\u3000]/g, ' ');   // NBSP · 전각 공백 → 공백
  t = t.replace(/\r\n?/g, '\n').trim();
  t = t.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '').trim();   // 코드펜스
  // "백업입니다: {...} 감사합니다" 처럼 앞뒤에 말이 붙어 있으면 바깥 { } 만 남긴다
  const a = t.indexOf('{'); const b = t.lastIndexOf('}');
  if (a > 0 && b > a) t = t.slice(a, b + 1);
  else if (a > 0 && b < 0) t = t.slice(a);
  return t;
}
/** 문법 자리의 스마트 따옴표를 곧은 따옴표로 (엄격 파싱이 실패했을 때만 쓴다) */
export function straightenQuotes(t) {
  return String(t ?? '').replace(/[\u201C\u201D\u201E\u201F\u2033\u00AB\u00BB]/g, '"').replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'");
}
/** JSON 문법이 처음 어긋나는 위치 (정상이면 -1). 브라우저마다 오류 문구가 달라 직접 찾는다. */
export function jsonErrorAt(src) {
  const s = String(src ?? ''); const n = s.length; let i = 0;
  const WS = ' \t\n\r';
  const ws = () => { while (i < n && WS.includes(s[i])) i += 1; };
  const fail = () => { throw i; };
  const str = () => {
    i += 1;
    while (i < n) {
      const c = s[i];
      if (c === '"') { i += 1; return; }
      if (c === '\\') { i += 2; continue; }
      if (c < ' ') fail();
      i += 1;
    }
    fail();
  };
  const value = () => {
    ws();
    const c = s[i];
    if (c === '{') {
      i += 1; ws();
      if (s[i] === '}') { i += 1; return; }
      for (;;) {
        ws(); if (s[i] !== '"') fail();
        str(); ws(); if (s[i] !== ':') fail();
        i += 1; value(); ws();
        if (s[i] === ',') { i += 1; continue; }
        if (s[i] === '}') { i += 1; return; }
        fail();
      }
    }
    if (c === '[') {
      i += 1; ws();
      if (s[i] === ']') { i += 1; return; }
      for (;;) {
        value(); ws();
        if (s[i] === ',') { i += 1; continue; }
        if (s[i] === ']') { i += 1; return; }
        fail();
      }
    }
    if (c === '"') { str(); return; }
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(s.slice(i, i + 64));
    if (m && m[0]) { i += m[0].length; return; }
    for (const lit of ['true', 'false', 'null']) if (s.startsWith(lit, i)) { i += lit.length; return; }
    fail();
  };
  try { value(); ws(); if (i < n) fail(); return -1; } catch (e) { if (typeof e === 'number') return Math.min(e, n); throw e; }
}
/** 사람이 읽을 오류 문구 */
function jsonErrorMessage(t) {
  const at = jsonErrorAt(t);
  if (at < 0) return 'JSON 형식이 아닙니다.';
  if (at >= t.length) {
    return `JSON 이 중간에 끊겼습니다 (${t.length}자까지 받음 · 끝이 "${t.slice(-20)}"). 처음부터 끝까지 다시 복사해 주세요.`;
  }
  const before = t.slice(Math.max(0, at - 20), at);
  const ch = t[at];
  const after = t.slice(at + 1, at + 21);
  const code = ch.charCodeAt(0);
  const what = code > 126 ? ` · 문제 글자 U+${code.toString(16).toUpperCase().padStart(4, '0')}` : '';
  return `JSON 형식이 아닙니다 (${at + 1}자 근처: …${before}▶${ch}◀${after}…${what})`;
}
/**
 * 붙여넣은 글 → 백업 데이터. 실패하면 위치가 담긴 오류를 던진다.
 * @returns {{data, fixed:string[]}}  fixed = 자동으로 고친 것들
 */
export function parseBackupText(raw) {
  const fixed = [];
  const original = String(raw ?? '');
  let t = cleanJSONText(original);
  if (t !== original.trim()) fixed.push('보이지 않는 문자·앞뒤 글');
  if (!t) throw new Error('내용이 비어 있습니다.');
  let parsed;
  try { parsed = JSON.parse(t); }
  catch (e1) {
    const t2 = straightenQuotes(t);
    try { parsed = JSON.parse(t2); fixed.push('스마트 따옴표'); t = t2; }
    catch (e2) { throw new Error(jsonErrorMessage(t2)); }
  }
  const data = parsed?.data && Array.isArray(parsed.data.members) ? parsed.data
    : Array.isArray(parsed?.members) ? parsed : null;
  if (!data) {
    const keys = parsed && typeof parsed === 'object' ? Object.keys(parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed) : [];
    throw new Error(`회원 목록(members)이 없는 파일입니다${keys.length ? ` (있는 항목: ${keys.slice(0, 8).join(', ')})` : ''}.`);
  }
  return { data, fixed };
}

/**
 * 기기 시간대 기준 "YYYY-MM-DD" (v0.6.2)
 * toISOString().slice(0,10) 은 UTC 라 한국 새벽 0~9시에는 전날(연초엔 전년도)로 잡혔다.
 * 날짜만 필요한 곳(오늘·경기 날짜·파일명)은 전부 이것을 쓴다. 측정일·수정시각 같은 순간은 ISO 그대로.
 */
export function localDateStr(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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
 *   "교 한가람 95 여 포워드" / "서보라 96 여 레프트 윙" / "오태경 85 남 센터백"
 * 순서 무관. 줄 맨 앞의 팀 약자(팀 이름 첫 글자 또는 팀 이름 전체)는 team 으로 읽는다.
 * @param {string} line
 * @param {{teamNames?:Object}} opts  { A:'교역', B:'장년', ... } 형태면 약자 매칭에 쓴다
 */
export function parseMemberLine(line, opts = {}) {
  const raw = String(line ?? '').trim();
  if (!raw) return null;
  // v0.6.3: 쉼표·슬래시·괄호 경계를 기억한다 ("왼쪽 윙,백" → 윙 / 백 따로, "미드,센터백" → 미드 먼저)
  const tokens = [];
  for (const seg of raw.split(/[,/()·|]+/)) {
    const words = seg.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    if (tokens.length) tokens.push(TOKEN_SEP);
    tokens.push(...words);
  }

  const nameParts = [];
  let birthYear = null; let gender = null; let pos = null; let gk = false; let team = null;
  const extraPos = [];

  // 줄 맨 앞 팀 약자 ("체" / "체육" / "D")
  let unknownTeam = null;
  if (tokens.filter((x) => x !== TOKEN_SEP).length > 1) {
    const t0 = String(tokens[0]).trim();
    const hit = matchTeamToken(t0, opts);
    if (hit) { team = hit; tokens.shift(); }
    else if (t0.length === 1 && !/^\d+$/.test(t0) && !parseGender(t0) && !parsePositionToken(t0)) {
      // 한 글자인데 어느 팀도 아닌 토큰: 성(姓)이면 이름으로 두고("홍 길동"), 아니면 빼고 알려 준다.
      // 두 글자 이상은 이름일 가능성이 커서 절대 건드리지 않는다("한별 95 남 골키퍼").
      const restHasName = tokens.slice(1).some((x) => x !== TOKEN_SEP && x.length >= 2 && !/^\d+$/.test(x) && !parsePositionToken(x));
      if (restHasName && !COMMON_SURNAMES.has(t0)) { unknownTeam = t0; tokens.shift(); if (tokens[0] === TOKEN_SEP) tokens.shift(); }
    }
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    if (tok === TOKEN_SEP) continue;
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
    // v0.6.0: 기준표는 저장된 문구를 살리고 빠진 칸만 기본값으로 채운다
    s.club.rubric = normalizeRubric(raw?.club?.rubric);
    s.club.tests = normalizeTestThresholds(raw?.club?.tests);
    s.club.mixedFactor = clampMixedFactor(raw?.club?.mixedFactor ?? 1);
    s.club.squadSize = clampSquadSize(raw?.club?.squadSize ?? DEFAULT_SQUAD_SIZE);
    s.club.coaches = Object.fromEntries(TEAM_KEYS.map((k) => {
      const v = raw?.club?.coaches?.[k];
      return [k, typeof v === 'string' && v ? v : null];
    }));
    s.members = Array.isArray(s.members) ? s.members.map(normalizeMember) : [];
    s.matches = Array.isArray(s.matches) ? s.matches.map(normalizeMatch) : [];
    s.tactics = Array.isArray(s.tactics) ? s.tactics : [];
    return s;
  }

  /** 기록이 있고 잠겨 있으면 그 항목 점수를 기록에서 다시 만든다 */
  function applyTestScore(member, test) {
    const rec = member.tests?.[test.key];
    if (!rec || rec.manual === true) return false;
    const score = scoreFromTest(test.key, rec.sec, member.gender, state.club?.tests);
    if (score == null) return false;
    member.abil = { ...(member.abil || {}), [test.abil]: score };
    return true;
  }

  function normalizeMember(m) {
    const abil = normalizeAbil(m.abil);
    const auto = abilAvg(abil);                    // 6항목 평균이 있으면 그게 종합 실력
    return {
      id: m.id || uid('m'),
      name: String(m.name ?? '').trim(),
      skill: auto != null ? clampSkill(auto) : clampSkill(m.skill),
      gk: !!m.gk,
      pos: ['FW', 'MF', 'DF', 'GK'].includes(m.pos) ? m.pos : 'MF',
      team: TEAM_KEYS.includes(m.team) ? m.team : null, // 고정 소속 팀 (없으면 미배정)
      birthYear: parseBirthYear(m.birthYear), // 선택 입력 (없으면 null)
      abil,                                   // 간단 체크 6항목 (미입력은 null)
      tests: normalizeTests(m.tests),         // 측정 기록 (v0.6.0)
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
      date: x.date || localDateStr(),
      time: x.time || '20:00',
      place: x.place || '',
      status: ['예정', '확정', '종료'].includes(x.status) ? x.status : '예정',
      // v0.6.0: 팀 수는 "미정(null)" 이 기본 — 팀 탭에서 확정할 때 채워진다
      teamCount: [2, 3, 4].includes(x.teamCount) ? x.teamCount : null,
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
    const n = Math.round(Number(v) * 10) / 10;   // 소수 1자리 (자동 평균이 3.7 처럼 나온다)
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
      /**
       * 측정 기록 저장 (v0.6.0) — 기록을 넣으면 성별 경계값으로 1~5 를 자동 환산해
       * abil.speed / abil.stamina 에 그대로 반영한다. sec 가 null 이면 기록 삭제.
       */
      setTest(id, testKey, sec, { at = null, by = 'owner' } = {}) {
        const m = api.members.byId(id);
        const t = TESTS.find((x) => x.key === testKey);
        if (!m || !t) return null;
        const now = new Date().toISOString();
        m.tests = normalizeTests(m.tests);
        if (sec == null) {
          m.tests[testKey] = null;
        } else {
          const n = Math.round(Number(sec) * 10) / 10;
          if (!Number.isFinite(n) || n <= 0) return null;
          m.tests[testKey] = { sec: n, at: at || now, manual: false };
        }
        applyTestScore(m, t);
        m.abilUpdatedAt = now; m.abilUpdatedBy = by;
        m.skillUpdatedAt = now; m.skillUpdatedBy = by;
        m.skill = clampSkill(abilAvg(m.abil) ?? m.skill);
        touch();
        return m;
      },
      /** 기록이 있어도 점수를 손으로 고칠 수 있게 잠금 해제 / 다시 잠금 */
      setTestManual(id, testKey, manual) {
        const m = api.members.byId(id);
        const t = TESTS.find((x) => x.key === testKey);
        if (!m || !t) return null;
        m.tests = normalizeTests(m.tests);
        if (!m.tests[testKey]) return null;
        m.tests[testKey].manual = manual === true;
        applyTestScore(m, t);
        m.skill = clampSkill(abilAvg(m.abil) ?? m.skill);
        touch();
        return m;
      },
      /** 기록이 잠겨 있으면(=자동) 그 항목은 손으로 못 고친다 */
      isTestLocked(id, abilKey) {
        const t = testForAbil(abilKey);
        if (!t) return false;
        const rec = api.members.byId(id)?.tests?.[t.key];
        return !!rec && rec.manual !== true;
      },
      /** 경계값이 바뀌면 기록이 있는 회원의 점수를 모두 다시 계산한다 */
      recomputeTestScores() {
        let changed = 0;
        for (const m of state.members) {
          m.tests = normalizeTests(m.tests);
          for (const t of TESTS) if (applyTestScore(m, t)) changed += 1;
          const avg = abilAvg(m.abil);
          if (avg != null) m.skill = clampSkill(avg);
        }
        return changed;
      },

      /** 종합 실력 직접 지정 — v0.5.6부터는 간단 체크가 비어 있을 때만 쓰인다(있으면 평균이 이긴다) */
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
        const today = localDateStr();   // 한국 새벽에도 오늘 경기가 '다가오는 경기'로 남도록 로컬 기준
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
      /** 클럽 이름 (앱 이름 APP_NAME 과는 다른 값) */
      name() { return state.club.name || '웃을산 FC'; },
      setName(v) {
        const clean = String(v ?? '').trim().slice(0, 20);
        state.club.name = clean || '웃을산 FC';
        touch();
      },
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
      /* ----- 평가 기준표 (v0.6.0) ----- */
      /** 한 성별의 기준표 전체 — gender 는 '남'/'여' 또는 'male'/'female' */
      rubric(gender = 'male') {
        const key = gender === 'female' || gender === 'male' ? gender : rubricKeyFor(gender);
        if (!state.club.rubric) state.club.rubric = normalizeRubric(null);
        return state.club.rubric[key];
      },
      /** 남/여 둘 다 */
      rubricAll() {
        if (!state.club.rubric) state.club.rubric = normalizeRubric(null);
        return state.club.rubric;
      },
      /** 한 줄 문구 (level 은 1~5). 측정 종목이 있는 항목은 경계값을 앞에 붙인다 */
      rubricText(itemKey, level, gender = 'male') {
        const rows = api.club.rubric(gender)?.[itemKey];
        const i = Math.round(Number(level)) - 1;
        const base = Array.isArray(rows) && rows[i] ? rows[i] : '';
        const t = testForAbil(itemKey);
        if (!t) return base;
        const bound = api.club.testBound(t.key, level, gender);
        return bound ? `${bound} · ${base}` : base;
      },
      /** 한 칸 수정 */
      setRubricText(genderKey, itemKey, level, text) {
        const g = genderKey === 'female' ? 'female' : 'male';
        if (!ABILITY_KEYS.includes(itemKey)) return;
        const i = Math.round(Number(level)) - 1;
        if (i < 0 || i > 4) return;
        if (!state.club.rubric) state.club.rubric = normalizeRubric(null);
        const clean = String(text ?? '').trim().slice(0, 40);
        state.club.rubric[g][itemKey][i] = clean || DEFAULT_RUBRIC[g][itemKey][i];
        touch();
      },
      /** 기본값으로 되돌리기 (genderKey 를 주면 그 성별만) */
      resetRubric(genderKey) {
        const fresh = normalizeRubric(null);
        if (genderKey === 'male' || genderKey === 'female') {
          if (!state.club.rubric) state.club.rubric = fresh;
          state.club.rubric[genderKey] = fresh[genderKey];
        } else {
          state.club.rubric = fresh;
        }
        touch();
      },
      /* ----- 측정 경계값 ----- */
      testThresholds() {
        if (!state.club.tests) state.club.tests = normalizeTestThresholds(null);
        return state.club.tests;
      },
      /** 한 경계값 수정 (level 5~2 → idx 0~3) */
      setTestThreshold(testKey, genderKey, idx, value) {
        const g = genderKey === 'female' ? 'female' : 'male';
        if (!TEST_KEYS.includes(testKey)) return;
        const i = Math.round(Number(idx));
        if (i < 0 || i > 3) return;
        const cur = api.club.testThresholds();
        const next = { ...cur, [testKey]: { ...cur[testKey], [g]: [...cur[testKey][g]] } };
        const n = Number(value);
        next[testKey][g][i] = Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : DEFAULT_TEST_THRESHOLDS[testKey][g][i];
        state.club.tests = normalizeTestThresholds(next);
        api.members.recomputeTestScores();
        touch();
      },
      resetTestThresholds() {
        state.club.tests = normalizeTestThresholds(null);
        api.members.recomputeTestScores();
        touch();
      },
      /** 기록 → 점수 (현재 경계값 기준) */
      scoreForTest(testKey, sec, gender) { return scoreFromTest(testKey, sec, gender, api.club.testThresholds()); },
      /** 기준표 한 줄에 붙일 경계 문구 */
      testBound(testKey, level, gender) { return testBoundLabel(testKey, level, gender, api.club.testThresholds()); },

      /** 팀당 기본 인원 */
      squadSize() { return clampSquadSize(state.club.squadSize ?? DEFAULT_SQUAD_SIZE); },
      setSquadSize(v) { state.club.squadSize = clampSquadSize(v); touch(); },

      /** 혼성 환산 계수 */
      mixedFactor() { return clampMixedFactor(state.club.mixedFactor ?? 1); },
      setMixedFactor(v) { state.club.mixedFactor = clampMixedFactor(v); touch(); },

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
      // app 필드는 표기용일 뿐이다 — importJSON 은 이 값을 보지 않으므로 옛 "웃을산 FC" 백업도 그대로 들어온다
      return JSON.stringify({ app: '축구&joy', exportedAt: new Date().toISOString(), data: state }, null, 2);
    },
    /** 가져오기 전에 무엇이 바뀔지 미리 센다 (저장 안 함) */
    previewImport(text) {
      const { data, fixed } = parseBackupText(text);
      const next = migrate(data);
      const byName = new Map(state.members.map((m) => [m.name.trim(), m]));
      let fresh = 0; let existing = 0;
      for (const m of next.members) (byName.has(m.name.trim()) ? existing += 1 : fresh += 1);
      return { total: next.members.length, fresh, existing, matches: next.matches.length, fixed, current: state.members.length };
    },
    /**
     * 백업 가져오기 (v0.6.3)
     *  - merge(기본으로 쓰는 쪽): 이름이 같은 회원은 그대로 두고 빈 칸(출생년도·성별·팀·포지션)만 채운다.
     *    처음 보는 회원·경기·전술만 추가. 클럽 설정(팀 이름·기준표 등)은 지금 것을 유지.
     *  - merge:false = 전체 교체 (앱 화면에서는 2단계 확인을 거쳐야만 호출된다)
     */
    async importJSON(text, { merge = false } = {}) {
      const { data, fixed } = parseBackupText(text);
      const next = migrate(data);
      const stat = { added: 0, filled: 0, skipped: 0, fixed, byTeam: {} };
      if (!merge) {
        state = migrate(data);
        stat.added = state.members.length;
      } else {
        const byName = new Map(state.members.map((m) => [m.name.trim(), m]));
        const usedIds = new Set(state.members.map((m) => m.id));
        const idMap = new Map();   // 들어온 id → 이 기기 id (같은 이름이면 기존 회원으로 잇는다)
        for (const inc of next.members) {
          const cur = byName.get(inc.name.trim());
          if (cur) {
            idMap.set(inc.id, cur.id);
            let changed = false;
            if (cur.birthYear == null && inc.birthYear != null) { cur.birthYear = inc.birthYear; changed = true; }
            if (!cur.gender && inc.gender) { cur.gender = inc.gender; changed = true; }
            if (!cur.team && inc.team) { cur.team = inc.team; changed = true; }
            // MF 는 입력하지 않았을 때의 기본값이라 빈 칸으로 본다
            if ((!cur.pos || cur.pos === 'MF') && inc.pos && inc.pos !== 'MF') {
              cur.pos = inc.pos; if (inc.pos === 'GK') cur.gk = true; changed = true;
            }
            if (changed) stat.filled += 1; else stat.skipped += 1;
          } else {
            const m = { ...inc };
            if (usedIds.has(m.id)) m.id = uid('m');
            usedIds.add(m.id);
            idMap.set(inc.id, m.id);
            state.members.push(m);
            byName.set(m.name.trim(), m);
            stat.added += 1;
          }
        }
        const remap = (id) => idMap.get(id) || id;
        const ids = new Set(state.matches.map((g) => g.id));
        for (const g of next.matches) {
          if (ids.has(g.id)) continue;
          const att = {};
          for (const [k, v] of Object.entries(g.attendance || {})) att[remap(k)] = v;
          state.matches.push({ ...g, attendance: att, teams: (g.teams || []).map((t) => t.map(remap)) });
        }
        const tids = new Set(state.tactics.map((t) => t.id));
        for (const t of next.tactics) {
          if (tids.has(t.id)) continue;
          state.tactics.push({ ...t, pins: (t.pins || []).map((pin) => ({ ...pin, memberId: remap(pin.memberId) })) });
        }
      }
      for (const m of state.members) { const k = m.team || 'none'; stat.byTeam[k] = (stat.byTeam[k] || 0) + 1; }
      await adapter.save(state);
      emit();
      return { members: state.members.length, matches: state.matches.length, ...stat };
    },

    /**
     * 명단 텍스트 가져오기 (v0.6.3) — 일괄 추가와 같은 줄 형식을 통째로.
     * 이미 있는 이름은 추가하지 않고, 빈 칸(출생년도·성별·팀·포지션)만 채운다.
     */
    importLines(lines, { teamNames = null, teamAliases = null } = {}) {
      const tn = teamNames || state.club?.teamNames || null;
      const ta = teamAliases || api.club.teamAliases();
      const byName = new Map(state.members.map((m) => [m.name.trim(), m]));
      const stat = { added: 0, filled: 0, skipped: 0, bad: 0, byTeam: {} };
      for (const raw of lines || []) {
        const line = String(raw ?? '').trim();
        if (!line) continue;
        const r = parseMemberLine(line, { teamNames: tn, teamAliases: ta });
        if (!r || !r.name) { stat.bad += 1; continue; }
        const cur = byName.get(r.name.trim());
        if (cur) {
          let changed = false;
          if (cur.birthYear == null && r.birthYear) { cur.birthYear = r.birthYear; changed = true; }
          if (!cur.gender && r.gender) { cur.gender = r.gender; changed = true; }
          if (!cur.team && r.team) { cur.team = r.team; changed = true; }
          if ((!cur.pos || cur.pos === 'MF') && r.pos && r.pos !== 'MF') { cur.pos = r.pos; if (r.gk) cur.gk = true; changed = true; }
          if (changed) stat.filled += 1; else stat.skipped += 1;
          continue;
        }
        const m = normalizeMember({ name: r.name, birthYear: r.birthYear ?? null, gender: r.gender ?? null,
          pos: r.pos || 'MF', gk: !!r.gk, team: r.team ?? null });
        state.members.push(m);
        byName.set(m.name.trim(), m);
        stat.added += 1;
      }
      for (const m of state.members) { const k = m.team || 'none'; stat.byTeam[k] = (stat.byTeam[k] || 0) + 1; }
      touch();
      return stat;
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
