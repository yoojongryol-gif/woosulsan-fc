/* v0.7 → v1.0 마이그레이션 단위 테스트
 *  - 회원 수·보존 필드가 그대로인지 (데이터 손실 0)
 *  - 팀 관련 값이 정말 사라졌는지
 *  - 마이그레이션 직전 자동 백업이 남고, 그 백업으로 되돌릴 수 있는지
 * 실행: node dev/test-migrate.mjs      (이름은 모두 가명)
 */
process.env.TZ = 'Asia/Seoul';

let pass = 0; let fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass += 1; console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail += 1; console.error(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
}

/* localStorage 흉내 (자동 백업이 여기로 들어간다) */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
};

const { createStore, SCHEMA_VERSION, LEGACY_BACKUP_KEY } = await import('../store.js');

/** v0.7.0 이 실제로 저장하던 모양 (회원 6명 · 경기 2건) */
function v07Sample() {
  return {
    schema: 2,
    club: {
      name: '웃을산 FC',
      teamNames: { A: '교역', B: '장년', C: '청년', D: '체육', E: '학생', F: '새 팀' },
      teamOrder: ['A', 'B', 'C', 'D', 'E'],
      teamAliases: { A: '교', B: '장', C: '청', D: '체', E: '학', F: '' },
      mixedTeams: ['D'], lockWomen: true, mixedFactor: 0.9, squadSize: 9,
      coaches: { A: 'm1', B: null, C: null, D: null, E: null, F: null },
      rubric: null, tests: null,
    },
    members: [
      { id: 'm1', name: '한가람', pos: 'FW', gk: false, team: 'A', birthYear: 1995, gender: '여',
        abil: { speed: 4, stamina: 3, basic: 4, shoot: 5, defense: 2, physical: 4 },
        tests: { shuttle20: { sec: 9.4, at: '2026-09-01T00:00:00.000Z', manual: false } },
        active: true, createdAt: '2026-08-01T00:00:00.000Z' },
      { id: 'm2', name: '오태경', pos: 'DF', gk: false, team: 'B', birthYear: 1985, gender: '남',
        abil: { speed: 3, stamina: 4, basic: 3, shoot: 2, defense: 5, physical: 4 }, active: true },
      { id: 'm3', name: '서보라', pos: 'MF', gk: false, team: 'D', birthYear: 1996, gender: '여',
        abil: {}, active: true },
      { id: 'm4', name: '김단비', pos: 'GK', gk: true, team: 'C', birthYear: 2003, gender: '남', active: true },
      { id: 'm5', name: '류현우', pos: 'MF', gk: false, team: 'E', birthYear: null, gender: null, active: true },
      { id: 'm6', name: '문세훈', pos: 'FW', gk: false, team: null, birthYear: 1990, gender: '남', active: false },
    ],
    matches: [
      { id: 'g1', date: '2026-09-25', time: '20:00', place: '해구대 구장', status: '종료',
        teamCount: 2, teams: [['m1', 'm2'], ['m3', 'm4']],
        teamPlan: { mode: 'merge', groups: [['A', 'B'], ['C', 'D']], labels: ['교역+장년', '청년+체육'] },
        attendance: { m1: 'in', m2: 'in', m3: 'in', m4: 'in', m5: 'out', m6: 'maybe' } },
      { id: 'g2', date: '2026-10-02', time: '19:30', place: '', status: '예정',
        attendance: { m1: 'in', m5: 'in' } },
    ],
    tactics: [{ id: 't1', matchId: 'g1', pins: [{ memberId: 'm1', x: 10, y: 20 }] }],
    updatedAt: '2026-09-27T00:00:00.000Z',
  };
}

function adapterOf(initial) {
  let saved = initial ? JSON.parse(JSON.stringify(initial)) : null;
  return {
    async load() { return saved; },
    async save(s) { saved = JSON.parse(JSON.stringify(s)); return true; },
    async clear() { saved = null; },
    peek() { return saved; },
  };
}

console.log('\n== v0.7 → v1.0 마이그레이션 ==');
const src = v07Sample();
const ad = adapterOf(src);
const store = createStore(ad);
const st = await store.init();

ok('스키마가 3으로 올라간다', st.schema === SCHEMA_VERSION, `schema=${st.schema}`);
ok('회원 수 무손실', st.members.length === src.members.length, `${src.members.length} → ${st.members.length}`);
ok('경기 수 무손실', st.matches.length === src.matches.length, `${st.matches.length}건`);
ok('전술 수 무손실', st.tactics.length === src.tactics.length);

const keep = ['id', 'name', 'pos', 'gk', 'birthYear', 'gender', 'abil', 'tests', 'active'];
let sameAll = true; const diffs = [];
for (const before of src.members) {
  const after = st.members.find((m) => m.id === before.id);
  if (!after) { sameAll = false; diffs.push(`${before.name} 사라짐`); continue; }
  for (const k of keep) {
    if (before[k] === undefined) continue;
    const a = JSON.stringify(after[k]); const b = JSON.stringify(before[k]);
    if (k === 'abil' || k === 'tests') continue;      // 정규화로 빈 칸이 null 로 채워진다 (아래에서 따로)
    if (a !== b) { sameAll = false; diffs.push(`${before.name}.${k}: ${b} → ${a}`); }
  }
}
ok('보존 필드 동일 (이름·포지션·GK·출생년도·성별·활동)', sameAll, diffs.join(' / '));

const m1 = st.members.find((m) => m.id === 'm1');
ok('능력치 6항목 그대로', JSON.stringify(m1.abil) === JSON.stringify(src.members[0].abil));
ok('측정 기록 그대로', m1.tests?.shuttle20?.sec === 9.4);
ok('종합 실력 = 6항목 평균', m1.skill === 3.7, `skill=${m1.skill}`);
ok('출석 기록 그대로', JSON.stringify(st.matches[0].attendance) === JSON.stringify(src.matches[0].attendance));
ok('출석률 계산 유지', store.stats.attendance('m1').present === 2, JSON.stringify(store.stats.attendance('m1')));
ok('클럽명·측정 기준·인원 설정 유지', st.club.name === '웃을산 FC' && store.club.squadSize() === 9);

console.log('\n== 팀 구조 제거 ==');
ok('회원에 team 칸이 없다', st.members.every((m) => !('team' in m)));
ok('클럽에 팀 이름·목록·약자·감독이 없다',
  ['teamNames', 'teamOrder', 'teamAliases', 'mixedTeams', 'lockWomen', 'coaches', 'mixedFactor']
    .every((k) => !(k in st.club)), Object.keys(st.club).join(','));
ok('경기에 팀 나누기 결과가 없다',
  st.matches.every((g) => !('teams' in g) && !('teamCount' in g) && !('teamPlan' in g)));
ok('S2 자리(상대·라인업·결과)가 준비돼 있다',
  st.matches.every((g) => 'opponentId' in g && 'lineup' in g && 'result' in g) && Array.isArray(st.opponents));
ok('store 에 팀 API 가 없다',
  ['teamName', 'teamKeys', 'addTeam', 'removeTeam', 'teamAlias', 'setCoach', 'lockWomen']
    .every((k) => typeof store.club[k] !== 'function'));

console.log('\n== 자동 백업 · 되돌리기 ==');
const b = store.legacyBackup();
ok('마이그레이션 직전 자동 백업이 남았다', !!b && !!b.savedAt);
ok('백업에 옛 회원 6명이 그대로', b?.payload?.data?.members?.length === 6);
ok('백업에 옛 팀 배정이 그대로', b?.payload?.data?.members?.[0]?.team === 'A');
ok('백업 JSON 을 내려받을 수 있다', (store.legacyBackupJSON() || '').includes('"teamOrder"'));

// 두 번째 실행에서 백업이 덮어써지지 않아야 한다
const store2 = createStore(adapterOf(ad.peek()));
await store2.init();
ok('두 번째 실행에서 백업을 덮어쓰지 않는다',
  JSON.parse(mem.get(LEGACY_BACKUP_KEY)).data.members[0].team === 'A');

// 손으로 회원을 지운 뒤 백업에서 복원
store.members.remove('m2');
ok('회원 1명 삭제 반영', store.members.all().length === 5);
const r = await store.restoreLegacy();
ok('백업에서 복원하면 회원 6명이 돌아온다', store.members.all().length === 6, JSON.stringify(r.members));
ok('복원 결과도 v1.0 스키마', store.get().schema === SCHEMA_VERSION);
ok('복원 후에도 출석 기록이 살아 있다', store.stats.attendance('m1').present === 2);

console.log('\n== 가져오기 = 합치기 기본 ==');
const store3 = createStore(adapterOf(null));
await store3.init();
store3.members.add({ name: '한가람', pos: 'MF' });
const merged = await store3.importJSON(JSON.stringify({ data: v07Sample() }), { merge: true });
ok('같은 이름은 새로 만들지 않는다', store3.members.all().filter((m) => m.name === '한가람').length === 1);
ok('처음 보는 회원만 추가된다', merged.added === 5, `added=${merged.added}`);

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'}  ${pass} pass / ${fail} fail\n`);
process.exit(fail ? 1 : 0);
