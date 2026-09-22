/* v1.0 클라우드 e2e — 목 백엔드로 3역할 전체 흐름 (node dev/test-cloud.mjs)
 * 운영자 구글 로그인 → 클럽 생성 → 로컬 데이터 이관 → 책임자 초대/수락 → 책임자 평가
 * → 회원 익명 로그인 + 본인 연결 요청 → 승인 → 권한 밖 수정 거부 → 실시간 반영
 */
let pass = 0; let fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass += 1; console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail += 1; console.error(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
}
async function denied(name, fn, expect = '') {
  try { await fn(); ok(name, false, '거부되지 않음'); }
  catch (e) { ok(name, true, e.message.slice(0, 40)); if (expect && !e.message.includes(expect)) console.warn('     (메시지 확인: ' + e.message + ')'); }
}

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.location = { origin: 'https://woosulsan-fc.firebaseapp.com', pathname: '/' };

const { createMockProvider } = await import('./mock-provider.js');
const { createCloud, roleOf, canEditMember, canSetAttendance, isExpired, newToken } = await import('./cloud.js');
const { createStore } = await import('../../store.js');

const provider = createMockProvider();

console.log('\n[1] 운영자: 로그인 → 클럽 생성 → 로컬 데이터 이관');
const owner = await provider.auth.signInGoogle({ uid: 'uid_owner', displayName: '사장님' });
const cloud = createCloud(provider);
await cloud.init();
ok('로그인 상태 반영', cloud.state().user?.uid === 'uid_owner');
ok('아직 클럽 없음', !cloud.isActive());

// 기존 로컬(혼자 쓰던) 데이터 준비
const local = createStore({ load: async () => null, save: async () => true, clear: async () => {} });
await local.init();
local.club.setTeamName('B', '번개');
local.club.setMixed('D', true);
const lm = {};
for (const [name, team, gender] of [['가람', 'A', '남'], ['나은', 'A', '남'], ['다올', 'B', '남'], ['라온', 'B', '남'], ['아름', 'D', '여']]) {
  lm[name] = local.members.add({ name, team, gender, skill: 3, pos: 'MF' });
}
const lg = local.matches.add({ date: '2026-09-24', place: '시민운동장', teamCount: 2 });
local.matches.setAttendance(lg.id, lm['가람'].id, 'in');
local.matches.setAttendance(lg.id, lm['다올'].id, 'in');

const clubId = await cloud.createClub({ name: '웃을산 FC', localData: local.get() });
ok('클럽 생성 + ownerUid', !!clubId && cloud.state().club?.ownerUid === 'uid_owner');
ok('내 역할 = 운영자', cloud.role().role === 'owner');
await new Promise((r) => setTimeout(r, 10));
ok('이관 — 회원 5명', cloud.state().members.length === 5, cloud.state().members.map((m) => m.name).join(','));
ok('이관 — 팀 이름·혼성팀', cloud.state().club.teams.B.name === '번개' && cloud.state().club.teams.D.mixed === true);
ok('이관 — 경기 1건', cloud.state().matches.length === 1);
cloud.subscribeAttendance(cloud.state().matches[0].id);
await new Promise((r) => setTimeout(r, 10));
ok('이관 — 출석 2명', Object.values(cloud.state().attendance[cloud.state().matches[0].id] || {}).filter((v) => v === 'in').length === 2);

console.log('\n[2] 초대 링크 (운영자만 발급, 토큰 목록 조회 불가)');
const inviteB = await cloud.createInvite({ role: 'coach', team: 'B' });
const inviteM = await cloud.createInvite({ role: 'member' });
ok('책임자 초대 생성', inviteB.token.length === 22 && inviteB.url.includes('#invite='), inviteB.url.slice(-30));
ok('회원 초대 생성', inviteM.token.length === 22);
ok('초대 토큰 컬렉션 list 미제공(수확 차단)', typeof provider.db.listCollection === 'undefined' && !provider.db.queryInvites);
const invRead = await cloud.readInvite(inviteB.token);
ok('토큰을 아는 사람만 읽기(get)', invRead.role === 'coach' && invRead.team === 'B' && invRead.clubName === '웃을산 FC');
await denied('없는 토큰 → 오류', () => cloud.readInvite('nope'), '올바르지');
ok('만료 판정', isExpired({ expiresAt: Date.now() - 1000 }) && !isExpired({ expiresAt: Date.now() + 1000 }));

console.log('\n[3] 책임자(B팀): 구글 로그인 → 초대 수락 → 자기 팀만 평가');
const coach = await provider.auth.signInGoogle({ uid: 'uid_coachB', displayName: 'B팀 책임자' });
const cloudCoach = createCloud(provider, { cacheKey: 'coach-cache' });
await cloudCoach.init();
await cloudCoach.acceptCoachInvite(inviteB.token);
await new Promise((r) => setTimeout(r, 10));
ok('초대 수락 → coachUid 연결', cloudCoach.state().club.teams.B.coachUid === 'uid_coachB');
ok('책임자 역할 판정', cloudCoach.role().role === 'coach' && cloudCoach.role().team === 'B');
ok('1회용 토큰 소멸', await provider.db.getDoc(['inviteIndex', inviteB.token]) === null);

const daol = cloudCoach.state().members.find((m) => m.name === '다올');   // B팀
const garam = cloudCoach.state().members.find((m) => m.name === '가람');  // A팀
await cloudCoach.updateMember(daol.id, { skill: 5, skillUpdatedAt: new Date().toISOString(), skillUpdatedBy: 'coach:B' });
await new Promise((r) => setTimeout(r, 10));
ok('자기 팀 선수 평가 성공', cloudCoach.state().members.find((m) => m.id === daol.id).skill === 5);
await denied('남의 팀 선수 평가 거부', () => cloudCoach.updateMember(garam.id, { skill: 1 }), '권한');
await denied('권한 밖 필드(이름) 수정 거부', () => cloudCoach.updateMember(daol.id, { name: '바꿔치기' }), '권한');
await denied('회원 추가 거부', () => cloudCoach.addMember({ name: '몰래추가' }), '운영자만');
await denied('초대 링크 발급 거부', () => cloudCoach.createInvite({ role: 'member' }), '운영자만');
const gid = cloudCoach.state().matches[0].id;
await cloudCoach.setAttendance(gid, daol.id, 'in');
ok('자기 팀 출석 대리 체크', true);
await denied('남의 팀 출석 대리 거부', () => cloudCoach.setAttendance(gid, garam.id, 'out'), '권한');

console.log('\n[4] 회원: 익명 로그인 → 본인 연결 요청 → 승인');
const anon = await provider.auth.signInAnonymous();
const cloudMember = createCloud(provider, { cacheKey: 'member-cache' });
await cloudMember.init();
const inv2 = await cloudMember.readInvite(inviteM.token);
ok('회원 초대 열람', inv2.role === 'member');
const naeun = (await provider.db.getDoc(['clubs', clubId, 'members', cloudCoach.state().members.find((m) => m.name === '나은').id]));
const naeunId = cloudCoach.state().members.find((m) => m.name === '나은').id;
await cloudMember.requestMemberLink(inviteM.token, naeunId);
await new Promise((r) => setTimeout(r, 10));
ok('연결 요청 → pendingUid', cloudMember.state().members.find((m) => m.id === naeunId).pendingUid === anon.uid);
ok('승인 전 역할 = pending', cloudMember.role().role === 'pending');
await denied('승인 전 본인 정보 수정도 거부', () => cloudMember.updateMember(naeunId, { birthYear: 1990 }), '권한');

// 다른 사람이 같은 이름을 가로채려는 시도
const anon2 = await provider.auth.signInAnonymous();
const cloudEvil = createCloud(provider, { cacheKey: 'evil-cache' });
await cloudEvil.init();
await cloudEvil.requestMemberLink(inviteM.token, naeunId);   // 아직 승인 전이라 요청 자체는 가능
await new Promise((r) => setTimeout(r, 10));
ok('승인 전에는 마지막 요청자로 덮어씀', cloud.state().members.find((m) => m.id === naeunId).pendingUid === anon2.uid);

// 운영자가 승인 (A팀 소속이라 B팀 책임자는 승인 불가)
await provider.auth._setUser(owner);
await denied('B팀 책임자는 A팀 회원 승인 불가', async () => {
  await provider.auth._setUser(coach);
  await cloudCoach.approveMember(naeunId, true);
}, '권한');
await provider.auth._setUser(owner);
await cloud.approveMember(naeunId, true);
await new Promise((r) => setTimeout(r, 10));
const linked = cloud.state().members.find((m) => m.id === naeunId);
ok('운영자 승인 → memberUid 연결', linked.memberUid === anon2.uid && !linked.pendingUid);

// 이미 연결된 이름을 제3자가 가로채려는 시도 → 거부
const anon3 = await provider.auth.signInAnonymous();
const cloudEvil2 = createCloud(provider, { cacheKey: 'evil2-cache' });
await cloudEvil2.init();
await denied('승인 완료된 이름 가로채기 거부', () => cloudEvil2.requestMemberLink(inviteM.token, naeunId), '이미');

// 승인된 회원 본인 권한
await provider.auth._setUser({ uid: anon2.uid, isAnonymous: true, displayName: null });
await new Promise((r) => setTimeout(r, 10));
ok('회원 역할 판정', cloudEvil.role().role === 'member');
await cloudEvil.updateMember(naeunId, { birthYear: 1991, gender: '남' });
await new Promise((r) => setTimeout(r, 10));
ok('본인 프로필 수정 성공', cloud.state().members.find((m) => m.id === naeunId).birthYear === 1991);
await denied('본인이라도 실력은 못 고침', () => cloudEvil.updateMember(naeunId, { skill: 5 }), '권한');
await denied('남의 프로필 수정 거부', () => cloudEvil.updateMember(daol.id, { birthYear: 2000 }), '권한');
await cloudEvil.setAttendance(gid, naeunId, 'in');
ok('본인 출석 체크 성공', true);
await denied('남의 출석 체크 거부', () => cloudEvil.setAttendance(gid, daol.id, 'out'), '권한');

console.log('\n[5] 실시간 반영 · 캐시');
await provider.auth._setUser(owner);
let notified = 0;
const un = cloud.subscribe(() => { notified += 1; });
await cloud.updateMember(garam.id, { skill: 4 });
await new Promise((r) => setTimeout(r, 10));
ok('운영자 화면에 실시간 반영', notified > 0 && cloud.state().members.find((m) => m.id === garam.id).skill === 4, `알림 ${notified}회`);
const coachSees = cloudCoach.state().members.find((m) => m.id === garam.id)?.skill;
ok('책임자 화면에도 같은 값(같은 구독)', coachSees === 4, String(coachSees));
un();
ok('첫 화면용 캐시 저장', !!mem.get('woosulsan-fc:cloud-cache') && JSON.parse(mem.get('woosulsan-fc:cloud-cache')).members.length === 5);

console.log('\n[6] 권한 헬퍼 (UI 가드 = rules 와 같은 판단)');
{
  const club = cloud.state().club;
  const members = cloud.state().members;
  const m = members.find((x) => x.name === '다올');
  ok('roleOf — 운영자', roleOf(club, 'uid_owner', members).role === 'owner');
  ok('roleOf — 책임자 B', roleOf(club, 'uid_coachB', members).team === 'B');
  ok('canEditMember — 책임자·자기팀·skill', canEditMember(club, 'uid_coachB', m, ['skill'], members) === true);
  ok('canEditMember — 책임자·자기팀·이름 금지', canEditMember(club, 'uid_coachB', m, ['name'], members) === false);
  ok('canEditMember — 책임자·남의팀 금지', canEditMember(club, 'uid_coachB', members.find((x) => x.name === '가람'), ['skill'], members) === false);
  ok('canSetAttendance — 회원 본인', canSetAttendance(club, anon2.uid, members.find((x) => x.id === naeunId), members) === true);
  ok('canSetAttendance — 남 금지', canSetAttendance(club, anon2.uid, m, members) === false);
  ok('토큰 형식', /^[a-z2-9]{22}$/.test(newToken()));
}

console.log(`\n결과: ${pass} PASS / ${fail} FAIL\n`);
process.exit(fail ? 1 : 0);
