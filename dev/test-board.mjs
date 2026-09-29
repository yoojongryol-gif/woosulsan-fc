/* S3 단위 테스트 (node dev/test-board.mjs) — 전술보드 준비 모드
 * 마스터플랜 C:/종합상사/data/plans/soccer_app_v1_tactics_masterplan_2026-09-29.md §3·§4(S3)
 * 검증 대상: 포메이션 좌표 자동 배치(layoutFormation) · 라인업→핀 변환(buildOurPins/buildOppPins) ·
 *           보드 스냅샷 정규화·좌표 클램프 · match.boardSnapshot 왕복(저장/JSON 백업) ·
 *           회원 삭제 시 보드 핀 공석 처리(데이터 손실 0) · 화살표 직렬화 · 세트피스 템플릿.
 * 실행: node dev/test-board.mjs
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

const {
  createStore, formationSlots, FORMATION_PRESETS,
  layoutFormation, buildOurPins, buildOppPins, SET_PIECE_TEMPLATES,
} = await import('../store.js');

console.log('\n[1] 포메이션 좌표 자동 배치 (layoutFormation)');
for (const f of FORMATION_PRESETS) {
  const us = layoutFormation(f, 'us');
  const opp = layoutFormation(f, 'opp');
  ok(`${f} 우리 좌표 수 = 슬롯 수`, us.length === formationSlots(f).length, `${us.length}/${formationSlots(f).length}`);
  ok(`${f} 상대 좌표 수 = 슬롯 수`, opp.length === formationSlots(f).length);
  ok(`${f} 우리 GK 는 아래쪽 절반(y>50)`, us[0].y > 50, `y=${us[0].y}`);
  ok(`${f} 상대 GK 는 위쪽 절반(y<50)`, opp[0].y < 50, `y=${opp[0].y}`);
  ok(`${f} 우리 선수는 모두 하프라인(50) 아래`, us.every((p) => p.y >= 50));
  ok(`${f} 상대 선수는 모두 하프라인(50) 위`, opp.every((p) => p.y <= 50));
  ok(`${f} 모든 좌표는 0~100 % 범위 안`, [...us, ...opp].every((p) => p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100));
}
ok('모르는 포메이션도 11자리(4-3-3 얼개)로 좌표를 낸다', layoutFormation('알수없음', 'us').length === 11);

console.log('\n[2] 라인업 → 우리 핀 / 상대 포메이션 → 상대 핀');
{
  const store = createStore();
  await store.init();
  const [p1, p2] = store.members.bulkAdd(['한가람', '오태경']);
  const slots = formationSlots('4-3-3').map((_, i) => (i === 0 ? p1.id : (i === 1 ? p2.id : null)));
  const pins = buildOurPins('4-3-3', slots, (id) => store.members.byId(id));
  ok('우리 핀 수 = 슬롯 수', pins.length === formationSlots('4-3-3').length);
  ok('GK 자리에 회원 이름이 채워진다', pins[0].memberId === p1.id && pins[0].name === '한가람' && pins[0].gk === true);
  ok('빈 자리는 memberId null', pins.slice(2).every((x) => x.memberId === null));

  const oppPins = buildOppPins('4-4-2');
  ok('상대 핀 수 = 4-4-2 슬롯 수(11)', oppPins.length === 11);
  ok('상대 핀은 이름 없이 포지션 표식만', oppPins.every((x) => typeof x.pos === 'string' && !('memberId' in x)));
  ok('상대 GK 표식', oppPins[0].pos === 'GK');
}

console.log('\n[3] 세트피스 템플릿');
ok('4개 템플릿(코너 좌/우·프리킥·킥오프)', Object.keys(SET_PIECE_TEMPLATES).length === 4);
for (const [k, t] of Object.entries(SET_PIECE_TEMPLATES)) {
  ok(`${k} 공 좌표가 0~100 안`, t.ball.x >= 0 && t.ball.x <= 100 && t.ball.y >= 0 && t.ball.y <= 100);
}

console.log('\n[4] match.boardSnapshot 정규화 · 저장 · 스냅샷 왕복');
{
  const store = createStore();
  await store.init();
  const [p1] = store.members.bulkAdd(['문세훈']);
  const opp = store.opponents.add({ name: '은빛FC', formation: '4-4-2' });
  const g = store.matches.add({ date: '2026-10-05', opponentId: opp.id });
  ok('저장 전 boardSnapshot 은 null', store.matches.byId(g.id).boardSnapshot === null);

  const snap = {
    formation: '4-3-3', oppFormation: '4-4-2',
    ourPins: buildOurPins('4-3-3', [p1.id], (id) => store.members.byId(id)),
    oppPins: buildOppPins('4-4-2'),
    arrows: [{ x1: 10, y1: 120, x2: 40, y2: 90, style: 'dashed' }, { x1: 5, y1: 5 }],   // 두 번째는 좌표 일부 누락(자가검증)
    ball: { x: 3, y: 5 },
    setPiece: 'corner-left',
  };
  const saved = store.matches.update(g.id, { boardSnapshot: snap });
  ok('저장하면 boardSnapshot 이 생긴다', !!saved.boardSnapshot);
  ok('우리 핀 11자리 유지', saved.boardSnapshot.ourPins.length === 11);
  ok('상대 핀 11자리 유지', saved.boardSnapshot.oppPins.length === 11);
  ok('화살표 2개 모두 직렬화(누락 좌표는 0으로 클램프)', saved.boardSnapshot.arrows.length === 2 && saved.boardSnapshot.arrows[1].x2 === 0);
  ok('화살표 style 보존(대시)', saved.boardSnapshot.arrows[0].style === 'dashed');
  ok('공 좌표 보존', saved.boardSnapshot.ball.x === 3 && saved.boardSnapshot.ball.y === 5);
  ok('세트피스 키 보존', saved.boardSnapshot.setPiece === 'corner-left');

  ok('좌표 범위를 벗어나면 0~100 % 로 클램프', (() => {
    const r = store.matches.update(g.id, {
      boardSnapshot: { ...snap, ourPins: [{ x: -30, y: 999, memberId: null, name: '', gk: true }, ...snap.ourPins.slice(1)] },
    });
    return r.boardSnapshot.ourPins[0].x === 0 && r.boardSnapshot.ourPins[0].y === 100;
  })());

  store.matches.update(g.id, { boardSnapshot: snap });   // 클램프 테스트로 지운 회원 배치를 원래대로 복구(JSON 왕복 검증 전)
  ok('경기를 다시 불러와도 boardSnapshot 이 그대로', store.matches.byId(g.id).boardSnapshot.formation === '4-3-3');

  console.log('  [4-1] JSON 백업 왕복');
  const json = store.exportJSON();
  const dst = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await dst.init();
  await dst.importJSON(json);
  const gD = dst.matches.all().find((x) => x.date === '2026-10-05');
  ok('boardSnapshot 이 JSON 왕복 후에도 남는다', !!gD?.boardSnapshot);
  ok('화살표·공·세트피스까지 왕복', gD.boardSnapshot.arrows.length === 2 && gD.boardSnapshot.ball.x === 3 && gD.boardSnapshot.setPiece === 'corner-left');
  ok('우리 핀의 memberId 는 새 기기 회원 id 로 다시 연결된다', !!dst.members.byId(gD.boardSnapshot.ourPins.find((p) => p.memberId).memberId));
}

console.log('\n[5] 회원 삭제 시 보드 핀 공석 처리 (데이터 손실 0)');
{
  const store = createStore();
  await store.init();
  const [p1, p2] = store.members.bulkAdd(['강하준', '류현우']);
  const g = store.matches.add({ date: '2026-10-06' });
  const slots = formationSlots('4-3-3').map((_, i) => (i === 0 ? p1.id : (i === 1 ? p2.id : null)));
  store.matches.update(g.id, {
    boardSnapshot: {
      formation: '4-3-3', oppFormation: '4-3-3',
      ourPins: buildOurPins('4-3-3', slots, (id) => store.members.byId(id)),
      oppPins: buildOppPins('4-3-3'),
      arrows: [], ball: null, setPiece: null,
    },
  });
  store.members.remove(p1.id);
  const gAfter = store.matches.byId(g.id);
  const gkSlot = gAfter.boardSnapshot.ourPins[0];
  ok('삭제된 회원 자리는 공석(memberId null)으로 풀린다', gkSlot.memberId === null && gkSlot.name === '');
  ok('GK 좌표·표식 자체는 그대로 남는다(자리는 안 사라짐)', gkSlot.gk === true && gkSlot.y > 50);
  ok('남은 선수 자리는 그대로', gAfter.boardSnapshot.ourPins[1].memberId === p2.id);
}

console.log('\n[6] 포메이션이 바뀌면 슬롯 수도 같이 바뀐다 (자리 수 불일치 방지)');
{
  const store = createStore();
  await store.init();
  const g = store.matches.add({ date: '2026-10-07' });
  store.matches.update(g.id, {
    boardSnapshot: {
      formation: '3-5-2', oppFormation: '5-3-2',
      ourPins: buildOurPins('3-5-2', [], () => null),
      oppPins: buildOppPins('5-3-2'),
      arrows: [], ball: null, setPiece: null,
    },
  });
  const s = store.matches.byId(g.id).boardSnapshot;
  ok('3-5-2 우리 핀 11자리', s.ourPins.length === 11);
  ok('5-3-2 상대 핀 11자리', s.oppPins.length === 11);
  ok('저장된 포메이션 문자열도 그대로', s.formation === '3-5-2' && s.oppFormation === '5-3-2');
}

console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
