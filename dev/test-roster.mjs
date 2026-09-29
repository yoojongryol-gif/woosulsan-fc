/* 명단 파서 · 이름 매칭 테스트 (node dev/test-roster.mjs)
 * v1.0(2026-09-29 S1): 혼성팀 고정·감독 지정 검증은 기능과 함께 내려갔다
 *   (dev/parked/test-teams-v0.7.mjs 참고). 여기에는 파서·매칭만 남는다. */
let pass = 0; let fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass += 1; console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail += 1; console.error(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
}
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { parseRoster, matchNames, looksLikeName, chosung } = await import('../roster.js');
const { createStore, parseMemberLine, parseGender } = await import('../store.js');

console.log('\n[1] 붙여넣기 파서');
// v0.6.1: 결과에 info(이름별 포지션 등)가 추가돼, 목록 비교는 세 구간만 본다
const P = (t) => { const r = parseRoster(t); return { in: r.in, out: r.out, maybe: r.maybe }; };
ok('① 카톡 투표 복붙', JSON.stringify(P('✅ 참석 (3)\n홍길동\n김철수\n이영희\n\n❌ 불참 (1)\n박민수'))
  === JSON.stringify({ in: ['홍길동', '김철수', '이영희'], out: ['박민수'], maybe: [] }));
ok('② 번호 한 줄', P('1. 홍길동 2. 김철수 3. 이영희').in.join() === '홍길동,김철수,이영희');
ok('③ 번호 줄바꿈', P('1. 홍길동\n2) 김철수\n③ 이영희').in.join() === '홍길동,김철수,이영희');
ok('④ 쉼표 나열', P('홍길동, 김철수, 이영희').in.length === 3);
ok('⑤ 접두 + 불참 섹션', JSON.stringify(P('참석: 홍길동, 김철수\n불참: 박민수'))
  === JSON.stringify({ in: ['홍길동', '김철수'], out: ['박민수'], maybe: [] }));
ok('⑥ 줄별 O/X/미정', JSON.stringify(P('홍길동 O\n김철수 X\n이영희 미정'))
  === JSON.stringify({ in: ['홍길동'], out: ['김철수'], maybe: ['이영희'] }));
ok('⑦ 괄호 주석 제거', P('홍길동(참석)\n김철수 (부상, 불참)').in.join() === '홍길동,김철수');
ok('⑧ 이모지·불릿', P('⚽홍길동\n- 김철수\n• 이영희').in.length === 3, P('⚽홍길동\n- 김철수\n• 이영희').in.join());
ok('⑨ 안내 문구 제외', P('이번주 경기 명단\n총 3명\n홍길동\n김철수').in.join() === '홍길동,김철수');
ok('⑩ 중복 제거', P('홍길동\n홍길동\n김철수').in.length === 2);
ok('⑪ 영문 이름', P('John Kim\nMike Park').in.length === 2);
ok('⑫ 빈 입력', JSON.stringify(P('')) === JSON.stringify({ in: [], out: [], maybe: [] }));
ok('⑬ 슬래시 나열', P('홍길동/김철수/이영희').in.length === 3);
ok('⑭ 참석/불참 헤더 여러 번', P('참석\n홍길동\n불참\n김철수\n참석\n이영희').in.join() === '홍길동,이영희');
ok('looksLikeName 필터', !looksLikeName('12') && !looksLikeName('참석') && looksLikeName('홍길동') && !looksLikeName('이번주 경기 명단'));
ok('초성 변환', chosung('홍길동') === 'ㅎㄱㄷ');

console.log('\n[2] 회원 매칭');
{
  const members = [
    { id: 'a', name: '홍길동', active: true },
    { id: 'b', name: '김철수', active: true },
    { id: 'c', name: '김철순', active: true },
    { id: 'd', name: '이 영희', active: true },
    { id: 'e', name: '박민수', active: false },
  ];
  const r = matchNames(['홍길동', '길동', '김철', '이영희', '최지우', '박민수'], members);
  ok('완전 일치', r[0].status === 'matched' && r[0].memberId === 'a');
  ok('성 제외 2글자 일치', r[1].status === 'matched' && r[1].memberId === 'a');
  ok('동명이인 후보 → multi', r[2].status === 'multi' && r[2].candidates.length === 2, r[2].candidates.map((c) => c.name).join('/'));
  ok('공백 무시 일치', r[3].status === 'matched' && r[3].memberId === 'd');
  ok('미등록 → none', r[4].status === 'none');
  ok('비활동 회원은 매칭 제외', r[5].status === 'none');
}

console.log('\n[3] 성별');
ok('성별 파싱', parseGender('여') === '여' && parseGender('F') === '여' && parseGender('남자') === '남' && parseGender('x') === null);
ok('일괄 줄 "이름 90 여"', (() => { const p = parseMemberLine('이영희 92 여'); return p.name === '이영희' && p.birthYear === 1992 && p.gender === '여'; })());
ok('순서 무관 "이름 여 90"', (() => { const p = parseMemberLine('이영희 여 92'); return p.name === '이영희' && p.birthYear === 1992 && p.gender === '여'; })());
ok('성별만', (() => { const p = parseMemberLine('김하나 F'); return p.name === '김하나' && p.gender === '여' && p.birthYear === null; })());
ok('둘 다 없음', (() => { const p = parseMemberLine('홍길동'); return p.name === '홍길동' && !p.gender && !p.birthYear; })());

const store = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
await store.init();
for (const n of ['여선수1', '여선수2', '여선수3']) store.members.add({ name: n, gender: '여' });
ok('성별 저장', store.members.all().filter((m) => m.gender === '여').length === 3);

console.log('\n[5] 마이그레이션 · JSON 왕복');
{
  const s2 = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await s2.init();
  await s2.importJSON(JSON.stringify({ members: [{ id: 'x', name: '옛회원', skill: 3 }], matches: [], tactics: [] }));
  ok('옛 데이터 성별 = 미입력', s2.members.all()[0].gender === null);
  ok('옛 데이터도 클럽 설정 기본값', s2.club.squadSize() === 11 && s2.club.rubric('male').speed.length === 5);

  const s3 = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await s3.init();
  await s3.importJSON(store.exportJSON());
  ok('JSON 왕복 — 성별 보존', s3.members.all().filter((m) => m.gender === '여').length === 3);
}

console.log('\n[v0.6.1] 명단 줄에 포지션·나이가 붙어 있어도 읽는다 (라이브 실측 재현, 가명)');
{
  const PL = (ln) => parseMemberLine(ln);
  const text = [
    '1. 한가람 포워드',
    '2. 윤다솜 87 여 미들',
    '3. 홍길동(골키퍼)',
    '4. 청 김철수 GK',
    '5. 서보라 레프트 윙',
    '6. 배준호 83 윙백',
    '7. 한별 오른쪽 윙',
  ].join('\n');
  const before = parseRoster(text);
  ok('수리 전 방식(파서 미주입)은 대부분 버림 — 재현', before.in.length <= 2, before.in.join(','));
  const r = parseRoster(text, { parseLine: PL });
  ok('7줄 모두 이름으로 읽음', r.in.length === 7, r.in.join(','));
  ok('이름만 남음', r.in.join(',') === '한가람,윤다솜,홍길동,김철수,서보라,배준호,한별', r.in.join(','));
  ok('포지션 정보 보존', r.info['한가람']?.pos === 'FW' && r.info['윤다솜']?.pos === 'MF'
    && r.info['서보라']?.pos === 'FW' && r.info['배준호']?.pos === 'DF' && r.info['한별']?.pos === 'FW',
    JSON.stringify(r.info));
  ok('GK 는 gk 표시까지', r.info['김철수']?.gk === true && r.info['김철수']?.pos === 'GK');
  ok('이름 앞 군더더기 한 글자는 떼고 이름만', r.in.includes('김철수') && !r.in.includes('청 김철수'));
  ok('나이·성별 보존', r.info['윤다솜']?.birthYear === 1987 && r.info['윤다솜']?.gender === '여');
  ok('괄호 안 포지션은 괄호 제거 규칙대로 이름만', r.in.includes('홍길동'));

  // 섹션·O/X 와 함께
  const r2 = parseRoster('참석\n한가람 포워드\n윤다솜 미들 O\n불참\n서보라 레프트 윙', { parseLine: PL });
  ok('섹션과 함께', r2.in.join(',') === '한가람,윤다솜' && r2.out.join(',') === '서보라', JSON.stringify({ in: r2.in, out: r2.out }));

  // 문장·잡음은 여전히 걸러진다
  const r3 = parseRoster('이번주 경기 명단입니다\n저 늦게 가요 공격 할게요\n한가람 포워드', { parseLine: PL });
  ok('안내 문장은 무시', r3.in.join(',') === '한가람', r3.in.join(','));

  // 쉼표로 쪼갠 조각이 정보 단어뿐이면 사람으로 세지 않는다
  const r4 = parseRoster('홍길동,85,골키퍼\n김철수, 미들\n이영희/여', { parseLine: PL });
  ok('정보 조각은 사람 아님 (골키퍼·미들·여)', r4.in.join(',') === '홍길동,김철수,이영희', r4.in.join(','));

  // 기존 회원과 매칭
  const st = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await st.init();
  ['한가람', '윤다솜', '홍길동', '김철수'].forEach((n) => st.members.add({ name: n }));
  const mm = matchNames(r.in, st.members.all());
  ok('기존 회원 4명 매칭', mm.filter((x) => x.status === 'matched').length === 4, mm.map((x) => x.input + ':' + x.status).join(' '));
  ok('새 회원 3명은 none', mm.filter((x) => x.status === 'none').length === 3);
}
console.log(`\n결과: ${pass} PASS / ${fail} FAIL\n`);
process.exit(fail ? 1 : 0);
