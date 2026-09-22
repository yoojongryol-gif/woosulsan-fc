/* v0.5.0 테스트 — 명단 파서 · 매칭 · 성별 · 혼성팀 고정 (node dev/test-roster.mjs) */
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

const { parseRoster, matchNames, looksLikeName, chosung } = await import('../roster.js');
const { createStore, parseMemberLine, parseGender } = await import('../store.js');
const { balanceTeams, suggestMerges, groupStat } = await import('../balance.js');

console.log('\n[1] 붙여넣기 파서');
const P = (t) => parseRoster(t);
ok('① 카톡 투표 복붙', JSON.stringify(P('✅ 참석 (3)\n홍길동\n김철수\n이영희\n\n❌ 불참 (1)\n박민수'))
  === JSON.stringify({ in: ['홍길동', '김철수', '이영희'], out: ['박민수'], maybe: [] }));
ok('② 번호 한 줄', P('1. 홍길동 2. 김철수 3. 이영희').in.join() === '홍길동,김철수,이영희');
ok('③ 번호 줄바꿈', P('1. 홍길동\n2) 김철수\n③ 이영희').in.join() === '홍길동,김철수,이영희');
ok('④ 쉼표 나열', P('홍길동, 김철수, 이영희').in.length === 3);
ok('⑤ 접두 + 불참 섹션', JSON.stringify(P('참석: 홍길동, 김철수\n불참: 박민수'))
  === JSON.stringify({ in: ['홍길동', '김철수'], out: ['박민수'], maybe: [] }));
ok('⑥ 줄별 O/X/미정', JSON.stringify(P('홍길동 O\n김철수 X\n이영희 미정'))
  === JSON.stringify({ in: ['홍길동'], out: ['김철수'], maybe: ['이영희'] }));
ok('⑦ 괄호 주석 제거', P('홍길동(참석)\n김철수 (부상, 불참)').in.join() === '홍길동,김철수');
ok('⑧ 이모지·불릿', P('⚽홍길동\n- 김철수\n• 이영희').in.length === 3, P('⚽홍길동\n- 김철수\n• 이영희').in.join());
ok('⑨ 안내 문구 제외', P('이번주 경기 명단\n총 3명\n홍길동\n김철수').in.join() === '홍길동,김철수');
ok('⑩ 중복 제거', P('홍길동\n홍길동\n김철수').in.length === 2);
ok('⑪ 영문 이름', P('John Kim\nMike Park').in.length === 2);
ok('⑫ 빈 입력', JSON.stringify(P('')) === JSON.stringify({ in: [], out: [], maybe: [] }));
ok('⑬ 슬래시 나열', P('홍길동/김철수/이영희').in.length === 3);
ok('⑭ 참석/불참 헤더 여러 번', P('참석\n홍길동\n불참\n김철수\n참석\n이영희').in.join() === '홍길동,이영희');
ok('looksLikeName 필터', !looksLikeName('12') && !looksLikeName('참석') && looksLikeName('홍길동') && !looksLikeName('이번주 경기 명단'));
ok('초성 변환', chosung('홍길동') === 'ㅎㄱㄷ');

console.log('\n[2] 회원 매칭');
{
  const members = [
    { id: 'a', name: '홍길동', active: true },
    { id: 'b', name: '김철수', active: true },
    { id: 'c', name: '김철순', active: true },
    { id: 'd', name: '이 영희', active: true },
    { id: 'e', name: '박민수', active: false },
  ];
  const r = matchNames(['홍길동', '길동', '김철', '이영희', '최지우', '박민수'], members);
  ok('완전 일치', r[0].status === 'matched' && r[0].memberId === 'a');
  ok('성 제외 2글자 일치', r[1].status === 'matched' && r[1].memberId === 'a');
  ok('동명이인 후보 → multi', r[2].status === 'multi' && r[2].candidates.length === 2, r[2].candidates.map((c) => c.name).join('/'));
  ok('공백 무시 일치', r[3].status === 'matched' && r[3].memberId === 'd');
  ok('미등록 → none', r[4].status === 'none');
  ok('비활동 회원은 매칭 제외', r[5].status === 'none');
}

console.log('\n[3] 성별');
ok('성별 파싱', parseGender('여') === '여' && parseGender('F') === '여' && parseGender('남자') === '남' && parseGender('x') === null);
ok('일괄 줄 "이름 90 여"', (() => { const p = parseMemberLine('이영희 92 여'); return p.name === '이영희' && p.birthYear === 1992 && p.gender === '여'; })());
ok('순서 무관 "이름 여 90"', (() => { const p = parseMemberLine('이영희 여 92'); return p.name === '이영희' && p.birthYear === 1992 && p.gender === '여'; })());
ok('성별만', (() => { const p = parseMemberLine('김하나 F'); return p.name === '김하나' && p.gender === '여' && p.birthYear === null; })());
ok('둘 다 없음', (() => { const p = parseMemberLine('홍길동'); return p.name === '홍길동' && !p.gender && !p.birthYear; })());

const store = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
await store.init();
ok('기본 혼성팀 고정 ON', store.club.lockWomen() === true);
ok('혼성팀 미지정', store.club.mixedTeams().length === 0);
store.club.setMixed('D', true);
ok('혼성팀 지정', store.club.isMixed('D') && !store.club.isMixed('A'));

console.log('\n[4] 혼성팀 고정 규칙');
{
  // A/B/C 남자 6명씩, D 혼성(남3 여3)
  const teams = { A: [], B: [], C: [], D: [] };
  let i = 0;
  for (const k of ['A', 'B', 'C']) {
    for (let j = 0; j < 6; j += 1) { i += 1; teams[k].push(store.members.add({ name: `${k}${j}`, skill: 1 + (i % 5), team: k, gender: '남' })); }
  }
  for (let j = 0; j < 3; j += 1) { i += 1; teams.D.push(store.members.add({ name: `D남${j}`, skill: 1 + (i % 5), team: 'D', gender: '남' })); }
  for (let j = 0; j < 3; j += 1) { i += 1; teams.D.push(store.members.add({ name: `D여${j}`, skill: 1 + (i % 5), team: 'D', gender: '여' })); }

  const g = store.matches.add({ date: '2026-09-24', teamCount: 3 });
  store.members.active().forEach((m) => store.matches.setAttendance(g.id, m.id, 'in'));
  const att = store.matches.teamAttendance(g.id);
  ok('참석 24명 · 여성 3명', store.matches.attendees(g.id).length === 24 && att.D.filter((m) => m.gender === '여').length === 3);

  // (1) 합치기 제안 = 팀 단위 분할이라 여성이 흩어지지 않음
  const byTeam = {}; for (const k of ['A', 'B', 'C', 'D']) byTeam[k] = att[k];
  const sug = suggestMerges(byTeam, 3);
  const womenSplit = sug.some((cand) => {
    const counts = cand.players.map((list) => list.filter((m) => m.gender === '여').length).filter((n) => n > 0);
    return counts.length > 1;
  });
  ok('합치기 제안 — 모든 후보에서 여성이 한 묶음', !womenSplit, `후보 ${sug.length}개`);
  const stats = sug[0].players.map(groupStat);
  ok('groupStat 남녀 집계', stats.reduce((a, s) => a + s.female, 0) === 3 && stats.reduce((a, s) => a + s.male, 0) === 21,
    stats.map((s) => `남${s.male}여${s.female}`).join(' '));

  // (2) 완전 새로 섞기 + lock
  const attendees = store.matches.attendees(g.id);
  const women = attendees.filter((m) => m.gender === '여');
  const lock = Object.fromEntries(women.map((m) => [m.id, 0]));
  const r1 = balanceTeams(attendees, 3, { seed: 5, lock });
  const dist = r1.teams.map((t) => t.filter((p) => p.gender === '여').length);
  ok('섞기(고정 ON) — 여성 전원 한 팀', dist[0] === 3 && dist[1] === 0 && dist[2] === 0, `여성 분포 ${dist.join('/')}`);
  ok('섞기(고정 ON) — 인원 균등 유지', Math.max(...r1.stats.map((s) => s.size)) - Math.min(...r1.stats.map((s) => s.size)) <= 1,
    r1.stats.map((s) => s.size).join('/'));
  ok('섞기(고정 ON) — 전력 편차 ≤ 4', r1.spread <= 4, `차 ${r1.spread} (${r1.stats.map((s) => s.total).join('/')})`);

  // (3) 고정 OFF (lock 없음) → 성별 무시, 흩어질 수 있음
  const r2 = balanceTeams(attendees, 3, { seed: 5 });
  ok('섞기(고정 OFF) — 정상 동작', r2.teams.flat().length === 24 && r2.spread <= 3, `차 ${r2.spread}`);

  // (4) 4팀 섞기 (v0.3.0 clamp 버그 수정 확인)
  ok('4팀 섞기 = 4묶음', balanceTeams(attendees, 4, { seed: 7 }).teams.length === 4);

  // (5) AI 적용 보정 로직 (여성 흩어진 결과 → 한 팀으로)
  const aiTeams = [
    { name: '1조', ids: [women[0].id, ...attendees.filter((m) => m.gender === '남').slice(0, 7).map((m) => m.id)] },
    { name: '2조', ids: [women[1].id, ...attendees.filter((m) => m.gender === '남').slice(7, 14).map((m) => m.id)] },
    { name: '3조', ids: [women[2].id, ...attendees.filter((m) => m.gender === '남').slice(14, 21).map((m) => m.id)] },
  ];
  const womenIds = women.map((m) => m.id);
  const target = aiTeams.reduce((best, t, idx) => {
    const c = t.ids.filter((id) => womenIds.includes(id)).length;
    return c > best.c ? { i: idx, c } : best;
  }, { i: 0, c: -1 }).i;
  const fixed = aiTeams.map((t, idx) => ({
    ...t,
    ids: idx === target ? [...new Set([...t.ids, ...womenIds])] : t.ids.filter((id) => !womenIds.includes(id)),
  }));
  const fdist = fixed.map((t) => t.ids.filter((id) => womenIds.includes(id)).length);
  ok('AI 적용 보정 — 여성 한 팀으로', fdist.filter((n) => n > 0).length === 1 && Math.max(...fdist) === 3, fdist.join('/'));
  ok('AI 적용 보정 — 인원 보존', fixed.reduce((a, t) => a + t.ids.length, 0) === 24);
}

console.log('\n[5] 마이그레이션 · JSON 왕복');
{
  const s2 = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await s2.init();
  await s2.importJSON(JSON.stringify({ members: [{ id: 'x', name: '옛회원', skill: 3 }], matches: [], tactics: [] }));
  ok('옛 데이터 성별 = 미입력', s2.members.all()[0].gender === null);
  ok('옛 데이터 혼성팀 = 없음 · 고정은 ON', s2.club.mixedTeams().length === 0 && s2.club.lockWomen() === true);

  const s3 = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await s3.init();
  await s3.importJSON(store.exportJSON());
  ok('JSON 왕복 — 성별 보존', s3.members.all().filter((m) => m.gender === '여').length === 3);
  ok('JSON 왕복 — 혼성팀/고정 설정 보존', s3.club.isMixed('D') && s3.club.lockWomen() === true);
  store.club.setLockWomen(false);
  const s4 = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await s4.init();
  await s4.importJSON(store.exportJSON());
  ok('JSON 왕복 — 고정 OFF 도 보존', s4.club.lockWomen() === false);
}

console.log('\n[6] 감독 (v0.5.1)');
{
  const s5 = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await s5.init();
  const a1 = s5.members.add({ name: 'A감독', team: 'A', skill: 3 });
  const a2 = s5.members.add({ name: 'A선수', team: 'A', skill: 2 });
  const b1 = s5.members.add({ name: 'B감독', team: 'B', skill: 4 });
  ok('기본 감독 없음', s5.club.coach('A') === null && Object.values(s5.club.coaches()).every((v) => v === null));

  s5.club.setCoach('A', a1.id);
  s5.club.setCoach('B', b1.id);
  ok('감독 지정', s5.club.coach('A') === a1.id && s5.club.coachTeamOf(b1.id) === 'B');
  ok('감독 아닌 회원', s5.club.coachTeamOf(a2.id) === null);
  ok('불일치 없음', s5.club.coachMismatches().length === 0);

  s5.members.update(a1.id, { team: 'C' });
  const mis = s5.club.coachMismatches();
  ok('감독이 다른 팀으로 이동 → 안내', mis.length === 1 && mis[0].key === 'A' && mis[0].reason === 'moved', JSON.stringify(mis.map((x) => x.key + ':' + x.reason)));
  s5.members.update(a1.id, { team: 'A' });
  ok('되돌리면 안내 사라짐', s5.club.coachMismatches().length === 0);

  s5.members.update(b1.id, { active: false });
  ok('비활동 감독도 안내', s5.club.coachMismatches().some((x) => x.reason === 'inactive'));
  s5.members.update(b1.id, { active: true });

  s5.club.setCoach('A', null);
  ok('감독 해제', s5.club.coach('A') === null);
  s5.club.setCoach('A', a1.id);

  // 평가 메타
  const before = s5.members.byId(a2.id);
  ok('평가 전 메타 없음', !before.skillUpdatedAt && !before.skillUpdatedBy);
  s5.members.setSkill(a2.id, 5, 'coach:A');
  const after = s5.members.byId(a2.id);
  ok('감독 평가 → skill + 메타', after.skill === 5 && after.skillUpdatedBy === 'coach:A' && !!after.skillUpdatedAt);
  s5.members.setAbil(a2.id, { speed: 4, defense: 2 }, 'coach:A');
  const after2 = s5.members.byId(a2.id);
  ok('간단 체크 평가 + 메타', after2.abil.speed === 4 && after2.abil.defense === 2 && after2.abilUpdatedBy === 'coach:A');
  ok('setAbil 은 나머지 항목 유지', after2.abil.shoot === null);

  // 감독 회원 삭제 → 자리 비움
  s5.members.remove(a1.id);
  ok('감독 회원 삭제 시 자리 비움', s5.club.coach('A') === null);

  // JSON 왕복
  s5.club.setCoach('B', b1.id);
  const s6 = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await s6.init();
  await s6.importJSON(s5.exportJSON());
  ok('JSON 왕복 — 감독 보존', s6.club.coach('B') === b1.id);
  ok('JSON 왕복 — 평가 메타 보존', s6.members.byId(a2.id)?.skillUpdatedBy === 'coach:A');

  // 마이그레이션
  const s7 = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await s7.init();
  await s7.importJSON(JSON.stringify({ members: [{ id: 'z', name: '옛회원', skill: 3 }], matches: [], tactics: [] }));
  ok('옛 데이터 — 감독 없음·메타 없음', s7.club.coach('A') === null && s7.members.all()[0].skillUpdatedAt === null);
}

console.log(`\n결과: ${pass} PASS / ${fail} FAIL\n`);
process.exit(fail ? 1 : 0);
