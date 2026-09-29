/* 코어 로직 테스트 (node dev/test-core.mjs) — 브라우저 없이 검증
 * v1.0(2026-09-29 S1): 내부 팀 나누기·묶음 제안 검증은 dev/parked/test-teams-v0.7.mjs 로 내려갔다.
 *   여기에는 v1.0 에서도 살아 있는 것만 남긴다 — 스토어·출석·전술 저장·나이·능력치·측정 환산.
 */

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

console.log('\n[2] 스토어 (localStorage 어댑터)');
const store = createStore();
await store.init();
const added = store.members.bulkAdd(KOREAN.slice(0, 25));
ok('일괄 추가 25명', added.length === 25 && store.members.all().length === 25);
ok('중복 이름 제외', store.members.bulkAdd([KOREAN[0], '새사람']).length === 1);
store.members.update(store.members.all()[0].id, { gk: true, skill: 5 });
ok('회원 수정', store.members.all()[0].gk === true && store.members.all()[0].skill === 5);

const g = store.matches.add({ date: '2026-09-25', time: '20:00', place: '시민운동장' });
const all = store.members.active();
for (let i = 0; i < 18; i += 1) store.matches.setAttendance(g.id, all[i].id, 'in');
for (let i = 18; i < 22; i += 1) store.matches.setAttendance(g.id, all[i].id, 'out');
ok('참석 18명 집계', store.matches.attendees(g.id).length === 18);


const st = store.stats.attendance(all[0].id);
ok('출석률 계산', st.total === 1 && st.present === 1 && st.rate === 100);

const json = store.exportJSON();
const store2 = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
await store2.init();
await store2.importJSON(json);
ok('JSON 내보내기/가져오기 왕복 — 회원 수 동일', store2.members.all().length === store.members.all().length);
ok('JSON 왕복 — 경기·출석 보존', store2.matches.attendees(store2.matches.all()[0].id).length === 18);
try { await store2.importJSON('{"nope":1}'); ok('잘못된 JSON 거부', false); }
catch (e) { ok('잘못된 JSON 거부', true, e.message); }

store.members.remove(all[0].id);
ok('회원 삭제 시 출석에서도 제거', !store.matches.byId(g.id).attendance[all[0].id]);
ok('오늘 자리는 날짜로 하나만 만든다', (() => {
  const t1 = store.matches.today(); const t2 = store.matches.today();
  return !!t1 && t1.id === t2.id;
})());

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

  // 나이 표기 (입력된 사람 기준)
  ok('나이 라벨', ageLabel(1990, new Date('2026-06-01')).includes('36'), ageLabel(1990, new Date('2026-06-01')));

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
  ok('항목 6개 · 순서 고정', ABILITY_KEYS.join() === 'speed,stamina,basic,shoot,defense,physical', ABILITY_KEYS.join());
  ok('라벨', ABILITIES.map((a) => a.label).join() === '스피드,지구력,기본기,슈팅,수비,피지컬');

  const n = normalizeAbil({ speed: 5, stamina: '3', basic: 0, shoot: 9, defense: 'x' });
  ok('1~5 밖·문자는 미입력', n.speed === 5 && n.stamina === 3 && n.basic === null && n.shoot === null && n.defense === null && n.physical === null,
    JSON.stringify(n));
  ok('평균 = 입력된 항목만', abilAvg(n) === 4, String(abilAvg(n)));
  ok('전부 미입력이면 null', abilAvg(normalizeAbil({})) === null);

  const s7 = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await s7.init();
  const m1 = s7.members.add({ name: '가', abil: { speed: 5, stamina: 4, defense: 2 } });
  const m2 = s7.members.add({ name: '나', abil: { speed: 3, defense: 4 } });
  const m3 = s7.members.add({ name: '다' });
  ok('회원 저장 시 정규화', s7.members.byId(m1.id).abil.speed === 5 && s7.members.byId(m3.id).abil.speed === null);

  ok('세부 평균 반올림 = 종합 후보', Math.round(abilAvg({ speed: 5, stamina: 4, defense: 4 })) === 4);
  // v0.5.6: 종합 실력 = 간단 체크 평균 자동 (5,4,2 → 3.7)
  ok('종합 실력 = 6항목 평균 자동', s7.members.byId(m1.id).skill === 3.7, String(s7.members.byId(m1.id).skill));
  ok('간단 체크 없으면 기존 값 유지', s7.members.byId(m3.id).skill === 3);
  ok('평균 바뀌면 종합도 따라감', (() => {
    s7.members.setAbil(m1.id, { shoot: 5 }, 'owner');
    return s7.members.byId(m1.id).skill === 4;
  })(), String(s7.members.byId(m1.id).skill));

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


console.log('\n[v0.6.0] 성별 평가 기준표 · 한 팀 인원');
{
  const S = await import('../store.js');
  const s6 = S.createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await s6.init();
  ok('기본 기준표 6항목 × 5단계 (남/여)', ['male', 'female'].every((g) => Object.keys(s6.club.rubric(g)).length === 6
    && Object.values(s6.club.rubric(g)).every((r) => r.length === 5)));
  ok('남녀 문구가 다르다', s6.club.rubricText('speed', 5, '남') !== s6.club.rubricText('speed', 5, '여'));
  ok('여성 기준은 혼성 경기를 언급', /남성 평균과 대등/.test(s6.club.rubricText('speed', 5, '여')), s6.club.rubricText('speed', 5, '여'));
  ok('성별 미입력은 남성 기준', s6.club.rubricText('speed', 5, null) === s6.club.rubricText('speed', 5, '남'));
  ok('기준 문구에 측정 경계값 자동 삽입', /8\.0초 이하/.test(s6.club.rubricText('speed', 5, '남')), s6.club.rubricText('speed', 5, '남'));

  s6.club.setRubricText('male', 'shoot', 5, '우리 팀 해결사');
  ok('문구 편집', s6.club.rubric('male').shoot[4] === '우리 팀 해결사');
  s6.club.resetRubric('male');
  ok('기본값 되돌리기', s6.club.rubric('male').shoot[4] === '결정력 팀 1위');

  // 한 팀 기본 인원 (라인업 기준)
  ok('기본 인원 11', s6.club.squadSize() === 11);
  s6.club.setSquadSize(7); ok('기본 인원 변경', s6.club.squadSize() === 7);
  s6.club.setSquadSize(8); ok('허용값만 (8 → 11로 복귀)', s6.club.squadSize() === 11);
}

console.log('\n[v0.6.0] 측정 기록 → 자동 환산');
{
  const S = await import('../store.js');
  const s7 = S.createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await s7.init();
  ok('초.소수 파싱', S.parseTestInput('shuttle20', '9.4') === 9.4);
  ok('분:초 파싱', S.parseTestInput('run1500', '7:20') === 440);
  ok('잘못된 입력은 null', S.parseTestInput('run1500', '7:90') === null && S.parseTestInput('shuttle20', '개') === null);
  ok('표기', S.formatTestValue('run1500', 440) === '7:20' && S.formatTestValue('shuttle20', 8) === '8.0초');

  ok('남 경계 8.0 = 5점 / 8.1 = 4점', S.scoreFromTest('shuttle20', 8, '남') === 5 && S.scoreFromTest('shuttle20', 8.1, '남') === 4);
  ok('남 11.5 = 2점 / 11.6 = 1점', S.scoreFromTest('shuttle20', 11.5, '남') === 2 && S.scoreFromTest('shuttle20', 11.6, '남') === 1);
  ok('여 9.5 = 5점 / 13.1 = 1점', S.scoreFromTest('shuttle20', 9.5, '여') === 5 && S.scoreFromTest('shuttle20', 13.1, '여') === 1);
  ok('1.5km 남 6:00 = 5점', S.scoreFromTest('run1500', 360, '남') === 5 && S.scoreFromTest('run1500', 361, '남') === 4);
  ok('1.5km 여 7:30 = 5점', S.scoreFromTest('run1500', 450, '여') === 5);

  const w = s7.members.add({ name: '김하나', gender: '여' });
  s7.members.setTest(w.id, 'shuttle20', 9.4);
  ok('기록 넣으면 스피드 자동 5점(여성 기준)', s7.members.byId(w.id).abil.speed === 5);
  ok('측정일 자동 기록', !!s7.members.byId(w.id).tests.shuttle20.at);
  ok('기록 있으면 잠김', s7.members.isTestLocked(w.id, 'speed') === true);
  s7.members.setAbil(w.id, { speed: 1 });
  ok('잠긴 항목은 기록이 이긴다(재계산)', (s7.members.recomputeTestScores(), s7.members.byId(w.id).abil.speed) === 5);
  s7.members.setTestManual(w.id, 'shuttle20', true);
  ok('잠금 해제하면 수동 허용', s7.members.isTestLocked(w.id, 'speed') === false);
  s7.members.setAbil(w.id, { speed: 2 });
  s7.members.recomputeTestScores();
  ok('해제 상태에선 수동 점수 유지', s7.members.byId(w.id).abil.speed === 2);
  s7.members.setTestManual(w.id, 'shuttle20', false);
  ok('다시 잠그면 기록 기준 복귀', s7.members.byId(w.id).abil.speed === 5);

  // 경계값을 고치면 점수가 따라 움직인다
  s7.club.setTestThreshold('shuttle20', 'female', 0, 9);   // 5점 경계 9.5 → 9.0
  ok('경계값 수정 → 자동 재계산', s7.members.byId(w.id).abil.speed === 4, String(s7.members.byId(w.id).abil.speed));
  s7.club.resetTestThresholds();
  ok('경계값 되돌리기', s7.members.byId(w.id).abil.speed === 5);

  s7.members.setTest(w.id, 'shuttle20', null);
  ok('기록 삭제', s7.members.byId(w.id).tests.shuttle20 === null && s7.members.isTestLocked(w.id, 'speed') === false);

  // JSON 왕복
  s7.members.setTest(w.id, 'run1500', 440);
  s7.club.setSquadSize(7);
  s7.club.setRubricText('female', 'shoot', 5, '우리 팀 해결사');
  const s8 = S.createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await s8.init();
  await s8.importJSON(s7.exportJSON());
  ok('JSON 왕복 — 기록', s8.members.all()[0].tests.run1500.sec === 440);
  ok('JSON 왕복 — 기준표', s8.club.rubric('female').shoot[4] === '우리 팀 해결사');
  ok('JSON 왕복 — 기본 인원', s8.club.squadSize() === 7);
  ok('옛 백업(기준표 없음)도 기본값으로 채움', await (async () => {
    const s9 = S.createStore({ load: async () => null, save: async () => true, clear: async () => {} });
    await s9.init();
    await s9.importJSON(JSON.stringify({ data: { members: [{ id: 'm1', name: '홍길동' }], matches: [], tactics: [] } }));
    return s9.club.rubric('male').speed.length === 5 && s9.club.squadSize() === 11 && s9.members.all()[0].tests.shuttle20 === null;
  })());
}

console.log(`\n결과: ${pass} PASS / ${fail} FAIL\n`);
process.exit(fail ? 1 : 0);
