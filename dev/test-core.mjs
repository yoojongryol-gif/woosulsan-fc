/* 코어 로직 테스트 (node dev/test-core.mjs) — 브라우저 없이 검증 */
import { balanceTeams, suggestTeamCount, teamSizeCaps } from '../balance.js';

let pass = 0; let fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass += 1; console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail += 1; console.error(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
}

/* localStorage 스텁 */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
const { createStore } = await import('../store.js');

const KOREAN = ['김민준', '이서준', '박도윤', '최예준', '정시우', '강하준', '조주원', '윤지호', '장지후', '임준서',
  '한건우', '오현우', '서우진', '신선우', '권연우', '황유준', '안서진', '송민재', '전현준', '홍지훈',
  '문준우', '양승현', '배도현', '백은우', '유정우', '남태윤', '심규민', '노재원', '하성민', '곽동하',
  '성지환', '차민성', '구본혁', '표현석', '석다온'];

function makeMembers(n, gkCount = 3) {
  return Array.from({ length: n }, (_, i) => ({
    id: 'm' + i,
    name: KOREAN[i % KOREAN.length] + (i >= KOREAN.length ? i : ''),
    skill: 1 + ((i * 7) % 5),
    gk: i < gkCount,
  }));
}

console.log('\n[1] 팀 밸런스');
for (const [n, tc] of [[18, 3], [22, 3], [14, 2], [21, 3], [25, 3], [9, 2], [7, 2], [35, 3]]) {
  const players = makeMembers(n, 3);
  const { teams, stats, spread } = balanceTeams(players, tc, { seed: 42 });
  const sizes = stats.map((s) => s.size);
  const totals = stats.map((s) => s.total);
  const allIds = teams.flat().map((p) => p.id);
  ok(`${n}명 → ${tc}팀 인원 차 ≤1`, Math.max(...sizes) - Math.min(...sizes) <= 1, `인원 ${sizes.join('/')}`);
  ok(`${n}명 → ${tc}팀 전력 차 ≤2`, spread <= 2, `전력 ${totals.join('/')} (차 ${spread})`);
  ok(`${n}명 → ${tc}팀 GK 분산 (팀당 1명 이상)`, stats.every((s) => s.gk >= 1), `GK ${stats.map((s) => s.gk).join('/')}`);
  ok(`${n}명 → ${tc}팀 인원 보존·중복 없음`, allIds.length === n && new Set(allIds).size === n);
}

// GK가 팀 수보다 적을 때
{
  const { stats } = balanceTeams(makeMembers(18, 1), 3, { seed: 7 });
  ok('GK 1명뿐이면 한 팀만 GK 보유(오류 없음)', stats.filter((s) => s.gk === 1).length === 1);
}
// 매번 다른 조합
{
  const p = makeMembers(20, 3);
  const a = balanceTeams(p, 2).teams[0].map((x) => x.id).sort().join();
  const b = balanceTeams(p, 2).teams[0].map((x) => x.id).sort().join();
  const c = balanceTeams(p, 2).teams[0].map((x) => x.id).sort().join();
  ok('다시 섞기 = 조합이 고정되지 않음', !(a === b && b === c));
}
ok('권장 팀 수 14명→2팀 / 18명→3팀', suggestTeamCount(14) === 2 && suggestTeamCount(18) === 3);
ok('인원 상한 계산 20/3 = 7,7,6', teamSizeCaps(20, 3).join() === '7,7,6');

console.log('\n[2] 스토어 (localStorage 어댑터)');
const store = createStore();
await store.init();
const added = store.members.bulkAdd(KOREAN.slice(0, 25));
ok('일괄 추가 25명', added.length === 25 && store.members.all().length === 25);
ok('중복 이름 제외', store.members.bulkAdd([KOREAN[0], '새사람']).length === 1);
store.members.update(store.members.all()[0].id, { gk: true, skill: 5 });
ok('회원 수정', store.members.all()[0].gk === true && store.members.all()[0].skill === 5);

const g = store.matches.add({ date: '2026-09-25', time: '20:00', place: '시민운동장', teamCount: 3 });
const all = store.members.active();
for (let i = 0; i < 18; i += 1) store.matches.setAttendance(g.id, all[i].id, 'in');
for (let i = 18; i < 22; i += 1) store.matches.setAttendance(g.id, all[i].id, 'out');
ok('참석 18명 집계', store.matches.attendees(g.id).length === 18);

const res = balanceTeams(store.matches.attendees(g.id), 3, { seed: 3 });
store.matches.setTeams(g.id, res.teams.map((t) => t.map((p) => p.id)), 3);
ok('팀 저장 3팀 · 18명', store.matches.byId(g.id).teams.flat().length === 18);

const st = store.stats.attendance(all[0].id);
ok('출석률 계산', st.total === 1 && st.present === 1 && st.rate === 100);

const json = store.exportJSON();
const store2 = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
await store2.init();
await store2.importJSON(json);
ok('JSON 내보내기/가져오기 왕복 — 회원 수 동일', store2.members.all().length === store.members.all().length);
ok('JSON 왕복 — 경기·출석 보존', store2.matches.attendees(store2.matches.all()[0].id).length === 18);
ok('JSON 왕복 — 팀 보존', store2.matches.all()[0].teams.flat().length === 18);
try { await store2.importJSON('{"nope":1}'); ok('잘못된 JSON 거부', false); }
catch (e) { ok('잘못된 JSON 거부', true, e.message); }

store.members.remove(all[0].id);
ok('회원 삭제 시 출석·팀에서도 제거',
  store.matches.byId(g.id).teams.flat().length === 17 && !store.matches.byId(g.id).attendance[all[0].id]);

console.log(`\n결과: ${pass} PASS / ${fail} FAIL\n`);
process.exit(fail ? 1 : 0);
