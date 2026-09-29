/* S2 단위 테스트 (node dev/test-opponent.mjs) — 상대팀 카드 · 경기 기록 · 전적 자동 계산
 * 마스터플랜 C:/종합상사/data/plans/soccer_app_v1_tactics_masterplan_2026-09-29.md §2·§4(S2)
 * 검증 대상: 전적 계산(승/무/패·득실) · 경기 삭제/수정 시 재계산 · 상대 삭제 시 경기 보존(데이터 손실 0) ·
 *           회원 삭제 시 라인업·득점자 정리 · JSON 백업 왕복(합치기 기본) · 마이그레이션 무손실.
 * 실행: node dev/test-opponent.mjs
 */
process.env.TZ = 'Asia/Seoul';

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

const { createStore, formationSlots, FORMATION_PRESETS } = await import('../store.js');

console.log('\n[1] 포메이션 슬롯');
ok('4-3-3 = 11자리(GK 포함)', formationSlots('4-3-3').length === 11);
ok('4-3-3 GK 1명', formationSlots('4-3-3').filter((p) => p === 'GK').length === 1);
ok('모르는 포메이션도 11자리로 자리를 채운다', formationSlots('알수없음').length === 11);
ok('프리셋 5개', FORMATION_PRESETS.length === 5);

console.log('\n[2] 상대팀 카드 CRUD + 전적 자동 계산');
const store = createStore();
await store.init();
const players = store.members.bulkAdd(['한가람', '오태경', '서보라', '김단비', '류현우']);
const opp = store.opponents.add({ name: '은빛FC', formation: '4-4-2', keyPlayers: '10번 킥', strengths: '체력', weaknesses: '측면' });
ok('상대 카드 생성', !!opp.id && opp.name === '은빛FC');
ok('생성 직후 전적은 0', opp.record.w === 0 && opp.record.gf === 0);
ok('record 는 직접 넣어도 무시된다(계산값만 인정)', store.opponents.update(opp.id, { record: { w: 99, d: 0, l: 0, gf: 1, ga: 1 } }).record.w === 0);

const g1 = store.matches.add({ date: '2026-09-20', opponentId: opp.id, home: true, place: '홈구장', status: '종료' });
const g2 = store.matches.add({ date: '2026-09-25', opponentId: opp.id, home: false, place: '', status: '종료' });
const g3 = store.matches.add({ date: '2026-09-28', opponentId: opp.id, home: true, status: '예정' });   // 결과 없음 → 전적에 안 들어감

store.matches.update(g1.id, { result: { gf: 3, ga: 1 }, scorers: [{ memberId: players[0].id, count: 2, assistId: players[1].id }, { memberId: players[2].id, count: 1 }] });
store.matches.update(g2.id, { result: { gf: 0, ga: 0 } });

let opp2 = store.opponents.byId(opp.id);
ok('승 1 · 무 1 (결과 없는 경기는 전적에서 제외)', opp2.record.w === 1 && opp2.record.d === 1 && opp2.record.l === 0, JSON.stringify(opp2.record));
ok('득실 = 3+0 : 1+0', opp2.record.gf === 3 && opp2.record.ga === 1);
ok('득점자 2명 · 도움 반영', store.matches.byId(g1.id).scorers.length === 2 && store.matches.byId(g1.id).scorers[0].assistId === players[1].id);

store.matches.update(g2.id, { result: { gf: 0, ga: 2 } });   // 무 → 패로 정정
opp2 = store.opponents.byId(opp.id);
ok('결과 수정 시 전적 재계산 (무→패)', opp2.record.w === 1 && opp2.record.d === 0 && opp2.record.l === 1, JSON.stringify(opp2.record));

store.matches.remove(g1.id);
opp2 = store.opponents.byId(opp.id);
ok('경기 삭제 시 전적 재계산 (승 1건 빠짐)', opp2.record.w === 0 && opp2.record.l === 1, JSON.stringify(opp2.record));

console.log('\n[3] 상대 카드 삭제 = 경기 기록 보존 (데이터 손실 0)');
const beforeMatches = store.matches.all().length;
store.opponents.remove(opp.id);
ok('상대 카드는 사라진다', !store.opponents.byId(opp.id));
ok('경기 건수는 그대로 (데이터 손실 0)', store.matches.all().length === beforeMatches);
ok('경기의 상대 연결만 해제된다', store.matches.byId(g2.id).opponentId === null);

console.log('\n[4] 회원 삭제 시 라인업·득점자 정리');
{
  const opp3 = store.opponents.add({ name: '해오름FC' });
  const g = store.matches.add({ date: '2026-10-01', opponentId: opp3.id });
  store.matches.update(g.id, {
    lineup: { formation: '4-3-3', slots: [players[3].id, players[0].id, null, null, null, null, null, null, null, null, null] },
    result: { gf: 2, ga: 0 },
    scorers: [{ memberId: players[0].id, count: 1, assistId: players[3].id }],
  });
  store.members.remove(players[0].id);
  const gAfter = store.matches.byId(g.id);
  ok('삭제된 회원은 라인업 슬롯에서 빠진다', !gAfter.lineup.slots.includes(players[0].id));
  ok('삭제된 회원이 득점자였으면 그 줄이 빠진다', gAfter.scorers.every((s) => s.memberId !== players[0].id));
  ok('삭제된 회원이 도움이었으면 도움만 null', gAfter.scorers.length === 0 || gAfter.scorers.every((s) => s.assistId !== players[0].id));
  ok('경기 자체·득실은 그대로 남는다', gAfter.result.gf === 2);
}

console.log('\n[5] JSON 백업 왕복 (S2 필드 포함)');
{
  const src = createStore();
  await src.init();
  const p = src.members.bulkAdd(['문세훈', '강하준']);
  const o = src.opponents.add({ name: '늘봄FC', formation: '3-5-2' });
  src.opponents.addNote(o.id, '측면이 느리다');
  const g = src.matches.add({ date: '2026-09-29', opponentId: o.id, home: false, place: '보조구장' });
  src.matches.update(g.id, {
    lineup: { formation: '3-5-2', slots: formationSlotsSafe() },
    result: { gf: 1, ga: 1 },
    scorers: [{ memberId: p[0].id, count: 1, assistId: null }],
    review: '후반 집중력 저하',
  });
  function formationSlotsSafe() { return Array(formationSlots('3-5-2').length).fill(null).map((_, i) => (i === 1 ? p[0].id : null)); }

  const json = src.exportJSON();
  const dst = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await dst.init();
  const r = await dst.importJSON(json);
  ok('가져오기에 opponents 수가 잡힌다', r.opponents === 1, JSON.stringify(r));
  const oppD = dst.opponents.all()[0];
  ok('상대 카드 왕복', oppD?.name === '늘봄FC' && oppD.formation === '3-5-2');
  ok('메모 왕복', oppD.notes.length === 1 && oppD.notes[0].text === '측면이 느리다');
  const gD = dst.matches.all().find((x) => x.review === '후반 집중력 저하');
  ok('경기 필드(홈/원정·장소·결과·총평) 왕복', gD && gD.home === false && gD.place === '보조구장' && gD.result.gf === 1);
  ok('득점자 왕복 (id 는 새 기기 기준으로 다시 연결)', gD.scorers.length === 1 && !!dst.members.byId(gD.scorers[0].memberId));
  ok('라인업 slots 도 새 회원 id 로 이어진다', gD.lineup.slots.includes(gD.scorers[0].memberId));
  ok('가져온 뒤 전적도 계산돼 있다', dst.opponents.byId(oppD.id).record.d === 1);
}

console.log('\n[6] 합치기 가져오기 — 같은 이름 상대는 하나로, 메모는 중복 없이 이어붙는다');
{
  const a = createStore();
  await a.init();
  const oa = a.opponents.add({ name: '중복FC', strengths: '스피드' });
  a.opponents.addNote(oa.id, '첫 메모');
  const jsonA = a.exportJSON();

  const b = createStore();
  await b.init();
  const ob = b.opponents.add({ name: '중복FC', weaknesses: '체력' });   // 같은 이름, 다른 id
  b.opponents.addNote(ob.id, '첫 메모');   // 같은 메모 — 중복으로 안 늘어야 함
  const r = await b.importJSON(jsonA, { merge: true });
  ok('같은 이름 상대는 합쳐진다 (카드 1장 유지)', b.opponents.all().length === 1, `count=${b.opponents.all().length}`);
  const merged = b.opponents.all()[0];
  ok('빈 칸(강점)만 채워진다', merged.strengths === '스피드' && merged.weaknesses === '체력');
  ok('같은 메모는 중복으로 늘지 않는다', merged.notes.length === 1, `notes=${merged.notes.length}`);
}

console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
