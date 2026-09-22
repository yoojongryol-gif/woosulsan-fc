/* 코어 로직 테스트 (node dev/test-core.mjs) — 브라우저 없이 검증 */
import { balanceTeams, suggestTeamCount, teamSizeCaps, suggestMerges, suggestGroupCount, groupStat, teamShortage } from '../balance.js';

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

console.log('\n[3] 전술 저장');
{
  const t1 = store.tactics.save({ id: undefined, matchId: g.id, team: 0, formation: '2-2-1', title: '전반 압박', pins: [{ memberId: 'x', x: 50, y: 50 }], strokes: [] });
  ok('전술 저장 시 id 생성 (undefined 덮어쓰기 방지)', !!t1.id, String(t1.id));
  const t2 = store.tactics.save({ id: t1.id, matchId: g.id, team: 0, formation: '2-2-1', title: '수정본', pins: [], strokes: [] });
  ok('같은 id 로 덮어쓰기', t2.id === t1.id && store.tactics.byMatch(g.id).length === 1 && t2.title === '수정본');
  ok('전술 byId 조회', store.tactics.byId(t1.id)?.title === '수정본');
  store.tactics.remove(t1.id);
  ok('전술 삭제', store.tactics.byMatch(g.id).length === 0);
}

console.log('\n[4] 고정 4팀 · 합치기 제안 (v0.3.0)');
{
  // 4팀 소속 30명 중 18명 참석 시나리오
  const s4 = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await s4.init();
  const TEAMS = ['A', 'B', 'C', 'D'];
  for (let i = 0; i < 30; i += 1) {
    s4.members.add({ name: '회원' + i, skill: 1 + ((i * 7) % 5), gk: i % 7 === 0, pos: ['FW', 'MF', 'DF'][i % 3], team: TEAMS[i % 4] });
  }
  ok('회원 30명 4팀 소속', TEAMS.every((k) => s4.members.byTeam(k).length > 0),
    TEAMS.map((k) => k + s4.members.byTeam(k).length).join(' '));

  const gm = s4.matches.add({ date: '2026-09-24', place: '시민운동장', teamCount: 3 });
  const all30 = s4.members.active();
  // 팀별로 들쭉날쭉한 참석: A6 B3 C5 D4 = 18명
  const plan = { A: 6, B: 3, C: 5, D: 4 };
  for (const k of TEAMS) {
    s4.members.byTeam(k).slice(0, plan[k]).forEach((m) => s4.matches.setAttendance(gm.id, m.id, 'in'));
  }
  ok('참석 18명 (A6·B3·C5·D4)', s4.matches.attendees(gm.id).length === 18);

  const att = s4.matches.teamAttendance(gm.id);
  ok('팀별 참석 집계', TEAMS.map((k) => att[k].length).join('/') === '6/3/5/4', TEAMS.map((k) => att[k].length).join('/'));
  ok('미배정 0명', att.none.length === 0);

  const short = teamShortage(groupStat(att.B));
  ok('부족 팀 감지 (B 3명)', short.includes('인원 부족'), short.join(','));

  const byTeam = {}; for (const k of TEAMS) byTeam[k] = att[k];
  const sug3 = suggestMerges(byTeam, 3);
  ok('3팀 합치기 후보 6개 (4팀→3묶음)', sug3.length === 6, sug3.length + '개');
  const best = sug3[0];
  ok('추천안 = 3묶음·전원 포함', best.groups.length === 3
    && best.groups.flat().sort().join('') === 'ABCD'
    && best.stats.reduce((a, x) => a + x.size, 0) === 18,
    best.groups.map((g) => g.join('+')).join(' / ') + ' 전력 ' + best.stats.map((x) => x.total).join('/'));
  ok('추천안이 최저 점수', sug3.every((x) => x.score >= best.score));
  ok('추천안 = 후보 중 전력 편차 최소', best.spread === Math.min(...sug3.map((x) => x.spread)),
    '추천 차 ' + best.spread + ' / 후보 차 ' + sug3.map((x) => x.spread).join(','));
  ok('추천안 GK 모든 팀 보유 · 인원 편차 ≤ 2', best.gkMissing === 0 && best.sizeSpread <= 2,
    'GK ' + best.stats.map((x) => x.gk).join('/') + ' 인원 ' + best.stats.map((x) => x.size).join('/'));

  const sug2 = suggestMerges(byTeam, 2);
  ok('2팀 합치기 후보 7개', sug2.length === 7, sug2.length + '개');
  ok('2팀 추천안 전원 포함', sug2[0].stats.reduce((a, x) => a + x.size, 0) === 18);

  const sug4 = suggestMerges(byTeam, 4);
  ok('4팀 유지 = 합치기 없음', sug4.length === 1 && sug4[0].groups.every((g) => g.length === 1));

  ok('권장 팀 수 (18명·4팀)', suggestGroupCount(18, 4) === 3 && suggestGroupCount(12, 4) === 2 && suggestGroupCount(26, 4) === 4);

  // 한 팀만 참석 → 제안은 그 팀 하나
  ok('참석 팀 1개면 묶음도 1개', suggestMerges({ A: att.A }, 3)[0].groups.length === 1);

  // 채택 → 저장 → JSON 왕복
  s4.matches.setTeams(gm.id, best.players.map((list) => list.map((p) => p.id)), 3,
    { mode: 'merge', groups: best.groups });
  const saved = s4.matches.byId(gm.id);
  ok('확정 저장 (teams + teamPlan)', saved.teams.flat().length === 18 && saved.teamPlan.mode === 'merge'
    && saved.teamPlan.groups.length === 3);

  const json2 = s4.exportJSON();
  const s5 = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await s5.init();
  await s5.importJSON(json2);
  const g5 = s5.matches.all()[0];
  ok('JSON 왕복 — 소속 팀 보존', s5.members.byTeam('A').length === s4.members.byTeam('A').length);
  ok('JSON 왕복 — 오늘의 팀·합치기 보존', g5.teams.flat().length === 18 && g5.teamPlan.groups.length === 3);
  ok('JSON 왕복 — 팀 이름 보존', s5.club.teamName('A') === s4.club.teamName('A'));

  // 마이그레이션: team 없는 옛 데이터
  const s6 = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await s6.init();
  await s6.importJSON(JSON.stringify({ members: [{ id: 'x1', name: '옛회원', skill: 3 }], matches: [], tactics: [] }));
  ok('마이그레이션 — team 없으면 미배정', s6.members.all()[0].team === null);
  ok('마이그레이션 — 팀 이름 기본값(v0.5.4: 교역/장년/청년/체육)', s6.club.teamName('D') === '체육');

  // 팀 이름 변경
  s4.club.setTeamName('A', '레드');
  ok('팀 이름 변경', s4.club.teamName('A') === '레드');
}

console.log('\n[5] 나이 (v0.4.1)');
{
  const { parseBirthYear, ageOf, ageLabel, parseMemberLine } = await import('../store.js');
  const now = new Date('2026-06-01');
  ok('4자리 그대로', parseBirthYear('1990', now) === 1990);
  ok('2자리 90 → 1990', parseBirthYear('90', now) === 1990);
  ok('2자리 10 → 2010 (16세)', parseBirthYear('10', now) === 2010);
  ok('2자리 15 → 2015 (19xx 는 100세 초과)', parseBirthYear('15', now) === 2015);
  ok('2자리 05 → 2005 (21세)', parseBirthYear('05', now) === 2005);
  ok('빈 값·문자·범위 밖 → null',
    parseBirthYear('', now) === null && parseBirthYear('abc', now) === null
    && parseBirthYear('1800', now) === null && parseBirthYear('2030', now) === null && parseBirthYear('199', now) === null);
  ok('연 나이 = 올해 - 출생년', ageOf(1990, now) === 36);
  ok('표기 형식', ageLabel(1990, now) === '90년생 · 36세', ageLabel(1990, now));

  ok('줄 파싱 "홍길동 90"', parseMemberLine('홍길동 90').name === '홍길동' && parseMemberLine('홍길동 90').birthYear === 1990);
  ok('줄 파싱 "김철수,1988"', parseMemberLine('김철수,1988').birthYear === 1988);
  ok('줄 파싱 이름만', parseMemberLine('이영희').birthYear === null);
  ok('줄 파싱 이름에 숫자 포함', parseMemberLine('선수7').name === '선수7' && parseMemberLine('선수7').birthYear === null);
  ok('줄 파싱 잘못된 년도는 이름으로', parseMemberLine('박연도 1800').name === '박연도 1800');

  const s2 = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await s2.init();
  const added = s2.members.bulkAdd(['홍길동 90', '김철수,1988', '이영희', '최영 2001']);
  ok('콤마 + 출생년도 = 한 명', added.filter((m) => m.name === '김철수').length === 1 && !added.some((m) => m.name === '1988'));
  const added2 = s2.members.bulkAdd(['박하나, 박두리', '정세명']);
  ok('콤마 이름 목록은 여러 명으로', added2.length === 3 && added2[0].name === '박하나' && added2[1].name === '박두리',
    added2.map((m) => m.name).join('/'));
  ok('일괄 추가에서 출생년도 파싱', added.length === 4
    && added[0].birthYear === 1990 && added[1].birthYear === 1988 && added[2].birthYear === null && added[3].birthYear === 2001,
    added.map((m) => `${m.name}:${m.birthYear}`).join(' '));

  s2.members.update(added[2].id, { birthYear: '95' });
  ok('수정 시 2자리 보정', s2.members.byId(added[2].id).birthYear === 1995);
  s2.members.update(added[2].id, { birthYear: 'xx' });
  ok('잘못된 값은 미입력 처리', s2.members.byId(added[2].id).birthYear === null);

  // 팀 평균 나이 (입력된 사람 기준)
  const players = [{ skill: 3, birthYear: 1990 }, { skill: 3, birthYear: 2000 }, { skill: 3 }];
  const gs = groupStat(players, new Date('2026-06-01'));
  ok('평균 나이 = 입력된 사람만', gs.ageAvg === 31 && gs.ageCount === 2 && gs.size === 3, `${gs.ageAvg}세 / ${gs.ageCount}명`);
  ok('아무도 없으면 null', groupStat([{ skill: 3 }], now).ageAvg === null);
  // .map(groupStat) 처럼 두 번째 인자가 인덱스로 들어와도 터지지 않아야 한다
  ok('map(groupStat) 안전', [[{ skill: 3, birthYear: 1990 }], [{ skill: 2 }]].map(groupStat).length === 2);

  // 마이그레이션 + JSON 왕복
  const s3 = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await s3.init();
  await s3.importJSON(JSON.stringify({ members: [{ id: 'old1', name: '옛회원', skill: 3 }], matches: [], tactics: [] }));
  ok('옛 데이터 birthYear 없음 → null', s3.members.all()[0].birthYear === null);
  const json3 = s2.exportJSON();
  const s4 = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await s4.init();
  await s4.importJSON(json3);
  ok('JSON 왕복 — 출생년도 보존', s4.members.all().map((m) => m.birthYear).join() === s2.members.all().map((m) => m.birthYear).join(),
    s4.members.all().map((m) => m.birthYear).join());
}

console.log('\n[6] 간단 체크 6항목 (v0.4.2)');
{
  const { ABILITIES, ABILITY_KEYS, normalizeAbil, abilAvg } = await import('../store.js');
  const { abilAverages } = await import('../balance.js');
  ok('항목 6개 · 순서 고정', ABILITY_KEYS.join() === 'speed,stamina,basic,shoot,defense,physical', ABILITY_KEYS.join());
  ok('라벨', ABILITIES.map((a) => a.label).join() === '스피드,지구력,기본기,슈팅,수비,피지컬');

  const n = normalizeAbil({ speed: 5, stamina: '3', basic: 0, shoot: 9, defense: 'x' });
  ok('1~5 밖·문자는 미입력', n.speed === 5 && n.stamina === 3 && n.basic === null && n.shoot === null && n.defense === null && n.physical === null,
    JSON.stringify(n));
  ok('평균 = 입력된 항목만', abilAvg(n) === 4, String(abilAvg(n)));
  ok('전부 미입력이면 null', abilAvg(normalizeAbil({})) === null);

  const s7 = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await s7.init();
  const m1 = s7.members.add({ name: '가', team: 'A', abil: { speed: 5, stamina: 4, defense: 2 } });
  const m2 = s7.members.add({ name: '나', team: 'A', abil: { speed: 3, defense: 4 } });
  const m3 = s7.members.add({ name: '다', team: 'A' });
  ok('회원 저장 시 정규화', s7.members.byId(m1.id).abil.speed === 5 && s7.members.byId(m3.id).abil.speed === null);

  const avgs = abilAverages([m1, m2, m3]);
  ok('팀 평균 = 입력된 사람만', avgs.speed === 4 && avgs.stamina === 4 && avgs.defense === 3 && avgs.count === 2,
    `스피드 ${avgs.speed} 지구력 ${avgs.stamina} 수비 ${avgs.defense} (${avgs.count}명)`);
  ok('아무도 없으면 null', abilAverages([m3]).speed === null && abilAverages([m3]).count === 0);
  const gs2 = groupStat([m1, m2, m3]);
  ok('groupStat 에 능력치 포함', gs2.abil.speed === 4 && gs2.size === 3);

  ok('세부 평균 반올림 = 종합 후보', Math.round(abilAvg({ speed: 5, stamina: 4, defense: 4 })) === 4);
  ok('종합 실력은 자동으로 안 바뀜', s7.members.byId(m1.id).skill === 3, String(s7.members.byId(m1.id).skill));

  const s8 = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await s8.init();
  await s8.importJSON(JSON.stringify({ members: [{ id: 'o', name: '옛회원', skill: 3 }], matches: [], tactics: [] }));
  ok('옛 데이터 = 전 항목 미입력', ABILITY_KEYS.every((k) => s8.members.all()[0].abil[k] === null));

  const s9 = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await s9.init();
  await s9.importJSON(s7.exportJSON());
  ok('JSON 왕복 — 능력치 보존', JSON.stringify(s9.members.all()[0].abil) === JSON.stringify(s7.members.all()[0].abil),
    JSON.stringify(s9.members.all()[0].abil));
}

console.log(`\n결과: ${pass} PASS / ${fail} FAIL\n`);
process.exit(fail ? 1 : 0);
