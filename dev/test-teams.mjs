/* v0.7.0 — 팀 목록 가변화 · 학생팀 (node dev/test-teams.mjs) — 이름은 모두 가명 */
let pass = 0; let fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass += 1; console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail += 1; console.error(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
}
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const S = await import('../store.js');
const B = await import('../balance.js');
const mk = async (loaded = null) => {
  const s = S.createStore({ load: async () => loaded, save: async () => true, clear: async () => {} });
  await s.init(); return s;
};

console.log('\n[1] 마이그레이션 — 기존 4팀 데이터는 그대로, 학생(E) 추가');
{
  // v0.6.x 까지의 저장 형태 (teamOrder 없음, 4팀)
  const old = {
    schema: 2,
    club: { name: '웃을산 FC', teamNames: { A: '교역', B: '장년', C: '청년', D: '체육' }, teamAliases: { A: '교', B: '장', C: '청', D: '체' },
      mixedTeams: ['D'], lockWomen: true, coaches: { A: null, B: null, C: 'm2', D: null } },
    members: [
      { id: 'm1', name: '홍길동', team: 'A', pos: 'FW' },
      { id: 'm2', name: '김철수', team: 'C', pos: 'DF' },
      { id: 'm3', name: '이영희', team: 'D', pos: 'MF', gender: '여' },
    ],
    matches: [], tactics: [],
  };
  const s = await mk(old);
  ok('팀 5개 (교역·장년·청년·체육·학생)', S.TEAM_KEYS.join('') === 'ABCDE' && S.TEAM_KEYS.map((k) => s.club.teamName(k)).join('·') === '교역·장년·청년·체육·학생',
    S.TEAM_KEYS.map((k) => s.club.teamName(k)).join('·'));
  ok('학생 약자 = 학', s.club.teamAlias('E') === '학');
  ok('기존 회원 소속 그대로', s.members.byTeam('A')[0]?.name === '홍길동' && s.members.byTeam('C')[0]?.name === '김철수' && s.members.byTeam('D')[0]?.name === '이영희');
  ok('기존 감독·혼성 설정 그대로', s.club.coach('C') === 'm2' && s.club.isMixed('D') && !s.club.isMixed('E'));
  ok('팀 색 5개 (학생 새 색)', S.TEAM_COLORS.length === 5 && new Set(S.TEAM_COLORS).size === 5, S.TEAM_COLORS.join(','));
  // 옛 백업 JSON 가져오기(전체 교체)도 같은 규칙
  const s2 = await mk();
  await s2.importJSON(JSON.stringify({ app: '웃을산 FC', data: old }), { merge: false });
  ok('옛 백업 교체 가져오기 → 5팀 + 회원 그대로', S.TEAM_KEYS.length === 5 && s2.members.all().length === 3 && s2.members.byTeam('C').length === 1);
}

console.log('\n[2] 약자 "학" / 팀 이름 "학생" 파싱');
{
  const s = await mk();
  const added = s.members.bulkAdd(['학 가온 08 남 윙', '학생 나린 09 여 골키퍼', '청년 다온 03 남 왼쪽풀백', 'E 라온 07 남 미들']);
  const t = Object.fromEntries(added.map((m) => [m.name, m]));
  ok('학 → 학생팀', t['가온']?.team === 'E' && t['가온'].pos === 'FW' && t['가온'].birthYear === 2008, JSON.stringify(t['가온'] && [t['가온'].team, t['가온'].pos, t['가온'].birthYear]));
  ok('학생 → 학생팀 (GK)', t['나린']?.team === 'E' && t['나린'].gk === true);
  ok('청년 22줄 형식 그대로', t['다온']?.team === 'C' && t['다온'].pos === 'DF');
  ok('키 E 도 인식', t['라온']?.team === 'E');
  const r = s.importLines(['학 마루 08 남 공격수']);
  ok('명단 텍스트 가져오기도 학생', r.added === 1 && s.members.all().find((m) => m.name === '마루')?.team === 'E');
}

console.log('\n[3] 5팀 참석 현황 · 팀 수 권장 (참석 25/35/45명)');
{
  const s = await mk();
  const keys = ['A', 'B', 'C', 'D', 'E'];
  for (let i = 0; i < 45; i += 1) s.members.add({ name: `회원${i}`, team: keys[i % 5], gk: i % 9 === 0, abil: { speed: 1 + (i % 5), basic: 3 } });
  const g = s.matches.add({ date: '2026-10-01' });
  s.members.all().forEach((m) => s.matches.setAttendance(g.id, m.id, 'in'));
  const att = s.matches.teamAttendance(g.id);
  ok('현황에 학생팀 칸', Array.isArray(att.E) && att.E.length === 9 && keys.every((k) => att[k].length === 9), keys.map((k) => att[k].length).join('/'));
  const R = (n) => B.recommendGroups(n, { base: 11, availableTeams: 5 });
  ok('25명 → 2팀 + 교체 3', R(25).count === 2 && R(25).bench === 3, R(25).reason);
  ok('35명 → 3팀 + 교체 2', R(35).count === 3 && R(35).bench === 2, R(35).reason);
  ok('45명 → 4팀 + 교체 1', R(45).count === 4 && R(45).bench === 1, R(45).reason);
  ok('55명 → 5팀 (4팀 상한 해제)', R(55).count === 5, R(55).reason);
  ok('참석 소속 팀이 3개면 3팀까지', B.recommendGroups(55, { base: 11, availableTeams: 3 }).count === 3);

  console.log('\n[4] 합치기 제안 — 5팀을 3·4묶음으로');
  const byTeam = {}; for (const k of keys) byTeam[k] = att[k];
  const t0 = Date.now();
  const s3 = B.suggestMerges(byTeam, 3);
  const s4 = B.suggestMerges(byTeam, 4);
  const s2 = B.suggestMerges(byTeam, 2);
  const ms = Date.now() - t0;
  ok('5→3 후보 25개 (스털링 수 S(5,3))', s3.length === 25, `${s3.length}개`);
  ok('5→4 후보 10개 (S(5,4))', s4.length === 10, `${s4.length}개`);
  ok('5→2 후보 15개 (S(5,2))', s2.length === 15, `${s2.length}개`);
  ok('추천안 전원 포함·팀 빠짐 없음', s3[0].groups.flat().sort().join('') === 'ABCDE' && s3[0].stats.reduce((a, x) => a + x.size, 0) === 45);
  ok('계산 시간 짧음 (<100ms)', ms < 100, `${ms}ms`);
  const six = { ...byTeam, F: att.E.slice(0, 3) };
  ok('6팀 → 3묶음도 문제없음 (S(6,3)=90)', B.suggestMerges(six, 3).length === 90);

  console.log('\n[5] 완전 새로 섞기 5팀');
  const res = B.balanceTeams(s.matches.attendees(g.id), 5, { seed: 7 });
  ok('5팀으로 나눔 (예전엔 4팀 상한)', res.teams.length === 5 && res.teams.flat().length === 45, res.stats.map((x) => x.size).join('/'));
}

console.log('\n[6] 팀 추가 · 삭제 · 순서');
{
  const s = await mk();
  const k = s.club.addTeam('직장', '직');
  ok('6번째 팀 추가 (키 F)', k === 'F' && S.TEAM_KEYS.length === 6 && s.club.teamName('F') === '직장' && s.club.teamAlias('F') === '직');
  ok('7번째는 불가 (최대 6)', s.club.addTeam('초과') === null && S.TEAM_KEYS.length === 6);
  ok('추가한 팀 약자 파싱', s.members.bulkAdd(['직 홍길동 90 남 수비'])[0]?.team === 'F');
  s.members.add({ name: '김철수', team: 'E' });
  s.club.moveTeam('E', -1);
  ok('순서 바꾸기 (학생을 위로)', S.TEAM_KEYS.join('') === 'ABCEDF', S.TEAM_KEYS.join(''));
  ok('색은 팀을 따라감', S.TEAM_COLORS[S.TEAM_KEYS.indexOf('E')] === S.TEAM_COLOR_BY_KEY.E);
  const r = s.club.removeTeam('E');
  ok('소속 있는 팀 삭제 → 회원은 미배정으로', r.ok && r.moved === 1 && s.members.all().find((m) => m.name === '김철수').team === null && !S.TEAM_KEYS.includes('E'));
  ok('회원은 지워지지 않음', s.members.all().some((m) => m.name === '김철수'));
  ['F', 'D', 'C'].forEach((x) => s.club.removeTeam(x));
  const last = s.club.removeTeam('B');
  ok('최소 2팀은 남김', !last.ok && S.TEAM_KEYS.length === 2, last.reason);
  // 저장·불러오기 왕복
  const s2 = await mk();
  await s2.importJSON(s.exportJSON(), { merge: false });
  ok('JSON 왕복 — 팀 목록 유지', S.TEAM_KEYS.join('') === 'AB');
  s2.club.addTeam();
  ok('삭제했던 키 재사용 (빈 첫 키)', S.TEAM_KEYS.join('') === 'ABC', S.TEAM_KEYS.join(''));
}

console.log('\n[7] 합치기 가져오기는 이 기기의 팀 목록을 유지');
{
  const s = await mk();
  s.club.removeTeam('E');                       // 이 기기: 4팀
  const other = await mk();                      // 다른 기기: 5팀
  const json = other.exportJSON();
  s.club.removeTeam('D');
  await s.importJSON(json, { merge: true });
  ok('합치기 후에도 이 기기 팀 목록 그대로', S.TEAM_KEYS.join('') === 'ABC', S.TEAM_KEYS.join(''));
}

console.log(`\n결과: ${pass} PASS / ${fail} FAIL\n`);
process.exit(fail ? 1 : 0);
