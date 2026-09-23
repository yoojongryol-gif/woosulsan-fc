/* v0.5.3 — 포지션 토큰 분리 테스트 (node dev/test-position.mjs) */
let pass = 0; let fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass += 1; console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail += 1; console.error(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
}
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { parseMemberLine, splitNamePosition, parsePositionToken, matchPositionAt, createStore } = await import('../store.js');
const TN = { A: '교역', B: '장년', C: '청년', D: '체육' };
const P = (line) => parseMemberLine(line, { teamNames: TN });
const sig = (r) => `${r.name}|${r.birthYear || ''}|${r.gender || ''}|${r.pos || ''}|${r.gk ? 'GK' : ''}|${r.team || ''}`;

console.log('\n[1] 사장님 실제 입력 형식');
ok('① 교 한가람 95 여 포워드', sig(P('교 한가람 95 여 포워드')) === '한가람|1995|여|FW||A', sig(P('교 한가람 95 여 포워드')));
ok('② 장 윤다솜 87 여 미들', sig(P('장 윤다솜 87 여 미들')) === '윤다솜|1987|여|MF||B');
ok('③ 청 서보라 96 여 레프트 윙', sig(P('청 서보라 96 여 레프트 윙')) === '서보라|1996|여|FW||C');
ok('④ 체 문하늘 95 여 라이트 백', sig(P('체 문하늘 95 여 라이트 백')) === '문하늘|1995|여|DF||D');
ok('⑤ 차은비 80 여 라이트 윙', sig(P('차은비 80 여 라이트 윙')) === '차은비|1980|여|FW||');
ok('⑥ 노하연 91 여 레프트 백', sig(P('노하연 91 여 레프트 백')) === '노하연|1991|여|DF||');
ok('⑦ 오태경 85 남 센터백', sig(P('오태경 85 남 센터백')) === '오태경|1985|남|DF||');
ok('⑧ 권민재 94 남 레프트백', sig(P('권민재 94 남 레프트백')) === '권민재|1994|남|DF||');

console.log('\n[2] 한/영·괄호·슬래시·복수·GK');
ok('⑨ 김단비 GK', sig(P('김단비 GK')) === '김단비|||GK|GK|', sig(P('김단비 GK')));
ok('⑩ 한별 95 남 골키퍼', sig(P('한별 95 남 골키퍼')) === '한별|1995|남|GK|GK|');
ok('⑪ 이영희(미드)', sig(P('이영희(미드)')) === '이영희|||MF||');
ok('⑫ 박민수/수비', sig(P('박민수/수비')) === '박민수|||DF||');
ok('⑬ 영문 FW', sig(P('Mike Park FW')) === 'Mike Park|||FW||', sig(P('Mike Park FW')));
ok('⑭ 복수 포지션은 첫 번째', (() => { const r = P('최영 수비 미드'); return r.pos === 'DF' && r.extraPos.join() === 'MF'; })());
ok('⑮ 윙백 = 수비', P('윤슬 윙백').pos === 'DF');
ok('⑯ 윙 백(띄어쓰기) = 수비', P('윤슬 윙 백').pos === 'DF');
ok('⑰ 윙 단독 = 공격', P('윤슬 윙').pos === 'FW');
ok('⑱ 순서 무관(포지션 먼저)', sig(P('공격 홍길동 90 남')) === '홍길동|1990|남|FW||');

console.log('\n[3] 오탐 방지');
ok('이름 속 글자는 분리 안 함(김수비)', sig(P('김수비')) === '김수비|||||');
ok('이름 속 글자(박미들)', P('박미들').pos === null);
ok('이름만', sig(P('홍길동')) === '홍길동|||||');
ok('팀 약자 아닌 한 글자는 이름으로', P('강 90').name === '강');
ok('팀 이름 전체도 인식', P('교역 홍길동 90').team === 'A');
ok('옵션 없어도 기본 약자(교장청체)는 인식', (() => { const r = parseMemberLine('교 한가람 95 여 포워드'); return r.name === '한가람' && r.team === 'A'; })());
ok('약자 아닌 한 글자 + 성이면 이름 유지', parseMemberLine('홍 길동 92', { teamNames: TN }).name === '홍 길동');
ok('약자 아닌 한 글자(성 아님)는 경고', (() => { const r = parseMemberLine('쳬 오타남 88', { teamNames: TN }); return r.name === '오타남' && r.unknownTeam === '쳬'; })());
ok('두 글자 이름은 절대 안 먹힘', parseMemberLine('한별 95 남 골키퍼', { teamNames: TN }).name === '한별');

console.log('\n[4] 이름에서 분리(기존 회원 정리)');
ok('김단비 GK', (() => { const r = splitNamePosition('김단비 GK'); return r.name === '김단비' && r.pos === 'GK' && r.gk === true && r.changed === true; })());
ok('체 한가람 → 팀+이름 분리', (() => { const r = splitNamePosition('체 한가람', { teamNames: TN }); return r.name === '한가람' && r.team === 'D'; })());
ok('이영희(미드)', splitNamePosition('이영희(미드)').name === '이영희');
ok('서보라 레프트 윙', (() => { const r = splitNamePosition('서보라 레프트 윙'); return r.name === '서보라' && r.pos === 'FW'; })());
ok('김수비는 그대로', splitNamePosition('김수비').changed === false);
ok('포지션만 있으면 변경 안 함', splitNamePosition('GK').changed === false);
ok('토큰 판정', parsePositionToken('포워드').pos === 'FW' && parsePositionToken('센터백').pos === 'DF' && parsePositionToken('하늘') === null);
ok('두 단어 매칭', matchPositionAt(['레프트', '윙'], 0).consumed === 2);

console.log('\n[5] 일괄 추가 반영 · JSON 왕복');
{
  const s = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await s.init();
  ['교역', '장년', '청년', '체육'].forEach((n, i) => s.club.setTeamName(['A', 'B', 'C', 'D'][i], n));
  const added = s.members.bulkAdd([
    '교 한가람 95 여 포워드', '장 윤다솜 87 여 미들', '청 서보라 96 여 레프트 윙', '체 문하늘 95 여 라이트 백',
    '오태경 85 남 센터백', '김단비 GK', '김수비',
  ]);
  ok('7명 추가', added.length === 7, added.map((m) => m.name).join(','));
  ok('이름에 포지션 안 남음', added.every((m) => !/GK|포워드|미들|백|윙/.test(m.name)), added.map((m) => m.name).join(','));
  ok('팀 약자 반영', s.members.byTeam('A')[0].name === '한가람' && s.members.byTeam('D')[0].name === '문하늘');
  ok('포지션·GK 반영', added.find((m) => m.name === '오태경').pos === 'DF' && added.find((m) => m.name === '김단비').gk === true);
  ok('성별·나이 반영', added.find((m) => m.name === '한가람').gender === '여' && added.find((m) => m.name === '한가람').birthYear === 1995);
  ok('김수비는 이름 유지·기본 MF', added.find((m) => m.name === '김수비')?.pos === 'MF');

  const s2 = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await s2.init();
  await s2.importJSON(s.exportJSON());
  ok('JSON 왕복', s2.members.all().length === 7 && s2.members.byTeam('A')[0].pos === 'FW');
}


console.log('\n[6] 이름 정리 후보 탐지 (v0.5.6 — 실증 케이스, 가명)');
{
  const { analyzeMemberName } = await import('../store.js');
  const O = { teamNames: TN, teamAliases: { A: '교', B: '장', C: '청', D: '체' } };

  // ① 앞 버전이 포지션만 떼어 pos 를 지정해 둔 회원 (team 비어 있음)
  const a1 = analyzeMemberName('체 홍길동', O);
  ok('약자+공백 — 이름/팀 분리', a1.name === '홍길동' && a1.team === 'D' && a1.changed === true, JSON.stringify(a1.reasons));
  // ② 팀도 이미 지정된 회원 (사장님 스크린샷 상태)
  const a2 = analyzeMemberName('교 김철수', O);
  ok('팀이 이미 있어도 후보', a2.name === '김철수' && a2.team === 'A' && a2.changed === true);
  // ③ 약자가 붙은 경우
  const a3 = analyzeMemberName('체이영희', O);
  ok('붙은 약자 추정', a3.name === '이영희' && a3.team === 'D' && a3.glued === true);
  // ④ 나이까지 함께 있던 회원
  const a4 = analyzeMemberName('체 박하나 95', O);
  ok('약자+이름+나이', a4.name === '박하나' && a4.team === 'D' && a4.birthYear === 1995);
  // ⑤ 깨끗한 이름은 후보 아님
  ok('깨끗한 이름은 제외', analyzeMemberName('정세명', O).changed === false);
  ok('성+이름 띄어쓰기는 제외', analyzeMemberName('홍 길동', O).changed === false);
  // ⑥ 이름 칸에 통째로 입력
  const a7 = analyzeMemberName('김하나 95 여 포워드', O);
  ok('이름 칸 통째 입력 분리', a7.name === '김하나' && a7.pos === 'FW' && a7.gender === '여' && a7.birthYear === 1995);
  ok('왜 잡혔는지 사유', a7.reasons.join('+').includes('포지션') && a7.reasons.join('+').includes('성별'), a7.reasons.join('+'));
  // ⑦ 구분기호만 있는 경우
  ok('구분기호 탐지', analyzeMemberName('박두리(미드)', O).reasons.includes('구분기호'));
}


console.log('\n[v0.6.1] 사장님 실사용 형식 전부 (라이브 실측 목록, 실명은 가명으로)');
{
  const O = { teamNames: TN, teamAliases: { A: '교', B: '장', C: '청', D: '체' } };
  const Q = (l) => parseMemberLine(l, O);
  const CASES = [
    ['체 한가람 95 여 포워드', '한가람', 'FW', 'D'], ['윤다솜 87 여 미들', '윤다솜', 'MF', null],
    ['서보라 96 여 레프트 윙', '서보라', 'FW', null], ['문하늘 95 여 라이트 백', '문하늘', 'DF', null],
    ['오태경 85 남 센터백', '오태경', 'DF', null], ['권민재 94 남 레프트백', '권민재', 'DF', null],
    ['배준호 83 윙백', '배준호', 'DF', null], ['신동우 73 라이트백', '신동우', 'DF', null],
    ['장 홍길동 85 골키퍼', '홍길동', 'GK', 'B'], ['청 김철수 GK', '김철수', 'GK', 'C'],
    ['청 이영희 수비', '이영희', 'DF', 'C'], ['청 박민수 공격', '박민수', 'FW', 'C'],
    ['청 최정 미드필더', '최정', 'MF', 'C'], ['청 강한 공격수', '강한', 'FW', 'C'],
    ['청 오세 수비수', '오세', 'DF', 'C'], ['청 유리 중앙 수비', '유리', 'DF', 'C'],
    ['청 한별 오른쪽 윙', '한별', 'FW', 'C'], ['청 나래 스트라이커', '나래', 'FW', 'C'],
    ['청 도윤 키퍼', '도윤', 'GK', 'C'], ['청 시우 95 남 DF', '시우', 'DF', 'C'], ['청 지호 fw', '지호', 'FW', 'C'],
    ['홍길동 85 골키퍼', '홍길동', 'GK', null], ['골키퍼 홍길동 85', '홍길동', 'GK', null],
    ['홍길동,85,골키퍼', '홍길동', 'GK', null], ['홍길동\t85\t골키퍼', '홍길동', 'GK', null],
    ['홍길동\u300085\u3000골키퍼', '홍길동', 'GK', null], ['홍길동 85 골키퍼   ', '홍길동', 'GK', null],
    ['홍길동(골키퍼)', '홍길동', 'GK', null],
  ];
  for (const [line, name, pos, team] of CASES) {
    const r = Q(line);
    ok(`${JSON.stringify(line)}`, r.name === name && r.pos === pos && (pos !== 'GK' || r.gk === true) && (r.team || null) === team,
      `${r.name}/${r.pos}/${r.gk ? 'GK' : ''}/${r.team || '-'}`);
  }
  // 추가 어휘
  const V = [['왼쪽 윙', 'FW'], ['우측 수비', 'DF'], ['좌측 미드', 'MF'], ['공격형 미드필더', 'MF'], ['수비형 미드', 'MF'],
    ['수미', 'MF'], ['공미', 'MF'], ['볼란치', 'MF'], ['스토퍼', 'DF'], ['센백', 'DF'], ['골리', 'GK'], ['수문장', 'GK'],
    ['타겟맨', 'FW'], ['CB', 'DF'], ['LW', 'FW'], ['CDM', 'MF'], ['Striker', 'FW']];
  for (const [w, pos] of V) {
    const r = Q(`홍길동 ${w}`);
    ok(`어휘 "${w}"`, r.name === '홍길동' && r.pos === pos, `${r.name}/${r.pos}`);
  }
  // 오탐 방지 유지
  ok('이름 속 글자는 그대로 (김수비·박윙)', Q('김수비').name === '김수비' && Q('박윙').name === '박윙');
  ok('오른쪽만 있고 포지션 없으면 수식어만 버림', Q('홍길동 오른쪽').name === '홍길동');
}
console.log(`\n결과: ${pass} PASS / ${fail} FAIL\n`);
process.exit(fail ? 1 : 0);
