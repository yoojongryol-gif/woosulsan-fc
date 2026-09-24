/* v0.6.3 — 가져오기 테스트 (node dev/test-import.mjs)
 * 사장님(아이폰 홈화면 앱) "명단 JSON 가져오기가 안 됨" 대응.
 * 이름은 모두 가명.
 */
let pass = 0; let fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass += 1; console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail += 1; console.error(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
}
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const S = await import('../store.js');
const mk = async () => { const s = S.createStore({ load: async () => null, save: async () => true, clear: async () => {} }); await s.init(); return s; };

/* ---------- 원본 백업 (앱이 실제로 내보내는 형식) ---------- */
const src = await mk();
const NAMES = ['한가람', '윤다솜', '서보라', '문하늘', '오태경', '권민재', '배준호', '신동우', '홍길동', '김철수',
  '이영희', '박민수', '최정', '강한', '오세', '유리', '한별', '나래', '도윤'];
NAMES.forEach((n, i) => src.members.add({ name: n, team: ['A', 'B', 'C', 'D'][i % 4], pos: ['FW', 'MF', 'DF', 'GK'][i % 4], gk: i % 4 === 3, gender: i % 3 ? '남' : '여', birthYear: 1980 + i }));
const g0 = src.matches.add({ date: '2026-09-20', time: '20:00' });
src.members.all().forEach((m) => src.matches.setAttendance(g0.id, m.id, 'in'));
const pretty = src.exportJSON();
const obj = JSON.parse(pretty);

console.log('\n[1] 붙여넣기 변형 (라이브 v0.6.2 에서 d·e 가 실패했던 것)');
const V = {
  'a 압축 1줄': JSON.stringify(obj),
  'b 들여쓰기': pretty,
  'c BOM·앞뒤 공백·줄바꿈': '﻿\n\n   ' + pretty + '   \n\n',
  'd 스마트 따옴표': pretty.replace(/"([^"]*)"/g, '“$1”'),
  'e 제로폭·NBSP': pretty.replace(/: /g, ': ').replace(/,\n/g, ',​\n'),
  'f 코드펜스': '```json\n' + pretty + '\n```',
  'g 앞뒤 말': '백업입니다\n' + pretty + '\n잘 받으세요',
};
for (const [label, text] of Object.entries(V)) {
  const s = await mk();
  let r = null; let err = null;
  try { r = await s.importJSON(text, { merge: true }); } catch (e) { err = e.message; }
  ok(label, !err && s.members.all().length === 19, err || `${r.added}명 · 고침: ${r.fixed.join(',') || '없음'}`);
}

console.log('\n[2] 실패하면 위치와 앞뒤 글자를 알려 준다');
{
  const broken = pretty.replace('"members": [', '"members": [,');
  let msg = '';
  try { S.parseBackupText(broken); } catch (e) { msg = e.message; }
  ok('문법 오류 위치 표시', /\d+자 근처/.test(msg) && /▶,◀/.test(msg), msg.slice(0, 90));
  const cut = pretty.slice(0, Math.floor(pretty.length * 0.6));
  try { S.parseBackupText(cut); msg = ''; } catch (e) { msg = e.message; }
  ok('중간에 잘린 복사 감지', /중간에 끊겼습니다/.test(msg), msg.slice(0, 80));
  try { S.parseBackupText('{"hello":1,"world":[1,2]}'); msg = ''; } catch (e) { msg = e.message; }
  ok('회원 목록 없으면 있는 항목 표시', /members/.test(msg) && /hello, world/.test(msg), msg);
  try { S.parseBackupText('   '); msg = ''; } catch (e) { msg = e.message; }
  ok('빈 내용', /비어/.test(msg));
  ok('정상 JSON 은 오류 위치 -1', S.jsonErrorAt(pretty) === -1);
  ok('따옴표 모양은 값 안에서 보존(엄격 파싱 먼저)', (() => {
    const t = JSON.stringify({ data: { members: [{ name: '홍길동', memo: '“좋음”' }], matches: [], tactics: [] } });
    return S.parseBackupText(t).data.members[0].memo === '“좋음”';
  })());
}

console.log('\n[3] 합치기가 기본 — 직접 입력한 회원을 지키고 빈 칸만 채운다');
{
  const s = await mk();
  // 폰에 이미 직접 입력해 둔 청년팀 (일부 정보만)
  s.members.add({ name: '홍길동', team: 'C' });                     // 출생년도·성별 없음, 포지션 기본값
  s.members.add({ name: '김철수', team: 'C', pos: 'FW', birthYear: 2001, gender: '남' });   // 이미 다 있음
  s.members.add({ name: '새회원', team: 'C', pos: 'DF' });           // 백업에 없는 사람
  const pv = s.previewImport(pretty);
  ok('미리보기: 새로 17 · 이미 있음 2', pv.fresh === 17 && pv.existing === 2 && pv.current === 3, JSON.stringify(pv));
  const r = await s.importJSON(pretty, { merge: true });
  const hong = s.members.all().find((m) => m.name === '홍길동');
  const kim = s.members.all().find((m) => m.name === '김철수');
  ok('신규 17 · 보강 1 · 건너뜀 1', r.added === 17 && r.filled === 1 && r.skipped === 1, `${r.added}/${r.filled}/${r.skipped}`);
  ok('직접 입력한 회원 유지', !!s.members.all().find((m) => m.name === '새회원') && s.members.all().length === 20);
  ok('빈 칸만 채움 (홍길동: 출생년도·성별·포지션)', hong.birthYear === 1988 && !!hong.gender && hong.pos !== 'MF', `${hong.birthYear}/${hong.gender}/${hong.pos}`);
  ok('있는 값은 그대로 (홍길동 팀 C 유지)', hong.team === 'C');
  ok('있는 값은 그대로 (김철수 FW·2001·남 — 백업은 MF·1989·여)', kim.pos === 'FW' && kim.birthYear === 2001 && kim.gender === '남');
  ok('같은 이름은 중복으로 안 생김', s.members.all().filter((m) => m.name === '홍길동').length === 1);
  const g = s.matches.all().find((x) => x.date === '2026-09-20');
  ok('가져온 경기의 출석이 기존 회원 id 로 이어짐', !!g && g.attendance[hong.id] === 'in', g ? Object.keys(g.attendance).length + '명' : '경기 없음');
  ok('팀별 집계', r.byTeam.C >= 3, JSON.stringify(r.byTeam));
  const r2 = await s.importJSON(pretty, { merge: true });
  ok('같은 파일 두 번 = 신규 0', r2.added === 0 && s.members.all().length === 20);
}

console.log('\n[4] 전체 교체는 명시적으로만');
{
  const s = await mk();
  s.members.add({ name: '새회원' });
  await s.importJSON(pretty, { merge: false });
  ok('교체하면 기존 회원 사라짐', s.members.all().length === 19 && !s.members.all().some((m) => m.name === '새회원'));
}

console.log('\n[5] 명단 텍스트 가져오기 — 청년팀 실사용 형식 22줄 (가명)');
const YOUTH = [
  '청년 가온 03 남 왼쪽풀백', '청년 나린 01 남 오른쪽풀백', '청년 다온 00 여 왼쪽 윙,백', '청년 라온 02 남 미드,센터백',
  '청년 마루 99 남 공미', '청년 바다 98 남 수미', '청년 사랑 97 남 윙', '청년 아라 03 여 골키퍼',
  '청년 자람 01 남 포워드', '청년 차오 00 남 센터백', '청년 카이 02 여 미들', '청년 타미 03 남 오른쪽 윙',
  '청년 파랑 01 남 스트라이커', '청년 하늬 00 여 수비', '청년 가람 99 남 레프트백', '청년 너울 98 남 라이트백',
  '청년 다솜 03 여 윙', '청년 로운 02 남 공격수', '청년 미르 01 남 미드필더', '청년 보람 00 남 키퍼',
  '청년 새봄 03 여 왼쪽풀백', '청년 은솔 02 남 공미',
];
const WANT = {
  가온: ['DF', 2003, '남'], 나린: ['DF', 2001, '남'], 다온: ['FW', 2000, '여'], 라온: ['MF', 2002, '남'],
  마루: ['MF', 1999, '남'], 바다: ['MF', 1998, '남'], 사랑: ['FW', 1997, '남'], 아라: ['GK', 2003, '여'],
  자람: ['FW', 2001, '남'], 차오: ['DF', 2000, '남'], 카이: ['MF', 2002, '여'], 타미: ['FW', 2003, '남'],
  파랑: ['FW', 2001, '남'], 하늬: ['DF', 2000, '여'], 가람: ['DF', 1999, '남'], 너울: ['DF', 1998, '남'],
  다솜: ['FW', 2003, '여'], 로운: ['FW', 2002, '남'], 미르: ['MF', 2001, '남'], 보람: ['GK', 2000, '남'],
  새봄: ['DF', 2003, '여'], 은솔: ['MF', 2002, '남'],
};
const checkAll = (members, label) => {
  const bad = [];
  for (const [n, [pos, y, g]] of Object.entries(WANT)) {
    const m = members.find((x) => x.name === n);
    if (!m || m.pos !== pos || m.birthYear !== y || m.gender !== g || m.team !== 'C' || (pos === 'GK' && !m.gk)) {
      bad.push(`${n}:${m ? `${m.pos}/${m.birthYear}/${m.gender}/${m.team}/${m.gk}` : '없음'}`);
    }
  }
  ok(`${label} — 22줄 전부`, bad.length === 0 && members.length >= 22, bad.join(' ') || `${members.length}명`);
};
{
  const s = await mk();
  const r = s.importLines(YOUTH);
  checkAll(s.members.all(), '텍스트 가져오기');
  ok('신규 22', r.added === 22 && r.bad === 0);
  const r2 = s.importLines(YOUTH);
  ok('다시 넣으면 전부 건너뜀', r2.added === 0 && r2.skipped === 22 && s.members.all().length === 22);
  // 이미 이름만 있는 회원은 빈 칸 보강
  const s2 = await mk();
  s2.members.add({ name: '가온' }); s2.members.add({ name: '아라', team: 'C' });
  const r3 = s2.importLines(YOUTH);
  const ga = s2.members.all().find((m) => m.name === '가온');
  const ar = s2.members.all().find((m) => m.name === '아라');
  ok('이름만 있던 회원 보강', r3.filled === 2 && ga.pos === 'DF' && ga.birthYear === 2003 && ga.team === 'C'
    && ar.pos === 'GK' && ar.gk === true, `${r3.added}/${r3.filled}/${r3.skipped}`);
}
{
  const s = await mk();
  s.members.bulkAdd(YOUTH);
  checkAll(s.members.all(), '일괄 추가');
}
{
  // 회원 폼 이름 칸과 같은 분석기
  const O = { teamNames: { A: '교역', B: '장년', C: '청년', D: '체육' }, teamAliases: { A: '교', B: '장', C: '청', D: '체' } };
  const out = YOUTH.map((l) => ({ l, r: S.analyzeMemberName(l, O) }));
  const bad = out.filter(({ l, r }) => {
    const w = WANT[r.name];
    return !w || r.pos !== w[0] || r.birthYear !== w[1] || r.gender !== w[2] || r.team !== 'C' || (w[0] === 'GK' && !r.gk);
  }).map(({ l, r }) => `${l}→${r.name}/${r.pos}`);
  ok('회원 폼(이름 칸 분석) — 22줄 전부', bad.length === 0, bad.join(' '));
}

console.log('\n[6] 파서 경계');
{
  const P = (l) => S.parseMemberLine(l, { teamNames: { A: '교역', B: '장년', C: '청년', D: '체육' } });
  ok('쉼표 뒤 포지션은 무시 (윙,백 → FW)', P('홍길동 왼쪽 윙,백').pos === 'FW' && P('홍길동 왼쪽 윙,백').extraPos.join() === 'DF');
  ok('공백 윙 백 = 윙백(DF)는 유지', P('홍길동 윙 백').pos === 'DF');
  ok('붙여 쓴 수식어 (왼쪽풀백·우측수비)', P('홍길동 왼쪽풀백').pos === 'DF' && P('홍길동 우측수비').pos === 'DF');
  ok('성씨 "우"·"좌"는 떼지 않음 (우수비·좌미들 이름 보호)', P('우수비').name === '우수비' && P('좌미들').name === '좌미들');
  ok('2자리 00 = 2000년', P('홍길동 00').birthYear === 2000);
}

console.log(`\n결과: ${pass} PASS / ${fail} FAIL\n`);
process.exit(fail ? 1 : 0);
