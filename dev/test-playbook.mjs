/* S6 단위 테스트 (node dev/test-playbook.mjs) — 전술 플레이북(기본 전술 라이브러리)
 * 마스터플랜: 사장님 피드백 "기본 전술은 내가 넣어야 되는 구조야?" — 미리 15개가 들어 있고 고르고 고치는 구조.
 * 검증 대상: 내장 15개(BUILTIN_PLAYBOOKS) 구성·좌표 유효성, normalizePlaybook 클램프/패딩,
 *           store.playbooks CRUD, 사용자 저장("내 전술로 저장") 시 내장 원본이 손대지지 않음(불변·복사본),
 *           JSON 백업 왕복(사용자 플레이북만 실림, 내장은 코드 상수라 제외), 합치기 재실행 시 중복 없음.
 * 실행: node dev/test-playbook.mjs
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
  createStore, FORMATION_PRESETS, formationSlots, BUILTIN_PLAYBOOKS, normalizePlaybook,
} = await import('../store.js');

console.log('\n[1] 내장 플레이북 15개 = 포메이션 변형 10 + 세트피스 완성형 5');
ok('총 15개', BUILTIN_PLAYBOOKS.length === 15, `count=${BUILTIN_PLAYBOOKS.length}`);
ok('모두 builtin:true', BUILTIN_PLAYBOOKS.every((p) => p.builtin === true));
ok('id 전부 고유', new Set(BUILTIN_PLAYBOOKS.map((p) => p.id)).size === 15);
const setpieces = BUILTIN_PLAYBOOKS.filter((p) => p.kind === 'setpiece');
ok('세트피스 완성형 5개(코너 공격 A/B·코너 수비·프리킥 공격·킥오프)', setpieces.length === 5, setpieces.map((p) => p.name).join(' / '));
const formationVariants = BUILTIN_PLAYBOOKS.filter((p) => p.kind !== 'setpiece');
ok('포메이션 변형 10개', formationVariants.length === 10);
ok('5개 포메이션(4-4-2·4-3-3·4-2-3-1·3-5-2·5-3-2) 각 2개씩', FORMATION_PRESETS.every(
  (f) => formationVariants.filter((p) => p.formation === f).length === 2,
), FORMATION_PRESETS.map((f) => `${f}:${formationVariants.filter((p) => p.formation === f).length}`).join(' '));
ok('kind 는 defense/press/buildup/setpiece 중 하나', BUILTIN_PLAYBOOKS.every((p) => ['defense', 'press', 'buildup', 'setpiece'].includes(p.kind)));

console.log('\n[2] 좌표·문안 유효성');
for (const p of BUILTIN_PLAYBOOKS) {
  const needOur = formationSlots(p.formation).length;
  const needOpp = formationSlots(p.oppFormation).length;
  ok(`${p.name}: 우리 핀 수 = 슬롯 수(${needOur})`, p.ourPins.length === needOur);
  ok(`${p.name}: 상대 핀 수 = 슬롯 수(${needOpp})`, p.oppPins.length === needOpp);
  ok(`${p.name}: 우리 핀 0번은 GK`, p.ourPins[0].gk === true);
  ok(`${p.name}: 모든 좌표 0~100 % 안`, [...p.ourPins, ...p.oppPins].every((pt) => pt.x >= 0 && pt.x <= 100 && pt.y >= 0 && pt.y <= 100));
  ok(`${p.name}: 화살표도 0~100 % 안(있으면)`, p.arrows.every((a) => [a.x1, a.y1, a.x2, a.y2].every((v) => v >= 0 && v <= 100)));
  ok(`${p.name}: 공 좌표 있으면 0~100 % 안`, !p.ball || (p.ball.x >= 0 && p.ball.x <= 100 && p.ball.y >= 0 && p.ball.y <= 100));
  ok(`${p.name}: 한 문장 설명(note)이 있다`, typeof p.note === 'string' && p.note.length >= 8, p.note);
  ok(`${p.name}: memberId 를 담지 않는다(재사용 가능해야 함)`, p.ourPins.every((pt) => !('memberId' in pt)));
}
const withBall = setpieces.filter((p) => p.ball);
ok('세트피스 5개 모두 공 좌표가 있다(우리 공격 4개 + 코너 수비 때 상대가 차는 공 위치 1개)', withBall.length === 5, withBall.map((p) => p.name).join(' / '));

console.log('\n[3] normalizePlaybook — 클램프·패딩(깨진 저장본도 화면이 죽지 않는다)');
{
  const broken = normalizePlaybook({
    name: '  ', formation: '알수없음', oppFormation: '3-5-2',
    ourPins: [{ x: -50, y: 999, gk: false }],   // 1개만 있고 나머지 없음 + 범위 밖
    oppPins: null,
    arrows: [{ x1: 5, y1: 5 }],   // 좌표 일부 누락
    ball: { x: 500, y: -5 },
    builtin: true,   // 사용자 생성 시 강제로 false 로 덮이는지는 store.playbooks.add 에서 별도 확인
  });
  ok('이름이 비면 기본 이름을 채운다', broken.name === '이름 없는 전술');
  ok('모르는 포메이션은 기본값(FORMATION_PRESETS[0])으로', broken.formation === FORMATION_PRESETS[0]);
  ok('우리 핀은 슬롯 수(11)로 패딩', broken.ourPins.length === 11);
  ok('상대 핀은 slots(3-5-2, 11)로 패딩', broken.oppPins.length === formationSlots('3-5-2').length);
  ok('범위 밖 좌표는 0~100 으로 클램프', broken.ourPins[0].x === 0 && broken.ourPins[0].y === 100);
  ok('화살표 누락 좌표는 0 으로 클램프', broken.arrows[0].x2 === 0 && broken.arrows[0].y2 === 0);
  ok('공 좌표도 클램프', broken.ball.x === 100 && broken.ball.y === 0);
}

console.log('\n[4] store.playbooks CRUD — "내 전술로 저장"은 항상 사용자 플레이북(builtin:false)');
{
  const store = createStore();
  await store.init();
  ok('처음엔 사용자 플레이북 0개(내장은 별도 상수)', store.playbooks.all().length === 0);

  // 불러오기 → 보드에 적용 → 손으로 고치기(가정) → "내 전술로 저장"
  const base = BUILTIN_PLAYBOOKS.find((p) => p.id === 'pb_442_low');
  const edited = {
    name: '우리 팀 전용 낮은 블록', note: '측면을 더 좁혀서 지킨다',
    formation: base.formation, oppFormation: base.oppFormation,
    ourPins: base.ourPins.map((p, i) => (i === 1 ? { ...p, x: p.x + 5 } : { ...p })),   // 손으로 한 자리만 옮김
    oppPins: base.oppPins.map((p) => ({ ...p })),
    arrows: base.arrows.map((a) => ({ ...a })),
    ball: base.ball,
    builtin: true,   // 사용자가 보낸 값이 true 여도 store.playbooks.add 는 무시하고 false 로 저장해야 한다
  };
  const saved = store.playbooks.add(edited);
  ok('저장되면 사용자 플레이북에 1개', store.playbooks.all().length === 1);
  ok('저장본은 builtin:false(내장 아님)로 강제된다', saved.builtin === false);
  ok('새 id 발급(내장 id 와 겹치지 않음)', saved.id !== base.id && !BUILTIN_PLAYBOOKS.some((p) => p.id === saved.id));
  ok('고친 좌표가 그대로 저장된다', saved.ourPins[1].x === base.ourPins[1].x + 5);

  console.log('\n[5] 내장 원본은 절대 손대지지 않는다(불변)');
  ok('BUILTIN_PLAYBOOKS 의 pb_442_low 좌표는 그대로', BUILTIN_PLAYBOOKS.find((p) => p.id === 'pb_442_low').ourPins[1].x === base.ourPins[1].x);
  ok('BUILTIN_PLAYBOOKS 총 개수도 그대로 15개(추가 안 됨)', BUILTIN_PLAYBOOKS.length === 15);

  console.log('\n[6] 수정·삭제');
  store.playbooks.update(saved.id, { name: '이름 바꿈' });
  ok('수정', store.playbooks.byId(saved.id).name === '이름 바꿈');
  store.playbooks.remove(saved.id);
  ok('삭제', !store.playbooks.byId(saved.id));
}

console.log('\n[7] JSON 백업 왕복 — 사용자 플레이북만 실리고(내장은 코드 상수라 제외), 합치기 재실행해도 중복 없음');
{
  const src = createStore();
  await src.init();
  const p1 = src.playbooks.add({ name: '내보내기용 전술', note: '테스트', formation: '4-3-3', oppFormation: '4-4-2', ourPins: [], oppPins: [], arrows: [], ball: null });

  const json = src.exportJSON();
  ok('내보낸 JSON 에 내장 15개는 안 실리고 사용자 1개만 실린다', JSON.parse(json).data.playbooks.length === 1);

  const dst = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await dst.init();
  const r = await dst.importJSON(json);
  ok('가져오기 결과에 playbooks 수 포함', r.playbooks === 1, JSON.stringify(r));
  ok('사용자 플레이북 왕복', dst.playbooks.all().length === 1 && dst.playbooks.byId(p1.id)?.name === '내보내기용 전술');
  ok('새 기기에서도 내장 15개는 코드 상수로 그대로 존재(가져오기와 무관)', BUILTIN_PLAYBOOKS.length === 15);

  const r2 = await dst.importJSON(json, { merge: true });
  ok('합치기 재실행해도 중복 없음', dst.playbooks.all().length === 1, `count=${dst.playbooks.all().length}`);
}

console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
