/* 축구&joy — 참석 명단 붙여넣기 파서 (순수 함수, AI 없이 로컬 처리)
 * 카톡 투표 결과·댓글·메모 등 흔한 형식을 이름 토큰으로 정리하고 회원 명단과 매칭한다.
 */

/** 버전 스탬프 — app.js 와 다르면 캐시가 섞인 것이므로 앱이 스스로 복구한다 */
export const MODULE_VERSION = 'v0.6.3';

const SECTION_IN = /(참석|참가|참여|가능|오케이|ok|출석|^o$|^⭕|^✅)/i;
const SECTION_OUT = /(불참|못\s*감|못감|안\s*됨|불가|취소|^x$|^❌)/i;
const SECTION_MAYBE = /(미정|보류|반반|애매|늦음)/i;

/** 줄 앞뒤 장식 제거: 번호·불릿·이모지·괄호 주석·O/X 표시 */
function cleanToken(raw) {
  let s = String(raw || '');
  s = s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, ' '); // 이모지
  s = s.replace(/^[\s\-–—·•*>#]+/, '');            // 불릿
  s = s.replace(/^\(?\d+[.)\]]\s*/, '');            // 1. 1) (1)
  s = s.replace(/^[①-⑳]\s*/, '');
  s = s.replace(/\([^)]*\)/g, ' ');                 // (참석) (12) (남)
  s = s.replace(/\[[^\]]*\]/g, ' ');
  s = s.replace(/[:：]\s*$/, '');
  s = s.replace(/\s*[-–]\s*(참석|불참|미정|o|x)\s*$/i, '');
  s = s.replace(/\s+(o|x|0|ㅇ|ㄴ|참석|불참|미정)\s*$/i, ''); // 홍길동 O / 홍길동 참석
  s = s.replace(/[.,;·]+$/, '');
  return s.trim();
}

const NOISE = /(명단|투표|인원|합계|경기|시간|장소|공지|매니저|총무|이번주|다음주|오늘|내일|모임|회비|구장|운동장|참석자|불참자|여기|까지|신청)/;

/** 이름처럼 보이는가 (한글 2~5자 / 영문 2~20자, 숫자·키워드·문장 제외) */
export function looksLikeName(s) {
  const t = String(s || '').trim();
  if (!t || t.length > 20) return false;
  if (/^\d+$/.test(t)) return false;
  if (/^(참석|불참|미정|출석|가능|불가)$/i.test(t)) return false;
  if (NOISE.test(t)) return false;                       // 안내 문구 줄
  if (/^[a-zA-Z][a-zA-Z .'-]{1,19}$/.test(t)) return true;
  const compact = t.replace(/\s/g, '');
  if (!/^[가-힣]+$/.test(compact)) return false;          // 한글만
  if (compact.length < 2 || compact.length > 5) return false;
  return (t.match(/\s/g) || []).length <= 1;             // 공백은 1개까지 (성 이름)
}

/**
 * 붙여넣은 텍스트 → { in: [], out: [], maybe: [] }
 * - "참석:" / "불참:" / "✅ 참석 (12)" 같은 머리줄로 구간을 나눈다
 * - 한 줄 안에 "1. 홍길동 2. 김철수" 처럼 번호가 여럿이면 나눠 읽는다
 * - 쉼표·슬래시·가운뎃점으로도 나눈다
 */
export function parseRoster(text, { defaultSection = 'in', parseLine = null } = {}) {
  // info[이름] = { pos, gk, gender, birthYear, team } — 새 회원으로 추가할 때 그대로 쓴다 (v0.6.1)
  const out = { in: [], out: [], maybe: [], info: {} };
  const seen = { in: new Set(), out: new Set(), maybe: new Set() };
  let section = defaultSection;

  const lines = String(text || '').split(/\r?\n/);
  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;

    // 머리줄 판정: "참석 (12)", "✅참석", "불참:" 처럼 이름이 거의 없는 줄
    const head = line.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/\(\d+\)|\d+\s*명|[:：]/g, '').trim();
    // 머리줄 = 구분 키워드를 빼고 나면 이름이 남지 않는 줄 ("✅ 참석 (12)" O, "불참: 박민수" X)
    const rest = head
      .replace(/참석|참가|참여|가능|오케이|출석|불참|못\s*감|못감|안\s*됨|불가|취소|미정|보류|반반|애매|늦음|ok|[ox]/gi, '')
      .replace(/[\s\d명()[\]\-–—·•*>#:：]/g, '');
    const isHeadOnly = rest.length === 0
      && (SECTION_IN.test(head) || SECTION_OUT.test(head) || SECTION_MAYBE.test(head));
    if (isHeadOnly) {
      section = SECTION_OUT.test(head) ? 'out' : SECTION_MAYBE.test(head) ? 'maybe' : 'in';
      continue;
    }
    // "참석: 홍길동, 김철수" 처럼 접두 + 내용이 한 줄에 있는 경우
    const withPrefix = line.match(/^([^:：]{1,8})[:：]\s*(.+)$/);
    if (withPrefix && (SECTION_IN.test(withPrefix[1]) || SECTION_OUT.test(withPrefix[1]) || SECTION_MAYBE.test(withPrefix[1]))) {
      section = SECTION_OUT.test(withPrefix[1]) ? 'out' : SECTION_MAYBE.test(withPrefix[1]) ? 'maybe' : 'in';
      line = withPrefix[2];
    }

    // 줄 끝의 O/X 표시로 개별 상태 지정 (홍길동 O / 김철수 X)
    let lineSection = section;
    const mark = line.match(/\s(o|x|ㅇ|ㄴ|참석|불참|미정)\s*$/i);
    if (mark) {
      const v = mark[1].toLowerCase();
      lineSection = (v === 'x' || v === 'ㄴ' || v === '불참') ? 'out' : (v === '미정' ? 'maybe' : 'in');
    }

    // 괄호 주석은 쪼개기 전에 제거 ("김철수 (부상, 불참)")
    line = line.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ').trim();
    if (!line) continue;

    // 한 줄에 번호가 여러 개면 번호 기준으로 분리
    let parts;
    if ((line.match(/\d+\s*[.)]/g) || []).length >= 2) {
      parts = line.split(/\d+\s*[.)]\s*/);
    } else {
      parts = line.split(/[,،、/·|]+|\s{2,}/);
    }

    for (const part of parts) {
      let name = cleanToken(part);
      if (!name) continue;
      // v0.6.1: "한가람 95 여 포워드" 처럼 이름 뒤에 정보가 붙은 줄도 이름만 떼어 읽는다.
      // 예전에는 이런 줄이 "이름 같지 않다" 로 통째로 버려져 출석 체크에서 빠졌다.
      let info = null;
      if (!looksLikeName(name) && typeof parseLine === 'function') {
        const r = parseLine(name);
        if (r && r.name && looksLikeName(r.name)) {
          info = { pos: r.pos || null, gk: !!r.gk, gender: r.gender || null, birthYear: r.birthYear || null, team: r.team || null };
          name = r.name;
        }
      } else if (typeof parseLine === 'function') {
        // 이름처럼 보여도 팀 약자·포지션이 섞였을 수 있다 ("청 김철수", "김철수 GK")
        const r = parseLine(name);
        // "홍길동,85,골키퍼" 를 쉼표로 쪼개면 "골키퍼" 만 남는다 — 정보 단어뿐인 조각은 사람이 아니다
        if (r && !r.name && (r.pos || r.gender || r.birthYear || r.team)) continue;
        if (r && r.name && r.name !== name && looksLikeName(r.name)
          && (r.pos || r.team || r.gender || r.birthYear)) {
          info = { pos: r.pos || null, gk: !!r.gk, gender: r.gender || null, birthYear: r.birthYear || null, team: r.team || null };
          name = r.name;
        }
      }
      if (!looksLikeName(name)) continue;
      const key = name.replace(/\s/g, '');
      if (seen[lineSection].has(key)) continue;
      seen[lineSection].add(key);
      out[lineSection].push(name);
      if (info) out.info[name] = info;
    }
  }
  return out;
}

/* ---------------- 회원 매칭 ---------------- */
const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
export function chosung(s) {
  return String(s || '').split('').map((ch) => {
    const code = ch.charCodeAt(0) - 0xac00;
    if (code < 0 || code > 11171) return ch;
    return CHO[Math.floor(code / 588)];
  }).join('');
}
const norm = (s) => String(s || '').replace(/\s/g, '').toLowerCase();

/**
 * 파싱된 이름들을 회원 명단과 매칭.
 * 단계: 완전일치 → 공백제거 일치 → 성 제외(뒤 2글자) 일치 → 부분/초성 일치는 "후보"로만.
 * @returns {Array<{input, status:'matched'|'multi'|'none', memberId?, candidates:[{id,name}]}>}
 */
export function matchNames(names, members) {
  const active = members.filter((m) => m.active !== false);
  return names.map((input) => {
    const key = norm(input);
    const exact = active.filter((m) => m.name === input);
    if (exact.length === 1) return { input, status: 'matched', memberId: exact[0].id, candidates: [] };

    const byNorm = active.filter((m) => norm(m.name) === key);
    if (byNorm.length === 1) return { input, status: 'matched', memberId: byNorm[0].id, candidates: [] };
    if (byNorm.length > 1) return { input, status: 'multi', candidates: byNorm.map(brief) };

    // 성 제외 2글자 (홍길동 ↔ 길동)
    const tail = key.length >= 2 ? key.slice(-2) : key;
    const byTail = active.filter((m) => norm(m.name).slice(-2) === tail && Math.abs(norm(m.name).length - key.length) <= 1);
    if (byTail.length === 1) return { input, status: 'matched', memberId: byTail[0].id, candidates: [] };
    if (byTail.length > 1) return { input, status: 'multi', candidates: byTail.map(brief) };

    // 부분 일치 / 초성 일치는 후보로만 (자동 체크 금지)
    const loose = active.filter((m) => {
      const n = norm(m.name);
      return n.includes(key) || key.includes(n) || chosung(n) === chosung(key);
    });
    if (loose.length) return { input, status: 'multi', candidates: loose.map(brief) };
    return { input, status: 'none', candidates: [] };
  });
}
function brief(m) { return { id: m.id, name: m.name }; }
