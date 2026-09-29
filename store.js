/* 축구&joy — 저장 계층 어댑터
 * 지금: localStorage 어댑터 1개.
 * 나중: 같은 인터페이스로 FirestoreAdapter 를 끼우면 앱 코드는 그대로.
 * 모든 메서드는 async — 원격 저장소로 바꿔도 호출부가 안 바뀌게.
 */

/** 버전 스탬프 — app.js 와 다르면 캐시가 섞인 것이므로 앱이 스스로 복구한다 */
export const MODULE_VERSION = 'v1.1.0';

/* v1.0: 내부 팀(A~F) 구조를 걷어낸 스키마.
 * 2 → 3 올라갈 때 회원의 소속 팀(A~F), 클럽의 팀 목록·팀 순서·팀 약자·팀 이름,
 * 혼성팀·여성 고정·팀 감독, 경기의 팀 나누기 결과(팀 묶음 제안 상태)가 사라진다.
 * 올리기 직전 옛 데이터 전체를 LEGACY_BACKUP_KEY 에 통째로 넣어 두고(1회),
 * 화면에서 내려받기·복원을 할 수 있게 한다. → 데이터 손실 0.
 */
export const SCHEMA_VERSION = 3;

/** 마이그레이션 직전 자동 백업이 들어가는 자리 (앱 데이터와 다른 키) */
export const LEGACY_BACKUP_KEY = 'woosulsan-fc:backup-v0.7';

/** 흔한 한 글자 성 — 이름 앞에 한 글자가 떨어져 있어도 성이면 이름의 일부로 본다 ("홍 길동") */
const COMMON_SURNAMES = new Set(('김이박최정강조윤장임한오서신권황안송전홍유고문양손배백허남심노하곽성차주우구민류나진지엄채원천방공현함변염여추도소石마길연위표명기반왕琴옥육印맹제모남궁탁국여진어은편구용').split(''));

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

/* ---------------- 포메이션 (S2, 2026-09-29) ----------------
 * 상대팀 카드의 포메이션 선택(사장님 확정 5개 + 기타 직접입력)과
 * 경기 라인업의 "포지션별 목록 배치" 슬롯 구성에 공용으로 쓴다.
 * 정밀한 좌표 배치는 S3 전술보드에서 다룬다 — S2 는 목록만 만든다.
 */
export const FORMATION_PRESETS = ['4-4-2', '4-3-3', '3-5-2', '4-2-3-1', '5-3-2'];
const FORMATION_SLOT_MAP = {
  '4-4-2': ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'FW', 'FW'],
  '4-3-3': ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'FW', 'FW', 'FW'],
  '3-5-2': ['GK', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'MF', 'FW', 'FW'],
  '4-2-3-1': ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'MF', 'FW'],
  '5-3-2': ['GK', 'DF', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'FW', 'FW'],
};
/** 이름을 모르는/기타 포메이션이면 4-3-3 얼개로 자리만 채운다 */
export function formationSlots(name) {
  return FORMATION_SLOT_MAP[name] || FORMATION_SLOT_MAP['4-3-3'];
}

/* ---------------- 전술보드 좌표 (S3, 2026-09-29) ----------------
 * 좌표는 x·y 모두 0~100 의 %(퍼센트) — 화면의 .pitch-wrap 컨테이너 크기에 대한 비율이다
 * (CSS `left:${x}%;top:${y}%` 로 그대로 쓴다). 필드 SVG 자체의 viewBox 는 "0 0 100 150"
 * (가로 2 : 세로 3 비율)이지만, 컨테이너 높이가 그 비율을 그대로 따라가므로 %좌표가 곧
 * 필드 위의 실제 위치와 일치한다 — 화살표를 그 SVG 안에 그릴 때만 y 를 ×1.5 해서
 * viewBox 좌표로 바꾼다(app.js arrowsSVG).
 * 가운데 선(하프라인)은 %y = 50 — 우리(side='us')는 아래쪽 절반(50~100, 골문이 100 방향),
 * 상대(side='opp')는 위쪽 절반(0~50, 골문이 0 방향)에 자동 배치한다.
 * formationSlots() 와 같은 순서(GK 먼저, 이후 포메이션 문자열의 줄 순서)로 좌표를 낸다.
 */
export function layoutFormation(formation, side = 'us') {
  const rows = String(formation).split('-').map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n) && n > 0);
  const need = formationSlots(formation).length;
  const pts = [];
  pts.push({ x: 50, y: side === 'us' ? 94 : 6 });   // GK
  const from = side === 'us' ? 82 : 18;    // 골문 쪽 줄(수비)
  const to = side === 'us' ? 54 : 46;      // 하프라인 쪽 줄(공격) — 50(하프라인)을 넘지 않는다
  const useRows = rows.length ? rows : [need - 1];
  useRows.forEach((k, i) => {
    const y = useRows.length > 1 ? from + (i * (to - from)) / (useRows.length - 1) : (from + to) / 2;
    for (let j = 0; j < k; j += 1) {
      pts.push({ x: Math.round(((j + 1) * 100) / (k + 1)), y: Math.round(y) });
    }
  });
  // 알 수 없는 포메이션 등 자리 수가 안 맞으면 대기줄로 채우거나 잘라낸다 (자리 수 = formationSlots 길이 고정)
  while (pts.length < need) pts.push({ x: Math.round((pts.length * 100) / (need + 1)), y: side === 'us' ? 66 : 34 });
  return pts.slice(0, need);
}

/** 경기 라인업(slots: memberId[])을 보드용 "우리 핀"(좌표+회원)으로. 라인업이 없으면 빈 자리만 */
export function buildOurPins(formation, slots, findMember) {
  const coords = layoutFormation(formation, 'us');
  const labels = formationSlots(formation);
  const list = Array.isArray(slots) ? slots : [];
  return coords.map((c, i) => {
    const mid = list[i] || null;
    const mem = mid && typeof findMember === 'function' ? findMember(mid) : null;
    return { x: c.x, y: c.y, memberId: mid, name: mem ? mem.name : '', gk: labels[i] === 'GK' };
  });
}

/** 상대 포메이션 → 회색 점선 원 자동 배치(이름 없이 포지션 표식만) */
export function buildOppPins(formation) {
  const coords = layoutFormation(formation, 'opp');
  const labels = formationSlots(formation);
  return coords.map((c, i) => ({ x: c.x, y: c.y, pos: labels[i] || 'MF' }));
}

/** 세트피스 기본 배치 — 공 위치 + 힌트. "기본"이므로 전원 재배치는 하지 않는다(선수 배치는 감독이 손으로 조정) */
export const SET_PIECE_TEMPLATES = {
  'corner-left': { label: '코너킥 (좌)', ball: { x: 3, y: 5 }, hint: '좌측 코너 — 공격 진영' },
  'corner-right': { label: '코너킥 (우)', ball: { x: 97, y: 5 }, hint: '우측 코너 — 공격 진영' },
  freekick: { label: '프리킥', ball: { x: 50, y: 32 }, hint: '박스 앞 프리킥 기본 위치' },
  kickoff: { label: '킥오프', ball: { x: 50, y: 50 }, hint: '센터서클 킥오프' },
};

/* ---------------- 빠른 지시 프리셋 (경기 모드, S4, 2026-09-29) ----------------
 * 경기 모드에서 큰 버튼 6개를 누르면 화살표 묶음을 즉시 그려 넣는다(템플릿).
 * 좌표는 SET_PIECE_TEMPLATES 와 같은 0~100 % 좌표계 — 그대로 arrows 배열에 이어 붙인다
 * (되돌리기로 하나씩 지울 수 있으므로 "편집 가능"). 형태는 우리 진영(y>50) 기준 예시일 뿐,
 * 감독이 보고 바로 뜻을 알 수 있는 화살표 묶음이면 된다.
 */
export const QUICK_INSTRUCTION_PRESETS = {
  'press-up': {
    label: '압박 올려',
    arrows: [
      { x1: 25, y1: 88, x2: 25, y2: 60, style: 'solid' },
      { x1: 50, y1: 90, x2: 50, y2: 58, style: 'solid' },
      { x1: 75, y1: 88, x2: 75, y2: 60, style: 'solid' },
    ],
  },
  'drop-line': {
    label: '라인 내려',
    arrows: [
      { x1: 25, y1: 58, x2: 25, y2: 82, style: 'dashed' },
      { x1: 50, y1: 56, x2: 50, y2: 80, style: 'dashed' },
      { x1: 75, y1: 58, x2: 75, y2: 82, style: 'dashed' },
    ],
  },
  'switch-flank': {
    label: '측면 전환',
    arrows: [{ x1: 15, y1: 68, x2: 85, y2: 68, style: 'solid' }],
  },
  'narrow-defense': {
    label: '수비 좁혀',
    arrows: [
      { x1: 12, y1: 85, x2: 34, y2: 85, style: 'solid' },
      { x1: 88, y1: 85, x2: 66, y2: 85, style: 'solid' },
    ],
  },
  counter: {
    label: '역습',
    arrows: [
      { x1: 50, y1: 90, x2: 50, y2: 40, style: 'solid' },
      { x1: 50, y1: 40, x2: 30, y2: 15, style: 'solid' },
    ],
  },
  'build-up': {
    label: '후방 빌드업',
    arrows: [
      { x1: 30, y1: 90, x2: 50, y2: 78, style: 'dashed' },
      { x1: 70, y1: 90, x2: 50, y2: 78, style: 'dashed' },
    ],
  },
};

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
 * v1.0: 팀 약자 읽기는 사라졌다. 이름 앞에 떨어져 남은 한 글자는 parseMemberLine 이
 *       unknownLead 로 알려 주고, 여기서는 "군더더기"로 표시만 한다.
 * @returns {{name, pos, gk, birthYear, gender, reasons:string[], glued:boolean, changed:boolean}}
 */
export function analyzeMemberName(rawName, opts = {}) {
  const raw = String(rawName ?? '').trim();
  const reasons = [];
  if (!raw) return { name: '', pos: null, gk: false, birthYear: null, gender: null, reasons, glued: false, changed: false };

  // 구분자가 섞였는지 먼저 본다 (쉼표·괄호·슬래시·이중 공백)
  if (/[,()/·|]/.test(raw)) reasons.push('구분기호');
  if (/\s{2,}/.test(raw)) reasons.push('공백');

  const parsed = parseMemberLine(raw, opts) || {};
  if (parsed.unknownLead) reasons.push('앞 글자');
  if (parsed.pos) reasons.push('포지션');
  if (parsed.gender) reasons.push('성별');
  if (parsed.birthYear) reasons.push('출생년도');

  const name = parsed.name || raw;
  const changed = !!name && (name !== raw || !!parsed.pos || !!parsed.gender || !!parsed.birthYear);
  return {
    name: name.trim(), pos: parsed.pos || null, gk: !!parsed.gk,
    birthYear: parsed.birthYear || null, gender: parsed.gender || null,
    reasons, glued: false, changed,
  };
}

/** 이름 문자열에서 포지션 토큰만 떼어낸다 (기존 회원 정리 도구용) */
export function splitNamePosition(rawName, opts = {}) {
  const tokens = String(rawName ?? '').split(/[\s,/()·|]+/).filter(Boolean);
  const nameParts = [];
  let pos = null; let gk = false; const extras = [];
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
    name: name || String(rawName ?? '').trim(), pos, gk, extras,
    changed: !!name && !!pos && name !== String(rawName ?? '').trim(),
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

/* ---------------- 상대팀 카드 (S2, 2026-09-29) ----------------
 * opponent.record 는 손으로 넣지 않는다 — 경기 기록(match.result)에서 항상 다시 계산한다.
 */
export function normalizeOpponentNote(n) {
  const text = String(n?.text ?? '').trim().slice(0, 300);
  if (!text) return null;
  return { at: typeof n?.at === 'string' ? n.at : new Date().toISOString(), text };
}
export function normalizeOpponent(o) {
  return {
    id: o?.id || uid('o'),
    name: String(o?.name ?? '').trim().slice(0, 30),
    formation: typeof o?.formation === 'string' ? o.formation.trim().slice(0, 20) : '',
    keyPlayers: typeof o?.keyPlayers === 'string' ? o.keyPlayers.trim().slice(0, 500) : '',
    strengths: typeof o?.strengths === 'string' ? o.strengths.trim().slice(0, 500) : '',
    weaknesses: typeof o?.weaknesses === 'string' ? o.weaknesses.trim().slice(0, 500) : '',
    notes: Array.isArray(o?.notes) ? o.notes.map(normalizeOpponentNote).filter(Boolean) : [],
    // record 는 항상 계산값으로 덮인다(아래 computeRecordFor) — 여기서는 자리만 채운다
    record: { w: 0, d: 0, l: 0, gf: 0, ga: 0 },
    createdAt: o?.createdAt || new Date().toISOString(),
    updatedAt: o?.updatedAt || new Date().toISOString(),
  };
}
/** 경기 목록에서 한 상대의 전적을 다시 센다 — 직접 입력 금지 원칙 */
export function computeRecordFor(matches, opponentId) {
  const rec = { w: 0, d: 0, l: 0, gf: 0, ga: 0 };
  for (const g of matches || []) {
    if (g.opponentId !== opponentId || !g.result) continue;
    const gf = Number(g.result.gf); const ga = Number(g.result.ga);
    if (!Number.isFinite(gf) || !Number.isFinite(ga)) continue;
    rec.gf += gf; rec.ga += ga;
    if (gf > ga) rec.w += 1; else if (gf < ga) rec.l += 1; else rec.d += 1;
  }
  return rec;
}

/* ---------------- 훈련 — 드릴 라이브러리 (S5, 2026-09-29) ----------------
 * 마스터플랜 §7: 팀 훈련 드릴 초기 15개 + 직접 추가/수정/숨김.
 * 드릴은 "삭제"가 없다 — 지난 훈련 세션이 그 드릴을 참조하므로, 숨김(hidden)만 있다.
 * 숨긴 드릴도 이미 담긴 세션에는 그대로 남고(참조로 조회), 새로 담을 목록에서만 빠진다.
 */
export const DRILL_CATEGORIES = [
  { key: 'pass', label: '패스' },
  { key: 'press', label: '압박' },
  { key: 'transition', label: '전환' },
  { key: 'setpiece', label: '세트피스' },
  { key: 'fitness', label: '체력' },
  { key: 'gk', label: 'GK' },
];
export const DRILL_CATEGORY_KEYS = DRILL_CATEGORIES.map((c) => c.key);

/** 초기 15개 — id 를 고정해 두어 여러 기기에서 올려도(migrate) 중복 시딩되지 않는다 */
export const DEFAULT_DRILLS = [
  { id: 'dr_pass_01', category: 'pass', name: '삼각패스 로테이션', desc: '세 명이 삼각형을 이뤄 원터치 패스를 주고받는다. 위치를 계속 바꿔가며 패스 정확도와 시야를 기른다.', minutes: 15, players: '3인 이상', equipment: '콘 3개' },
  { id: 'dr_pass_02', category: 'pass', name: '론도 (볼 점유)', desc: '4~6명이 원 안의 수비 1~2명을 상대로 볼을 돌린다. 압박 속 패스 타이밍과 볼 컨트롤을 기른다.', minutes: 15, players: '5인 이상', equipment: '조끼 2벌' },
  { id: 'dr_pass_03', category: 'pass', name: '롱패스 정확도', desc: '20~30m 거리에서 지정된 표적(콘)으로 롱패스를 연습한다. 킥 정확도와 파워를 기른다.', minutes: 15, players: '2인 1조', equipment: '콘 4개' },
  { id: 'dr_press_01', category: 'press', name: '2대1 압박 게임', desc: '좁은 구역에서 공격 1명을 수비 2명이 협력 압박한다. 협력 수비와 즉각 전방 압박을 기른다.', minutes: 12, players: '3인 1조', equipment: '콘 4개' },
  { id: 'dr_press_02', category: 'press', name: '스위칭 압박 라인', desc: '수비 라인 전체가 신호에 맞춰 동시에 전진·후퇴하며 압박 타이밍을 맞춘다.', minutes: 15, players: '4인 이상', equipment: '콘 8개' },
  { id: 'dr_trans_01', category: 'transition', name: '역습 3대2', desc: '수비 상황에서 볼을 뺏으면 즉시 3명이 2명 수비를 상대로 빠른 역습을 전개한다.', minutes: 15, players: '5인 1조', equipment: '미니골 1개' },
  { id: 'dr_trans_02', category: 'transition', name: '공수 전환 셔틀', desc: '볼을 빼앗기면 즉시 되찾기 위해 전원이 반대 방향으로 전력 질주한다. 전환 속도를 기른다.', minutes: 12, players: '전체', equipment: '조끼 2벌' },
  { id: 'dr_setpiece_01', category: 'setpiece', name: '코너킥 마무리', desc: '지정된 코너킥 루틴대로 크로스를 올리고 지정 선수가 헤딩·발리로 마무리한다.', minutes: 15, players: '6인 이상', equipment: '미니골 1개' },
  { id: 'dr_setpiece_02', category: 'setpiece', name: '프리킥 직접 슈팅', desc: '박스 앞 지정 거리에서 수비벽을 세우고 직접 프리킥 슈팅을 반복한다. 감아차기와 파워킥을 번갈아 연습한다.', minutes: 15, players: '3인 이상', equipment: '미니골·조끼' },
  { id: 'dr_setpiece_03', category: 'setpiece', name: '박스 안 마무리 슈팅', desc: '크로스·컷백을 받아 박스 안에서 원터치·투터치로 마무리하는 슈팅 감각을 기른다.', minutes: 12, players: '4인 이상', equipment: '미니골 1개' },
  { id: 'dr_fitness_01', category: 'fitness', name: '20m 왕복 셔틀런', desc: '20m 구간을 신호에 맞춰 왕복 질주한다. 스피드·순발력 측정 종목과 같은 방식으로 훈련한다.', minutes: 10, players: '전체', equipment: '콘 2개' },
  { id: 'dr_fitness_02', category: 'fitness', name: '인터벌 러닝', desc: '1분 전력 질주 + 1분 걷기를 반복한다. 경기 후반 지구력을 기른다.', minutes: 15, players: '전체', equipment: '없음' },
  { id: 'dr_fitness_03', category: 'fitness', name: '사다리·콘 민첩성', desc: '어질리티 사다리와 지그재그 콘 드리블로 순발력과 방향전환 능력을 기른다.', minutes: 10, players: '개인 가능', equipment: '어질리티 사다리·콘 6개' },
  { id: 'dr_gk_01', category: 'gk', name: '반응 캐칭', desc: '짧은 거리에서 다양한 방향의 슈팅을 받아 반응 속도와 캐칭 안정성을 기른다.', minutes: 15, players: '골키퍼+슈터 1명', equipment: '공 10개' },
  { id: 'dr_gk_02', category: 'gk', name: '크로스 처리·배급', desc: '크로스를 잡거나 펀칭한 뒤 빠르게 역습 배급까지 이어가는 흐름을 연습한다.', minutes: 15, players: '골키퍼+2인', equipment: '공 8개' },
];

export function normalizeDrill(d) {
  const now = new Date().toISOString();
  const minutes = Math.round(Number(d?.minutes));
  return {
    id: d?.id || uid('dr'),
    category: DRILL_CATEGORY_KEYS.includes(d?.category) ? d.category : 'pass',
    name: String(d?.name ?? '').trim().slice(0, 40),
    desc: String(d?.desc ?? '').trim().slice(0, 200),
    minutes: Number.isFinite(minutes) && minutes > 0 ? Math.min(120, minutes) : 15,
    players: String(d?.players ?? '').trim().slice(0, 30),
    equipment: String(d?.equipment ?? '').trim().slice(0, 60),
    hidden: !!d?.hidden,
    createdAt: d?.createdAt || now,
    updatedAt: d?.updatedAt || now,
  };
}

/* ---------------- 훈련 — 팀 훈련 세션 (S5, 2026-09-29) ---------------- */
export function normalizeTrainingDrillRef(x) {
  const minutes = Math.round(Number(x?.minutes));
  return {
    drillId: typeof x?.drillId === 'string' && x.drillId ? x.drillId : null,
    minutes: Number.isFinite(minutes) && minutes > 0 ? Math.min(120, minutes) : 10,
  };
}
export function normalizeTrainingSession(x) {
  const now = new Date().toISOString();
  const total = Math.round(Number(x?.minutes));
  return {
    id: x?.id || uid('ts'),
    date: typeof x?.date === 'string' && x.date ? x.date : localDateStr(),
    theme: String(x?.theme ?? '').trim().slice(0, 40),
    minutes: Number.isFinite(total) && total > 0 ? Math.min(240, total) : 60,
    drills: Array.isArray(x?.drills) ? x.drills.map(normalizeTrainingDrillRef).filter((d) => d.drillId) : [],
    attendees: Array.isArray(x?.attendees) ? [...new Set(x.attendees.filter((id) => typeof id === 'string' && id))] : [],
    notes: typeof x?.notes === 'string' ? x.notes.trim().slice(0, 1000) : '',
    createdAt: x?.createdAt || now,
    updatedAt: x?.updatedAt || now,
  };
}
/** 세션에 담긴 드릴의 합계 분 (목표 minutes 와 별개로 화면에 비교 표시) */
export function trainingSessionDrillMinutes(ts) {
  return (ts?.drills || []).reduce((sum, d) => sum + (Number(d.minutes) || 0), 0);
}

/* ---------------- 훈련 — 개인 훈련 과제 (S5, 2026-09-29) ----------------
 * 회원 attrs(간단 체크 6항목) 하위 2항목 + tests(shuttle20/run1500) 를 근거로
 * 드릴을 규칙 기반(AI 아님)으로 추천한다 — recommendTasksFor().
 */
export function normalizePersonalTask(t) {
  const baseline = Number(t?.baseline);
  return {
    drillId: typeof t?.drillId === 'string' && t.drillId ? t.drillId : null,
    text: typeof t?.text === 'string' ? t.text.trim().slice(0, 120) : '',
    target: typeof t?.target === 'string' ? t.target.trim().slice(0, 60) : '',
    testKey: typeof t?.testKey === 'string' && TEST_KEYS.includes(t.testKey) ? t.testKey : null,
    baseline: Number.isFinite(baseline) && baseline > 0 ? baseline : null,
    done: !!t?.done,
    doneAt: typeof t?.doneAt === 'string' ? t.doneAt : null,
  };
}
/** dateStr 이 속한 주의 월요일 ("YYYY-MM-DD") */
export function weekMondayOf(dateStr) {
  const d = new Date(`${dateStr || localDateStr()}T00:00:00`);
  if (Number.isNaN(d.getTime())) return localDateStr();
  const day = d.getDay();   // 0=일 ~ 6=토
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return localDateStr(d);
}
export function currentWeekMonday() { return weekMondayOf(localDateStr()); }
/** "9월 22일 주" 표기 */
export function weekLabel(weekOf) {
  const d = new Date(`${weekOf}T00:00:00`);
  if (Number.isNaN(d.getTime())) return weekOf;
  return `${d.getMonth() + 1}월 ${d.getDate()}일 주`;
}
export function normalizePersonalPlan(x) {
  const now = new Date().toISOString();
  return {
    id: x?.id || uid('pp'),
    memberId: typeof x?.memberId === 'string' && x.memberId ? x.memberId : null,
    weekOf: typeof x?.weekOf === 'string' && x.weekOf ? weekMondayOf(x.weekOf) : currentWeekMonday(),
    tasks: Array.isArray(x?.tasks) ? x.tasks.map(normalizePersonalTask).filter((t) => t.drillId || t.text) : [],
    coachCheck: !!x?.coachCheck,
    createdAt: x?.createdAt || now,
    updatedAt: x?.updatedAt || now,
  };
}

/** 간단 체크 6항목 중 평가된 것 가운데 가장 낮은 n개 (미평가 항목은 후보에서 제외) */
export function weakestAbilities(member, n = 2) {
  const rated = ABILITY_KEYS.map((k) => ({ key: k, val: member?.abil?.[k] })).filter((x) => typeof x.val === 'number');
  if (!rated.length) return [];
  return [...rated].sort((a, b) => a.val - b.val).slice(0, n).map((x) => x.key);
}
/** 간단 체크 항목 → 드릴 카테고리 (규칙 기반 매핑) */
export const ABIL_DRILL_CATEGORY = {
  speed: 'fitness', stamina: 'fitness', basic: 'pass', shoot: 'setpiece', defense: 'press', physical: 'transition',
};
/**
 * 이번 주 과제 규칙 기반 추천 (AI 아님) — 저장하지 않고 과제 배열만 돌려준다.
 *  - 약점 2항목(weakestAbilities) → 매핑된 카테고리에서 드릴 1개씩
 *  - GK 회원이면 GK 카테고리 드릴을 우선 하나 포함
 *  - shuttle20/run1500 기록이 있으면 재측정 목표(현재 기록보다 살짝 빠른 값)를 과제로 추가
 */
export function recommendTasksFor(member, drills) {
  const weak = weakestAbilities(member, 2);
  const isGk = !!(member?.gk || member?.pos === 'GK');
  const cats = weak.length ? weak.map((k) => ABIL_DRILL_CATEGORY[k]) : ['fitness', 'pass'];
  if (isGk) cats.unshift('gk');
  const tasks = [];
  const used = new Set();
  for (const cat of cats) {
    const pool = (drills || []).filter((d) => !d.hidden && d.category === cat && !used.has(d.id));
    const pick = pool[0];
    if (pick) { used.add(pick.id); tasks.push(normalizePersonalTask({ drillId: pick.id })); }
  }
  for (const t of TESTS) {
    const rec = member?.tests?.[t.key];
    if (!rec || rec.sec == null) continue;
    const improved = t.unit === 'mmss' ? Math.max(60, Math.round(rec.sec - 8)) : Math.round((rec.sec - 0.3) * 10) / 10;
    tasks.push(normalizePersonalTask({
      text: `${t.label} 재측정`, target: `${formatTestValue(t.key, improved)} 이내 목표`,
      testKey: t.key, baseline: rec.sec,
    }));
  }
  return tasks.slice(0, 6);
}

export function emptyState() {
  return {
    schema: SCHEMA_VERSION,
    club: {
      name: '웃을산 FC',
      rubric: normalizeRubric(null),        // 남/여 평가 기준표 (v0.6.0)
      tests: normalizeTestThresholds(null), // 측정 경계값 (v0.6.0)
      squadSize: DEFAULT_SQUAD_SIZE,        // 한 팀 기본 인원 (11대11)
    },
    members: [],
    matches: [],
    opponents: [],   // 상대 클럽 카드 (S2에서 채운다 — v1.0은 자리만)
    tactics: [],
    drills: DEFAULT_DRILLS.map(normalizeDrill),   // 드릴 라이브러리 (S5) — 초기 15개
    trainingSessions: [],   // 팀 훈련 세션 (S5)
    personalPlans: [],      // 개인 훈련 과제 (S5)
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
 * 순서 무관. v1.0: 내부 팀(A~F)이 사라져 줄 맨 앞 팀 약자는 더 읽지 않는다.
 *   앞에 떨어져 있는 한 글자가 성(姓)이 아니면 군더더기로 보고 떼어 unknownLead 로 알려 준다.
 * @param {string} line
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
  let birthYear = null; let gender = null; let pos = null; let gk = false;
  const extraPos = [];

  // 줄 맨 앞에 떨어져 남은 한 글자 (옛 팀 약자 "체" 같은 것)
  let unknownLead = null;
  if (tokens.filter((x) => x !== TOKEN_SEP).length > 1) {
    const t0 = String(tokens[0]).trim();
    if (t0.length === 1 && !/^\d+$/.test(t0) && !parseGender(t0) && !parsePositionToken(t0)) {
      // 한 글자 토큰: 성(姓)이면 이름으로 두고("홍 길동"), 아니면 빼고 알려 준다.
      // 두 글자 이상은 이름일 가능성이 커서 절대 건드리지 않는다("한별 95 남 골키퍼").
      const restHasName = tokens.slice(1).some((x) => x !== TOKEN_SEP && x.length >= 2 && !/^\d+$/.test(x) && !parsePositionToken(x));
      if (restHasName && !COMMON_SURNAMES.has(t0)) { unknownLead = t0; tokens.shift(); if (tokens[0] === TOKEN_SEP) tokens.shift(); }
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
  return { name, birthYear, gender, pos, gk, unknownLead, extraPos };
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

/* ---------------- v1.0 마이그레이션 자동 백업 ----------------
 * 원칙: 스키마를 올리기 전에 옛 데이터를 통째로 한 번 남긴다. 이미 남아 있으면 덮어쓰지 않는다
 *       (두 번째 실행에서 "이미 올라간 데이터"로 백업이 갈아치워지면 되돌릴 게 없어진다).
 */
function readLegacyBackup() {
  try {
    const raw = globalThis.localStorage?.getItem(LEGACY_BACKUP_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (!j || typeof j !== 'object' || !j.data) return null;
    return { savedAt: j.savedAt || null, fromSchema: j.fromSchema ?? null, payload: j };
  } catch (e) { return null; }
}

function backupLegacyOnce(raw) {
  const from = Number(raw?.schema ?? (raw ? 1 : 0));
  if (!raw || !Array.isArray(raw.members) || from >= SCHEMA_VERSION) return readLegacyBackup();
  const already = readLegacyBackup();
  if (already) return already;
  const payload = {
    app: '축구&joy', backupOf: 'v0.7', fromSchema: from,
    savedAt: new Date().toISOString(), members: raw.members.length, data: raw,
  };
  try { globalThis.localStorage?.setItem(LEGACY_BACKUP_KEY, JSON.stringify(payload)); }
  catch (e) { console.warn('[store] v0.7 자동 백업 실패', e); return null; }
  return { savedAt: payload.savedAt, fromSchema: from, payload };
}

export function createStore(adapter = new LocalStorageAdapter()) {
  let state = emptyState();
  let legacy = null;        // v1.0 으로 올릴 때 남긴 자동 백업 정보
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
    // v1.0: 내부 팀 관련 설정(팀 이름·팀 목록·팀 약자·혼성팀·여성 고정·팀 감독·혼성 계수)은
    // 더 읽지 않는다. 옛 값은 자동 백업(LEGACY_BACKUP_KEY)에 통째로 남아 있다.
    s.club = {
      name: String(raw?.club?.name ?? '').trim() || '웃을산 FC',
      // v0.6.0: 기준표는 저장된 문구를 살리고 빠진 칸만 기본값으로 채운다
      rubric: normalizeRubric(raw?.club?.rubric),
      tests: normalizeTestThresholds(raw?.club?.tests),
      squadSize: clampSquadSize(raw?.club?.squadSize ?? DEFAULT_SQUAD_SIZE),
    };
    s.members = Array.isArray(s.members) ? s.members.map(normalizeMember) : [];
    s.matches = Array.isArray(s.matches) ? s.matches.map(normalizeMatch) : [];
    // S2: 상대 클럽 카드 — 전적은 항상 위 matches 에서 다시 계산한다(직접 입력값은 버린다)
    s.opponents = Array.isArray(raw?.opponents) ? raw.opponents.map(normalizeOpponent) : [];
    for (const o of s.opponents) o.record = computeRecordFor(s.matches, o.id);
    s.tactics = Array.isArray(s.tactics) ? s.tactics : [];
    // S5: 드릴은 한 번만 시딩한다 — 이미 저장된 목록(추가·수정·숨김 포함)이 있으면 그걸 쓴다
    s.drills = Array.isArray(s.drills) && s.drills.length ? s.drills.map(normalizeDrill) : DEFAULT_DRILLS.map(normalizeDrill);
    s.trainingSessions = Array.isArray(raw?.trainingSessions) ? raw.trainingSessions.map(normalizeTrainingSession) : [];
    s.personalPlans = Array.isArray(raw?.personalPlans) ? raw.personalPlans.map(normalizePersonalPlan).filter((p) => p.memberId) : [];
    return s;
  }

  /** 상대 전적을 경기 기록 기준으로 전부 다시 계산 (경기 추가·수정·삭제 뒤 호출) */
  function syncOpponentRecords() {
    for (const o of state.opponents) o.record = computeRecordFor(state.matches, o.id);
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

  /** 라인업 — { formation, slots: (memberId|null)[] }. 슬롯 수는 포메이션 얼개를 따른다 */
  function normalizeLineup(lu) {
    if (!lu || typeof lu !== 'object') return null;
    const formation = typeof lu.formation === 'string' && lu.formation ? lu.formation : FORMATION_PRESETS[0];
    const need = formationSlots(formation).length;
    const raw = Array.isArray(lu.slots) ? lu.slots : [];
    const slots = Array.from({ length: need }, (_, i) => (typeof raw[i] === 'string' ? raw[i] : null));
    return { formation, slots };
  }
  /** 결과 — 득/실은 음수 없는 정수로 고정. 숫자로 못 읽으면 결과 없음으로 취급 */
  function normalizeResult(r) {
    if (!r || typeof r !== 'object') return null;
    const gf = Number(r.gf); const ga = Number(r.ga);
    if (!Number.isFinite(gf) || !Number.isFinite(ga)) return null;
    return { gf: Math.max(0, Math.round(gf)), ga: Math.max(0, Math.round(ga)) };
  }
  /** 득점자 — { memberId, count, assistId } (S2: 득점자·도움 선택). count 1 미만은 1로 */
  function normalizeScorers(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((s) => ({
        memberId: typeof s?.memberId === 'string' ? s.memberId : null,
        count: Math.max(1, Math.round(Number(s?.count)) || 1),
        assistId: typeof s?.assistId === 'string' ? s.assistId : null,
      }))
      .filter((s) => s.memberId);
  }

  /** 교체 기록 — { minute?, out, in } (S4: 경기 모드에서 핀을 탭해 교체할 때 남긴다).
   * out/in 은 회원 id 문자열이어야 남는다(둘 다 없으면 버림). minute 은 선택 입력 — 숫자가
   * 아니면 null(분 모름 표기), 0~130 밖이면 클램프(연장전을 감안해 넉넉히 잡음). */
  function normalizeSubstitutions(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
      .slice(0, 200)
      .map((s) => {
        const minuteNum = Number(s?.minute);
        return {
          minute: Number.isFinite(minuteNum) ? Math.min(130, Math.max(0, Math.round(minuteNum))) : null,
          out: typeof s?.out === 'string' && s.out ? s.out : null,
          in: typeof s?.in === 'string' && s.in ? s.in : null,
        };
      })
      .filter((s) => s.out || s.in);
  }

  function normalizeMatch(x) {
    return {
      id: x.id || uid('g'),
      date: x.date || localDateStr(),
      time: x.time || '20:00',
      place: x.place || '',
      status: ['예정', '확정', '종료'].includes(x.status) ? x.status : '예정',
      attendance: x.attendance && typeof x.attendance === 'object' ? x.attendance : {},
      // v1.0: 내부 팀 나누기(팀 묶음 제안 상태·팀 수·팀 명단)는 사라졌다.
      home: x.home !== false,                        // S2: 홈/원정 (기본 홈)
      opponentId: typeof x.opponentId === 'string' && x.opponentId ? x.opponentId : null,
      lineup: normalizeLineup(x.lineup),              // S2/S3
      boardSnapshot: normalizeBoardSnapshot(x.boardSnapshot),   // S3: 전술보드 저장본
      substitutions: normalizeSubstitutions(x.substitutions),  // S4: 경기 모드 교체 기록
      result: normalizeResult(x.result),              // S2
      scorers: normalizeScorers(x.scorers),           // S2
      review: typeof x.review === 'string' ? x.review.slice(0, 1000) : '',   // S2
      createdAt: x.createdAt || new Date().toISOString(),
    };
  }

  /* ---------- 전술보드 스냅샷 (S3) ----------
   * 준비 모드에서 만든 배치를 경기에 첨부한다. 좌표는 x·y 모두 0~100 %(컨테이너 기준 CSS 퍼센트,
   * layoutFormation 주석 참고)로 고정 클램프한다. 알 수 없는/누락된 값은 버리므로
   * 옛 저장본이 깨져도 화면이 죽지 않는다.
   */
  function clampX(v) { const n = Number(v); return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0; }
  function clampY(v) { const n = Number(v); return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0; }
  function normalizeBoardPin(p, gkLabel) {
    return {
      x: clampX(p?.x), y: clampY(p?.y),
      memberId: typeof p?.memberId === 'string' ? p.memberId : null,
      name: typeof p?.name === 'string' ? p.name.slice(0, 40) : '',
      gk: gkLabel != null ? gkLabel === 'GK' : !!p?.gk,
    };
  }
  function normalizeOppPin(p, posLabel) {
    return { x: clampX(p?.x), y: clampY(p?.y), pos: posLabel || (['GK', 'DF', 'MF', 'FW'].includes(p?.pos) ? p.pos : 'MF') };
  }
  function normalizeBoardArrows(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, 80).map((a) => ({
      x1: clampX(a?.x1), y1: clampY(a?.y1), x2: clampX(a?.x2), y2: clampY(a?.y2),
      style: a?.style === 'dashed' ? 'dashed' : 'solid',
    }));
  }
  function normalizeBoardSnapshot(bs) {
    if (!bs || typeof bs !== 'object') return null;
    const formation = typeof bs.formation === 'string' && bs.formation ? bs.formation : FORMATION_PRESETS[0];
    const oppFormation = typeof bs.oppFormation === 'string' ? bs.oppFormation : '';
    const ourLabels = formationSlots(formation);
    const oppLabels = formationSlots(oppFormation || formation);
    const ourRaw = Array.isArray(bs.ourPins) ? bs.ourPins : [];
    const oppRaw = Array.isArray(bs.oppPins) ? bs.oppPins : [];
    return {
      formation,
      oppFormation,
      ourPins: ourLabels.map((lab, i) => normalizeBoardPin(ourRaw[i], lab)),
      oppPins: oppLabels.map((lab, i) => normalizeOppPin(oppRaw[i], lab)),
      arrows: normalizeBoardArrows(bs.arrows),
      ball: bs.ball && Number.isFinite(Number(bs.ball.x)) && Number.isFinite(Number(bs.ball.y))
        ? { x: clampX(bs.ball.x), y: clampY(bs.ball.y) } : null,
      setPiece: typeof bs.setPiece === 'string' ? bs.setPiece : null,
      updatedAt: bs.updatedAt || new Date().toISOString(),
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
      // v1.0 마이그레이션 직전 자동 백업 — 옛 데이터를 통째로 한 번 남긴다 (덮어쓰지 않는다)
      legacy = backupLegacyOnce(raw);
      state = migrate(raw);
      if (legacy) await adapter.save(state);   // 올린 결과를 바로 굳혀 둔다
      emit();
      return state;
    },
    /** v0.7 자동 백업 정보 (없으면 null) */
    legacyBackup() { return legacy; },
    /** 자동 백업을 읽어 그대로 되돌린다 (전체 교체) */
    async restoreLegacy() {
      const b = readLegacyBackup();
      if (!b) throw new Error('되돌릴 백업이 없습니다.');
      return api.importJSON(JSON.stringify(b.payload), { merge: false });
    },
    /** 백업 내려받기용 원문 */
    legacyBackupJSON() {
      const b = readLegacyBackup();
      return b ? JSON.stringify(b.payload, null, 2) : null;
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
          const line = String(raw ?? '').trim();
          if (!line) return [];
          // "김철수, 이영희" 처럼 콤마로 여러 명을 적은 줄과
          // "홍길동,90" / "이영희,여,미드" 처럼 한 명의 정보를 콤마로 적은 줄을 구분한다.
          if (line.includes(',')) {
            const pieces = line.split(',').map((x) => x.trim()).filter(Boolean);
            const parsedPieces = pieces.map((x) => parseMemberLine(x)).filter(Boolean);
            const everyHasName = parsedPieces.length >= 2 && parsedPieces.every((x) => x.name);
            if (everyHasName) return parsedPieces;      // 이름 목록
          }
          const parsed = parseMemberLine(line);
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
              gk: parsed.gk || defaults.gk || false });
            state.members.push(m);
            added.push(m);
          }
        }
        touch();
        return added;
      },
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
          if (g.lineup?.slots) g.lineup.slots = g.lineup.slots.map((x) => (x === id ? null : x));
          if (g.scorers?.length) {
            g.scorers = g.scorers.filter((s) => s.memberId !== id)
              .map((s) => (s.assistId === id ? { ...s, assistId: null } : s));
          }
          if (g.boardSnapshot?.ourPins?.length) {
            g.boardSnapshot.ourPins = g.boardSnapshot.ourPins.map((p) => (p.memberId === id ? { ...p, memberId: null, name: '' } : p));
          }
        }
        state.tactics = state.tactics.map((t) => ({
          ...t,
          pins: (t.pins || []).filter((p) => p.memberId !== id),
        }));
        // S5: 팀 훈련 참가자 목록에서는 빠진다(출석 표시의 연장선). 개인 훈련 과제는
        // 지워지지 않는다 — memberId 는 그대로 두고, 화면에서 찾지 못하면 "탈퇴 선수"로 표시한다
        // (substitutions·boardSnapshot 과 같은 데이터 손실 0 원칙).
        for (const ts of state.trainingSessions) {
          ts.attendees = ts.attendees.filter((x) => x !== id);
        }
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
        syncOpponentRecords();
        touch();
        return g;
      },
      update(id, patch) {
        const i = state.matches.findIndex((g) => g.id === id);
        if (i < 0) return null;
        state.matches[i] = normalizeMatch(Object.assign({}, state.matches[i], patch, { id }));
        syncOpponentRecords();
        touch();
        return state.matches[i];
      },
      remove(id) {
        state.matches = state.matches.filter((g) => g.id !== id);
        state.tactics = state.tactics.filter((t) => t.matchId !== id);
        syncOpponentRecords();
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
      /** 오늘 자리(세션) — 없으면 만든다. v1.0 우리팀 탭의 "오늘 출석"이 여기에 쌓인다 */
      today({ create = true } = {}) {
        const d = localDateStr();
        const found = state.matches.find((g) => g.date === d);
        if (found || !create) return found || null;
        return api.matches.add({ date: d, time: '20:00', place: '', status: '예정' });
      },
    },

    /* 상대팀 카드 (S2) */
    opponents: {
      all() { return state.opponents; },
      byId(id) { return state.opponents.find((o) => o.id === id) || null; },
      add(data) {
        const o = normalizeOpponent(data);
        o.record = computeRecordFor(state.matches, o.id);
        state.opponents.push(o);
        touch();
        return o;
      },
      update(id, patch) {
        const i = state.opponents.findIndex((o) => o.id === id);
        if (i < 0) return null;
        const merged = normalizeOpponent(Object.assign({}, state.opponents[i], patch, { id, updatedAt: new Date().toISOString() }));
        merged.record = computeRecordFor(state.matches, id);   // record 는 계산값 — patch 로 덮어쓸 수 없다
        state.opponents[i] = merged;
        touch();
        return state.opponents[i];
      },
      addNote(id, text) {
        const o = api.opponents.byId(id);
        const note = normalizeOpponentNote({ text });
        if (!o || !note) return null;
        o.notes = [...o.notes, note];
        touch();
        return o;
      },
      /** 카드를 지워도 경기 기록은 남긴다 — opponentId 연결만 해제(데이터 손실 0 원칙) */
      remove(id) {
        state.opponents = state.opponents.filter((o) => o.id !== id);
        for (const g of state.matches) if (g.opponentId === id) g.opponentId = null;
        touch();
      },
      /** 이 상대와 치른 경기 (최신순) */
      matchesOf(id) {
        return state.matches.filter((g) => g.opponentId === id)
          .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
      },
      recordLabel(o) {
        const r = o?.record || { w: 0, d: 0, l: 0, gf: 0, ga: 0 };
        const diff = r.gf - r.ga;
        return `${r.w}승 ${r.d}무 ${r.l}패 · 득실 ${diff > 0 ? '+' : ''}${diff}`;
      },
    },

    /* 드릴 라이브러리 (S5) — "삭제" 없음, 숨김만 */
    drills: {
      all() { return state.drills; },
      visible() { return state.drills.filter((d) => !d.hidden); },
      byCategory(cat) { return api.drills.visible().filter((d) => d.category === cat); },
      byId(id) { return state.drills.find((d) => d.id === id) || null; },
      add(data) {
        const d = normalizeDrill({ ...data, id: undefined });
        state.drills.push(d);
        touch();
        return d;
      },
      update(id, patch) {
        const i = state.drills.findIndex((d) => d.id === id);
        if (i < 0) return null;
        state.drills[i] = normalizeDrill(Object.assign({}, state.drills[i], patch, { id, updatedAt: new Date().toISOString() }));
        touch();
        return state.drills[i];
      },
      setHidden(id, hidden) { return api.drills.update(id, { hidden: !!hidden }); },
    },

    /* 팀 훈련 세션 (S5) */
    trainingSessions: {
      all() { return state.trainingSessions; },
      sorted() { return [...state.trainingSessions].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id)); },
      byId(id) { return state.trainingSessions.find((t) => t.id === id) || null; },
      add(data) {
        const t = normalizeTrainingSession(data);
        state.trainingSessions.push(t);
        touch();
        return t;
      },
      update(id, patch) {
        const i = state.trainingSessions.findIndex((t) => t.id === id);
        if (i < 0) return null;
        state.trainingSessions[i] = normalizeTrainingSession(Object.assign({}, state.trainingSessions[i], patch, { id, updatedAt: new Date().toISOString() }));
        touch();
        return state.trainingSessions[i];
      },
      remove(id) {
        state.trainingSessions = state.trainingSessions.filter((t) => t.id !== id);
        touch();
      },
    },

    /* 개인 훈련 과제 (S5) */
    personalPlans: {
      all() { return state.personalPlans; },
      byId(id) { return state.personalPlans.find((p) => p.id === id) || null; },
      /** 한 회원의 과제 이력 — 최신 주 먼저 */
      byMember(memberId) {
        return state.personalPlans.filter((p) => p.memberId === memberId).sort((a, b) => b.weekOf.localeCompare(a.weekOf));
      },
      /** 특정 주(기본 이번 주)의 과제 — 없으면 null */
      current(memberId, weekOf = currentWeekMonday()) {
        return state.personalPlans.find((p) => p.memberId === memberId && p.weekOf === weekOf) || null;
      },
      add(data) {
        const p = normalizePersonalPlan(data);
        state.personalPlans.push(p);
        touch();
        return p;
      },
      update(id, patch) {
        const i = state.personalPlans.findIndex((p) => p.id === id);
        if (i < 0) return null;
        state.personalPlans[i] = normalizePersonalPlan(Object.assign({}, state.personalPlans[i], patch, { id, updatedAt: new Date().toISOString() }));
        touch();
        return state.personalPlans[i];
      },
      remove(id) {
        state.personalPlans = state.personalPlans.filter((p) => p.id !== id);
        touch();
      },
      setTaskDone(planId, idx, done) {
        const p = api.personalPlans.byId(planId);
        if (!p || !p.tasks[idx]) return null;
        p.tasks[idx] = { ...p.tasks[idx], done: !!done, doneAt: done ? new Date().toISOString() : null };
        p.updatedAt = new Date().toISOString();
        touch();
        return p;
      },
      /** 규칙 기반 추천(AI 아님) — 저장하지 않고 과제 배열만 돌려준다 */
      recommend(memberId) {
        const m = api.members.byId(memberId);
        if (!m) return [];
        return recommendTasksFor(m, api.drills.visible());
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

      /** 한 팀 기본 인원 (라인업 기준) */
      squadSize() { return clampSquadSize(state.club.squadSize ?? DEFAULT_SQUAD_SIZE); },
      setSquadSize(v) { state.club.squadSize = clampSquadSize(v); touch(); },

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
      return { total: next.members.length, fresh, existing, matches: next.matches.length, opponents: next.opponents.length,
        trainingSessions: next.trainingSessions.length, personalPlans: next.personalPlans.length, fixed, current: state.members.length };
    },
    /**
     * 백업 가져오기 (v0.6.3)
     *  - merge(기본으로 쓰는 쪽): 이름이 같은 회원은 그대로 두고 빈 칸(출생년도·성별·포지션)만 채운다.
     *    처음 보는 회원·경기·전술만 추가. 클럽 설정(클럽명·기준표 등)은 지금 것을 유지.
     *  - merge:false = 전체 교체 (앱 화면에서는 2단계 확인을 거쳐야만 호출된다)
     */
    async importJSON(text, { merge = false } = {}) {
      const { data, fixed } = parseBackupText(text);
      const next = migrate(data);
      const stat = { added: 0, filled: 0, skipped: 0, fixed };
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

        // S2: 상대 클럽 카드 — 이름이 같으면 이어붙이고(빈 칸만 채움 + 메모는 중복 없이 합침), 처음 보는 것만 추가
        const oppByName = new Map(state.opponents.map((o) => [o.name.trim(), o]));
        const oppUsedIds = new Set(state.opponents.map((o) => o.id));
        const oppIdMap = new Map();
        for (const inc of next.opponents) {
          const cur = oppByName.get(inc.name.trim());
          if (cur) {
            oppIdMap.set(inc.id, cur.id);
            if (!cur.formation && inc.formation) cur.formation = inc.formation;
            if (!cur.keyPlayers && inc.keyPlayers) cur.keyPlayers = inc.keyPlayers;
            if (!cur.strengths && inc.strengths) cur.strengths = inc.strengths;
            if (!cur.weaknesses && inc.weaknesses) cur.weaknesses = inc.weaknesses;
            // 메모는 글 내용으로 중복을 본다 — 다른 기기에서 같은 순간에 적어도 시각(at)은 갈릴 수 있어서다
            const haveNotes = new Set(cur.notes.map((n) => n.text));
            for (const n of inc.notes) if (!haveNotes.has(n.text)) cur.notes.push(n);
          } else {
            const o = { ...inc };
            if (oppUsedIds.has(o.id)) o.id = uid('o');
            oppUsedIds.add(o.id);
            oppIdMap.set(inc.id, o.id);
            state.opponents.push(o);
            oppByName.set(o.name.trim(), o);
          }
        }
        const remapOpp = (id) => (id ? (oppIdMap.get(id) || id) : null);

        const ids = new Set(state.matches.map((g) => g.id));
        for (const g of next.matches) {
          if (ids.has(g.id)) continue;
          const att = {};
          for (const [k, v] of Object.entries(g.attendance || {})) att[remap(k)] = v;
          const lineup = g.lineup ? { formation: g.lineup.formation, slots: g.lineup.slots.map((s) => (s ? remap(s) : null)) } : null;
          const scorers = (g.scorers || []).map((s) => ({ ...s, memberId: remap(s.memberId), assistId: s.assistId ? remap(s.assistId) : null }));
          // S3: 보드 스냅샷도 회원 id 를 새 기기 기준으로 다시 잇는다(안 하면 "공석"으로 보여 데이터가 있어도 사라진 것처럼 보인다)
          const boardSnapshot = g.boardSnapshot ? {
            ...g.boardSnapshot,
            ourPins: g.boardSnapshot.ourPins.map((p) => (p.memberId ? { ...p, memberId: remap(p.memberId) } : p)),
          } : null;
          // S4: 교체 기록도 회원 id 를 새 기기 기준으로 다시 잇는다(안 하면 교체 상대가 안 보임)
          const substitutions = (g.substitutions || []).map((s) => ({
            ...s, out: s.out ? remap(s.out) : null, in: s.in ? remap(s.in) : null,
          }));
          state.matches.push({ ...g, attendance: att, opponentId: remapOpp(g.opponentId), lineup, scorers, boardSnapshot, substitutions });
        }
        const tids = new Set(state.tactics.map((t) => t.id));
        for (const t of next.tactics) {
          if (tids.has(t.id)) continue;
          state.tactics.push({ ...t, pins: (t.pins || []).map((pin) => ({ ...pin, memberId: remap(pin.memberId) })) });
        }

        // S5: 드릴 라이브러리 — id 로 합친다(기본 15개는 기기 간 id 가 같아 중복되지 않는다).
        // 이미 있는 id 는 그대로 두고(내용은 이 기기 것을 우선), 처음 보는 id 만 추가한다.
        const drillIds = new Set(state.drills.map((d) => d.id));
        const drillIdMap = new Map();
        for (const inc of next.drills) {
          if (drillIds.has(inc.id)) { drillIdMap.set(inc.id, inc.id); continue; }
          const d = { ...inc };
          drillIds.add(d.id);
          drillIdMap.set(inc.id, d.id);
          state.drills.push(d);
        }
        const remapDrill = (id) => (id ? (drillIdMap.get(id) || id) : null);

        // S5: 팀 훈련 세션 — id 로 합친다(처음 보는 세션만 추가). 회원·드릴 id 를 이 기기 기준으로 다시 잇는다
        const tsIds = new Set(state.trainingSessions.map((t) => t.id));
        for (const t of next.trainingSessions) {
          if (tsIds.has(t.id)) continue;
          state.trainingSessions.push({
            ...t,
            attendees: t.attendees.map((mid) => remap(mid)),
            drills: t.drills.map((dr) => ({ ...dr, drillId: remapDrill(dr.drillId) })),
          });
        }

        // S5: 개인 훈련 과제 — id 로 합친다(처음 보는 과제만 추가). 회원·드릴 id 를 다시 잇는다
        const ppIds = new Set(state.personalPlans.map((p) => p.id));
        for (const p of next.personalPlans) {
          if (ppIds.has(p.id)) continue;
          state.personalPlans.push({
            ...p,
            memberId: remap(p.memberId),
            tasks: p.tasks.map((t) => (t.drillId ? { ...t, drillId: remapDrill(t.drillId) } : t)),
          });
        }

        syncOpponentRecords();   // 새로 들어온/이어붙은 경기 기록으로 전적을 다시 센다
      }
      await adapter.save(state);
      emit();
      return { members: state.members.length, matches: state.matches.length, opponents: state.opponents.length,
        drills: state.drills.length, trainingSessions: state.trainingSessions.length, personalPlans: state.personalPlans.length, ...stat };
    },

    /**
     * 명단 텍스트 가져오기 (v0.6.3) — 일괄 추가와 같은 줄 형식을 통째로.
     * 이미 있는 이름은 추가하지 않고, 빈 칸(출생년도·성별·포지션)만 채운다.
     */
    importLines(lines) {
      const byName = new Map(state.members.map((m) => [m.name.trim(), m]));
      const stat = { added: 0, filled: 0, skipped: 0, bad: 0 };
      for (const raw of lines || []) {
        const line = String(raw ?? '').trim();
        if (!line) continue;
        const r = parseMemberLine(line);
        if (!r || !r.name) { stat.bad += 1; continue; }
        const cur = byName.get(r.name.trim());
        if (cur) {
          let changed = false;
          if (cur.birthYear == null && r.birthYear) { cur.birthYear = r.birthYear; changed = true; }
          if (!cur.gender && r.gender) { cur.gender = r.gender; changed = true; }
          if ((!cur.pos || cur.pos === 'MF') && r.pos && r.pos !== 'MF') { cur.pos = r.pos; if (r.gk) cur.gk = true; changed = true; }
          if (changed) stat.filled += 1; else stat.skipped += 1;
          continue;
        }
        const m = normalizeMember({ name: r.name, birthYear: r.birthYear ?? null, gender: r.gender ?? null,
          pos: r.pos || 'MF', gk: !!r.gk });
        state.members.push(m);
        byName.set(m.name.trim(), m);
        stat.added += 1;
      }
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
