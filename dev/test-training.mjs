/* S5 단위 테스트 (node dev/test-training.mjs) — 팀 훈련 + 개인 훈련
 * 마스터플랜 C:/종합상사/data/plans/soccer_app_v1_tactics_masterplan_2026-09-29.md §7(S5)
 * 검증 대상: 드릴 라이브러리 시딩(15개·6카테고리)·숨김(삭제 아님)·세션 보존,
 *           팀 훈련 세션 CRUD·드릴 합계 분, 개인 훈련 규칙 기반 추천·완료 체크·주 계산,
 *           회원 삭제 시 과제 처리(데이터 손실 0), JSON 백업 왕복(합치기 기본, id 재연결).
 * 실행: node dev/test-training.mjs
 */
process.env.TZ = 'Asia/Seoul';

let pass = 0; let fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass += 1; console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail += 1; console.error(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
}

function memAdapter() {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
}
memAdapter();

const {
  createStore, DRILL_CATEGORIES, DRILL_CATEGORY_KEYS, DEFAULT_DRILLS,
  weekMondayOf, currentWeekMonday, weekLabel, weakestAbilities, recommendTasksFor,
  trainingSessionDrillMinutes, normalizeDrill,
} = await import('../store.js');

console.log('\n[1] 드릴 라이브러리 시딩');
ok('카테고리 6개', DRILL_CATEGORIES.length === 6);
ok('기본 드릴 15개', DEFAULT_DRILLS.length === 15);
ok('모든 기본 드릴이 6카테고리 중 하나', DEFAULT_DRILLS.every((d) => DRILL_CATEGORY_KEYS.includes(d.category)));

const store = createStore();
await store.init();
ok('앱 시작 시 15개 자동 시딩', store.drills.all().length === 15);
ok('카테고리별 1개 이상', DRILL_CATEGORIES.every((c) => store.drills.byCategory(c.key).length >= 1),
  DRILL_CATEGORIES.map((c) => `${c.key}:${store.drills.byCategory(c.key).length}`).join(' '));

console.log('\n[2] 드릴 추가·수정·숨김 (삭제 없음)');
const custom = store.drills.add({ category: 'pass', name: '커스텀 드릴', desc: '테스트용', minutes: 20, players: '전체', equipment: '없음' });
ok('직접 추가', store.drills.all().length === 16 && custom.name === '커스텀 드릴');
store.drills.update(custom.id, { minutes: 25 });
ok('수정', store.drills.byId(custom.id).minutes === 25);
store.drills.setHidden(custom.id, true);
ok('숨기면 visible() 에서 빠진다', !store.drills.visible().some((d) => d.id === custom.id));
ok('숨겨도 all()/byId() 에는 그대로 남는다(삭제 아님)', store.drills.all().length === 16 && !!store.drills.byId(custom.id));

console.log('\n[3] 주 계산 (weekMondayOf)');
ok('화요일 → 그 주 월요일', weekMondayOf('2026-09-29') === '2026-09-28');
ok('월요일 → 자기 자신', weekMondayOf('2026-09-28') === '2026-09-28');
ok('일요일 → 전날이 아니라 그 주(직전) 월요일', weekMondayOf('2026-10-04') === '2026-09-28');
ok('weekLabel 문구', weekLabel('2026-09-28').includes('9월 28일'));

console.log('\n[4] 팀 훈련 세션 CRUD + 드릴 담긴 합계 분');
const players = store.members.bulkAdd(['한가람 95 남 GK', '오태경 88 남', '서보라 96 여']);
const ts1 = store.trainingSessions.add({
  date: '2026-09-29', theme: '패스+체력', minutes: 60,
  drills: [{ drillId: 'dr_pass_01', minutes: 15 }, { drillId: 'dr_fitness_01', minutes: 10 }, { drillId: '', minutes: 5 }],
  attendees: [players[0].id, players[1].id],
  notes: '좋았음',
});
ok('세션 생성', !!ts1.id && ts1.theme === '패스+체력');
ok('빈 drillId 는 걸러진다', ts1.drills.length === 2);
ok('드릴 합계 분 계산', trainingSessionDrillMinutes(ts1) === 25);
ok('참가자 연동', ts1.attendees.length === 2);
store.trainingSessions.update(ts1.id, { theme: '체력 집중', drills: [...ts1.drills, { drillId: 'dr_press_01', minutes: 12 }] });
ok('세션 수정', store.trainingSessions.byId(ts1.id).theme === '체력 집중');
ok('드릴 합계 재계산', trainingSessionDrillMinutes(store.trainingSessions.byId(ts1.id)) === 37);
const ts2 = store.trainingSessions.add({ date: '2026-09-22', theme: '지난주' });
ok('정렬(최신 날짜 먼저)', store.trainingSessions.sorted()[0].id === ts1.id);
store.trainingSessions.remove(ts2.id);
ok('세션 삭제', !store.trainingSessions.byId(ts2.id));

console.log('\n[5] 드릴 숨김 시 세션 보존 (마스터플랜 §7 원칙)');
{
  store.drills.setHidden('dr_pass_01', true);
  const tsAfter = store.trainingSessions.byId(ts1.id);
  ok('숨긴 드릴이라도 이미 담긴 세션에는 그대로 남는다', tsAfter.drills.some((d) => d.drillId === 'dr_pass_01'));
  ok('드릴 자체도 여전히 조회된다(hidden 만 true)', store.drills.byId('dr_pass_01')?.hidden === true);
  store.drills.setHidden('dr_pass_01', false);   // 되돌려 놓기
}

console.log('\n[6] 개인 훈련 — 규칙 기반 추천 (AI 아님)');
{
  const m = store.members.byId(players[0].id);   // GK, abil 없음
  ok('약점 없음(미평가)이면 weakestAbilities 빈 배열', weakestAbilities(m).length === 0);
  store.members.setAbil(m.id, { speed: 2, stamina: 2, basic: 4, shoot: 4, defense: 5, physical: 5 });
  const m2 = store.members.byId(m.id);
  const weak = weakestAbilities(m2, 2);
  ok('가장 낮은 2항목(speed·stamina) 선택', weak.includes('speed') && weak.includes('stamina'), JSON.stringify(weak));
  const tasks = recommendTasksFor(m2, store.drills.visible());
  ok('GK 회원은 GK 드릴이 추천에 포함', tasks.some((t) => store.drills.byId(t.drillId)?.category === 'gk'), JSON.stringify(tasks));
  ok('약점 카테고리(체력) 드릴 포함', tasks.some((t) => store.drills.byId(t.drillId)?.category === 'fitness'));
  ok('추천은 6개 이하', tasks.length <= 6);

  store.members.setTest(m.id, 'shuttle20', 9.4);
  const tasks2 = recommendTasksFor(store.members.byId(m.id), store.drills.visible());
  const testTask = tasks2.find((t) => t.testKey === 'shuttle20');
  ok('측정 기록이 있으면 재측정 목표 과제가 추가된다', !!testTask, JSON.stringify(tasks2));
  ok('목표는 현재 기록보다 빠른 값', testTask && testTask.baseline === 9.4 && testTask.target.includes('초'));
}

console.log('\n[7] 개인 훈련 과제 저장 · 완료 체크 · 감독 확인');
{
  const memberId = players[1].id;
  ok('이번 주 과제 없음', !store.personalPlans.current(memberId));
  const rec = store.personalPlans.recommend(memberId);
  const plan = store.personalPlans.add({ memberId, tasks: rec });
  ok('과제 저장 시 이번 주(weekOf)로 자동 채워진다', plan.weekOf === currentWeekMonday());
  ok('current() 로 다시 찾을 수 있다', store.personalPlans.current(memberId)?.id === plan.id);
  store.personalPlans.setTaskDone(plan.id, 0, true);
  ok('완료 체크', store.personalPlans.byId(plan.id).tasks[0].done === true);
  ok('완료 시각 기록', !!store.personalPlans.byId(plan.id).tasks[0].doneAt);
  store.personalPlans.setTaskDone(plan.id, 0, false);
  ok('완료 취소 시 시각도 비운다', store.personalPlans.byId(plan.id).tasks[0].doneAt === null);
  store.personalPlans.update(plan.id, { coachCheck: true });
  ok('감독 확인 토글', store.personalPlans.byId(plan.id).coachCheck === true);

  const pastPlan = store.personalPlans.add({ memberId, weekOf: '2026-09-14', tasks: [{ text: '자체 러닝', target: '30분' }] });
  ok('지난 주 과제는 weekOf 로 그 주 월요일로 보정된다', pastPlan.weekOf === '2026-09-14');
  const hist = store.personalPlans.byMember(memberId);
  ok('과제 이력 최신 주 먼저', hist.length === 2 && hist[0].id === plan.id);
}

console.log('\n[8] 회원 삭제 시 과제 처리 (데이터 손실 0)');
{
  const m = store.members.add({ name: '삭제될선수', pos: 'MF' });
  const plan = store.personalPlans.add({ memberId: m.id, tasks: [{ text: '개인 훈련', target: '' }] });
  const ts = store.trainingSessions.add({ date: '2026-09-29', attendees: [m.id] });
  store.members.remove(m.id);
  ok('회원은 지워진다', !store.members.byId(m.id));
  ok('팀 훈련 참가자 목록에서는 빠진다', !store.trainingSessions.byId(ts.id).attendees.includes(m.id));
  const planAfter = store.personalPlans.byId(plan.id);
  ok('개인 훈련 과제는 지워지지 않는다(데이터 손실 0)', !!planAfter && planAfter.tasks.length === 1);
  ok('memberId 는 그대로 남아 화면에서 "탈퇴 선수" 로 표시할 수 있다', planAfter.memberId === m.id && !store.members.byId(planAfter.memberId));
}

console.log('\n[9] JSON 백업 왕복 (drills·trainingSessions·personalPlans 포함, 합치기 기본)');
{
  const src = createStore();
  await src.init();
  const p = src.members.bulkAdd(['문세훈', '강하준']);
  const customDrill = src.drills.add({ category: 'gk', name: '내보내기용 드릴', desc: 'x', minutes: 10, players: '', equipment: '' });
  const tsSrc = src.trainingSessions.add({
    date: '2026-09-29', theme: '왕복테스트', minutes: 40,
    drills: [{ drillId: customDrill.id, minutes: 10 }],
    attendees: [p[0].id], notes: '왕복',
  });
  const planSrc = src.personalPlans.add({ memberId: p[1].id, tasks: [{ drillId: customDrill.id, target: '', done: false }, { text: '자율 훈련', target: '20분' }] });

  const json = src.exportJSON();
  const dst = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await dst.init();
  const r = await dst.importJSON(json);
  ok('가져오기 결과에 훈련 데이터 수 포함', r.trainingSessions === 1 && r.personalPlans === 1, JSON.stringify(r));

  ok('커스텀 드릴 왕복(기본 15개 + 1)', dst.drills.all().length === 16);
  const tsD = dst.trainingSessions.all().find((x) => x.notes === '왕복');
  ok('세션 필드 왕복', tsD && tsD.theme === '왕복테스트' && tsD.minutes === 40);
  ok('세션의 커스텀 drillId 가 새 기기 기준으로 이어진다', tsD.drills[0].drillId && !!dst.drills.byId(tsD.drills[0].drillId));
  ok('세션 참가자 id 도 새 회원 기준으로 이어진다', !!dst.members.byId(tsD.attendees[0]));

  const planD = dst.personalPlans.all().find((x) => x.tasks.some((t) => t.text === '자율 훈련'));
  ok('개인 과제 왕복', !!planD);
  ok('개인 과제 memberId 도 새 회원 기준으로 이어진다', !!dst.members.byId(planD.memberId));
  ok('개인 과제의 drillId 참조도 이어진다', !!dst.drills.byId(planD.tasks[0].drillId));

  console.log('\n[10] 합치기 재실행 — id 가 같은 세션·과제·드릴은 중복으로 늘지 않는다');
  const r2 = await dst.importJSON(json, { merge: true });
  ok('드릴 중복 없음', dst.drills.all().length === 16, `count=${dst.drills.all().length}`);
  ok('세션 중복 없음', dst.trainingSessions.all().length === 1, `count=${dst.trainingSessions.all().length}`);
  ok('과제 중복 없음', dst.personalPlans.all().length === 1, `count=${dst.personalPlans.all().length}`);
}

console.log('\n[11] 마이그레이션 — 옛 데이터(S4 이전, drills 필드 없음)에 처음 진입해도 15개가 시딩된다');
{
  memAdapter();
  const s4 = createStore();
  await s4.init();
  await s4.flush();
  const raw = JSON.parse(globalThis.localStorage.getItem('woosulsan-fc:v1'));
  delete raw.drills; delete raw.trainingSessions; delete raw.personalPlans;
  globalThis.localStorage.setItem('woosulsan-fc:v1', JSON.stringify(raw));
  const s5 = createStore();
  await s5.init();
  ok('drills 필드가 없던 저장본도 15개로 시딩', s5.drills.all().length === 15);
  ok('trainingSessions/personalPlans 는 빈 배열로 시작', s5.trainingSessions.all().length === 0 && s5.personalPlans.all().length === 0);
}

console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
