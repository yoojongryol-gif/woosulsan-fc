/* v0.6.2 — 날짜는 기기(한국) 시간 기준인지: 시계 목 테스트 (node dev/test-date.mjs)
 * 예전 코드는 toISOString().slice(0,10) 으로 UTC 날짜를 써서
 * 한국 00:00~09:00 에는 "오늘"이 전날(1/1 새벽엔 전년도 12/31)로 잡혔다.
 */
process.env.TZ = 'Asia/Seoul';

let pass = 0; let fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass += 1; console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail += 1; console.error(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
}
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

/* 시계 목: new Date() / Date.now() 가 지정한 순간을 돌려준다 */
const RealDate = Date;
function setNow(isoWithOffset) {
  const t = new RealDate(isoWithOffset).getTime();
  globalThis.Date = class extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(t); }
    static now() { return t; }
  };
}
function restore() { globalThis.Date = RealDate; }

const S = await import('../store.js');
const utcSlice = () => new Date().toISOString().slice(0, 10);   // 예전 방식 (비교용)

console.log('\n[1] 시간대 확인');
ok('테스트 시간대 = 한국(UTC+9)', new RealDate('2026-01-01T00:30:00+09:00').getTimezoneOffset() === -540);

console.log('\n[2] 오늘 날짜 (한국 시간)');
const SCENES = [
  ['KST 01:00', '2026-09-23T01:00:00+09:00', '2026-09-23'],
  ['KST 23:30', '2026-09-23T23:30:00+09:00', '2026-09-23'],
  ['12/31 23:30', '2026-12-31T23:30:00+09:00', '2026-12-31'],
  ['1/1 00:30', '2027-01-01T00:30:00+09:00', '2027-01-01'],
];
for (const [label, iso, want] of SCENES) {
  setNow(iso);
  const got = S.localDateStr();
  const old = utcSlice();
  ok(`${label} → 오늘 ${want}`, got === want, `새 ${got} / 예전 UTC ${old}`);
  restore();
}
setNow('2027-01-01T00:30:00+09:00');
ok('재현: 예전 방식은 1/1 00:30 에 전년도 12/31', utcSlice() === '2026-12-31');
restore();

console.log('\n[3] 다가오는 경기 판정');
{
  // 오늘 경기가 한국 새벽에 "지난 경기" 로 빠지면 안 된다
  setNow('2026-09-23T01:00:00+09:00');
  const st = S.createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await st.init();
  st.matches.add({ date: '2026-09-22', time: '20:00' });
  st.matches.add({ date: '2026-09-23', time: '20:00' });
  st.matches.add({ date: '2026-09-24', time: '20:00' });
  const up = st.matches.upcoming().map((g) => g.date);
  ok('KST 01:00 — 오늘 경기 포함, 어제 경기 제외', up.join(',') === '2026-09-23,2026-09-24', up.join(','));
  restore();

  setNow('2027-01-01T00:30:00+09:00');
  const st2 = S.createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await st2.init();
  st2.matches.add({ date: '2026-12-31', time: '20:00' });
  st2.matches.add({ date: '2027-01-01', time: '10:00' });
  const up2 = st2.matches.upcoming().map((g) => g.date);
  ok('1/1 00:30 — 새해 첫 경기는 다가오는 경기, 12/31 은 지난 경기', up2.join(',') === '2027-01-01', up2.join(','));
  const noDate = st2.matches.add({ time: '19:00' });
  ok('날짜 없이 만든 경기 = 로컬 오늘', noDate.date === '2027-01-01', noDate.date);
  restore();

  setNow('2026-12-31T23:30:00+09:00');
  const st3 = S.createStore({ load: async () => null, save: async () => true, clear: async () => {} });
  await st3.init();
  st3.matches.add({ date: '2026-12-31', time: '23:00' });
  ok('12/31 23:30 — 오늘(12/31) 경기는 아직 다가오는 경기', st3.matches.upcoming().length === 1);
  restore();
}

console.log('\n[4] 나이는 해가 바뀌면 자동으로 +1');
{
  setNow('2026-12-31T23:30:00+09:00');
  const a1 = S.ageOf(1995);
  restore();
  setNow('2027-01-01T00:30:00+09:00');
  const a2 = S.ageOf(1995);
  restore();
  ok('95년생: 12/31 23:30 = 31세 → 1/1 00:30 = 32세', a1 === 31 && a2 === 32, `${a1} → ${a2}`);
  setNow('2027-01-01T00:30:00+09:00');
  ok('저장된 값 없이 매번 계산 (출생년도만 저장)', S.ageOf(1990) === 37);
  restore();
}

console.log('\n[5] 문자열·Date 입력');
ok('Date 를 넘기면 그 날짜', S.localDateStr(new RealDate(2026, 0, 5, 3, 0)) === '2026-01-05');
ok('한 자리 월·일은 0 채움', S.localDateStr(new RealDate(2026, 8, 3)) === '2026-09-03');

console.log(`\n결과: ${pass} PASS / ${fail} FAIL\n`);
process.exit(fail ? 1 : 0);
