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
ok('① 교 진혜린 95 여 포워드', sig(P('교 진혜린 95 여 포워드')) === '진혜린|1995|여|FW||A', sig(P('교 진혜린 95 여 포워드')));
ok('② 장 정승아 87 여 미들', sig(P('장 정승아 87 여 미들')) === '정승아|1987|여|MF||B');
ok('③ 청 정지원 96 여 레프트 윙', sig(P('청 정지원 96 여 레프트 윙')) === '정지원|1996|여|FW||C');
ok('④ 체 구재은 95 여 라이트 백', sig(P('체 구재은 95 여 라이트 백')) === '구재은|1995|여|DF||D');
ok('⑤ 정윤희 80 여 라이트 윙', sig(P('정윤희 80 여 라이트 윙')) === '정윤희|1980|여|FW||');
ok('⑥ 이조은 91 여 레프트 백', sig(P('이조은 91 여 레프트 백')) === '이조은|1991|여|DF||');
ok('⑦ 정성현 85 남 센터백', sig(P('정성현 85 남 센터백')) === '정성현|1985|남|DF||');
ok('⑧ 임채현 94 남 레프트백', sig(P('임채현 94 남 레프트백')) === '임채현|1994|남|DF||');

console.log('\n[2] 한/영·괄호·슬래시·복수·GK');
ok('⑨ 김알곡 GK', sig(P('김알곡 GK')) === '김알곡|||GK|GK|', sig(P('김알곡 GK')));
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
ok('옵션 없어도 기본 약자(교장청체)는 인식', (() => { const r = parseMemberLine('교 진혜린 95 여 포워드'); return r.name === '진혜린' && r.team === 'A'; })());
ok('약자 아닌 한 글자 + 성이면 이름 유지', parseMemberLine('홍 길동 92', { teamNames: TN }).name === '홍 길동');
ok('약자 아닌 한 글자(성 아님)는 경고', (() => { const r = parseMemberLine('쳬 오타남 88', { teamNames: TN }); return r.name === '오타남' && r.unknownTeam === '쳬'; })());
ok('두 글자 이름은 절대 안 먹힘', parseMemberLine('한별 95 남 골키퍼', { teamNames: TN }).name === '한별');

console.log('\n[4] 이름에서 분리(기존 회원 정리)');
ok('김알곡 GK', (() => { const r = splitNamePosition('김알곡 GK'); return r.name === '김알곡' && r.pos === 'GK' && r.gk === true && r.changed === true; })());
ok('체 진혜린 → 팀+이름 분리', (() => { const r = splitNamePosition('체 진혜린', { teamNames: TN }); return r.name === '진혜린' && r.team === 'D'; })());
ok('이영희(미드)', splitNamePosition('이영희(미드)').name === '이영희');
ok('정지원 레프트 윙', (() => { const r = splitNamePosition('정지원 레프트 윙'); return r.name === '정지원' && r.pos === 'FW'; })());
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
    '교 진혜린 95 여 포워드', '장 정승아 87 여 미들', '청 정지원 96 여 레프트 윙', '체 구재은 95 여 라이트 백',
    '정성현 85 남 센터백', '김알곡 GK', '김수비',
  ]);
  ok('7명 추가', added.length === 7, added.map((m) => m.name).join(','));
  ok('이름에 포지션 안 남음', added.every((m) => !/GK|포워드|미들|백|윙/.test(m.name)), added.map((m) => m.name).join(','));
  ok('팀 약자 반영', s.members.byTeam('A')[0].name === '진혜린' && s.members.byTeam('D')[0].name === '구재은');
  ok('포지션·GK 반영', added.find((m) => m.name === '정성현').pos === 'DF' && added.find((m) => m.name === '김알곡').gk === true);
  ok('성별·나이 반영', added.find((m) => m.name === '진혜린').gender === '여' && added.find((m) => m.name === '진혜린').birthYear === 1995);
  ok('김수비는 이름 유지·기본 MF', added.find((m) => m.name === '김수비')?.pos === 'MF');

  const s2 = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await s2.init();
  await s2.importJSON(s.exportJSON());
  ok('JSON 왕복', s2.members.all().length === 7 && s2.members.byTeam('A')[0].pos === 'FW');
}

console.log(`\n결과: ${pass} PASS / ${fail} FAIL\n`);
process.exit(fail ? 1 : 0);
