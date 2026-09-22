/* AI 모듈 테스트 (node dev/test-ai.mjs) — 실제 API 호출 없이 fetch 목으로 검증 */
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

const AI = await import('../ai.js');
const { createStore } = await import('../store.js');

/* fetch 목 */
let lastRequest = null;
function mockFetch(handler) {
  globalThis.fetch = async (url, init) => {
    lastRequest = { url, init, headers: init.headers, body: JSON.parse(init.body) };
    return handler(lastRequest);
  };
}
const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const textBody = (text, usage = { input_tokens: 1200, output_tokens: 300 }) => ({
  id: 'msg_x', model: 'claude-sonnet-5', stop_reason: 'end_turn', usage,
  content: [{ type: 'text', text }],
});

console.log('\n[1] 설정 · 키 보관');
ok('키 없으면 hasKey false', AI.hasKey() === false);
AI.saveSettings({ key: 'sk-ant-test-1234567890abcdef' });
ok('키 저장 후 hasKey true', AI.hasKey() === true);
ok('마스킹 표시', AI.maskKey().startsWith('sk-ant-') && AI.maskKey().includes('…') && !AI.maskKey().includes('1234567890'), AI.maskKey());
ok('앱 데이터와 다른 localStorage 키 사용', mem.has('woosulsan-fc:ai') && !mem.has('woosulsan-fc:v1'), [...mem.keys()].join(','));

const store = createStore();
await store.init();
store.members.bulkAdd(['김민준', '이서준', '박도윤'], { team: 'A' });
const g = store.matches.add({ date: '2026-09-24', place: '시민운동장' });
store.members.active().forEach((m) => store.matches.setAttendance(g.id, m.id, 'in'));
const exported = store.exportJSON();
ok('JSON 내보내기에 API 키 없음', !exported.includes('sk-ant'), `${exported.length}자`);
ok('JSON 내보내기에 ai 설정 없음', !exported.includes('woosulsan-fc:ai') && !JSON.parse(exported).data.ai);

console.log('\n[2] 호출 · 헤더');
mockFetch(() => jsonResponse(200, textBody('안녕하세요')));
{
  const r = await AI.callClaude({ messages: [{ role: 'user', content: 'hi' }] });
  ok('정상 호출 → 텍스트', r.text === '안녕하세요');
  ok('엔드포인트', lastRequest.url === 'https://api.anthropic.com/v1/messages', lastRequest.url);
  ok('anthropic-version 헤더', lastRequest.headers['anthropic-version'] === '2023-06-01');
  ok('브라우저 직접 호출 헤더', lastRequest.headers['anthropic-dangerous-direct-browser-access'] === 'true');
  ok('x-api-key 헤더 = 저장된 키', lastRequest.headers['x-api-key'] === 'sk-ant-test-1234567890abcdef');
  ok('기본 모델 = Sonnet 5', lastRequest.body.model === 'claude-sonnet-5', lastRequest.body.model);
  ok('Sonnet 5 는 effort 사용', lastRequest.body.output_config?.effort === 'low');
  ok('budget_tokens 미사용(400 방지)', !JSON.stringify(lastRequest.body).includes('budget_tokens'));
  ok('비용 추정', Math.abs(r.costUsd - (1200 / 1e6 * 2 + 300 / 1e6 * 10)) < 1e-9, r.costUsd.toFixed(6) + ' USD');
  ok('원화 표기', /원/.test(AI.formatCost(r.costUsd)), AI.formatCost(r.costUsd));
}
{
  AI.saveSettings({ model: 'claude-haiku-4-5' });
  await AI.callClaude({ messages: [{ role: 'user', content: 'hi' }] });
  ok('Haiku 4.5 는 effort 미전송(미지원)', lastRequest.body.output_config === undefined);
  AI.saveSettings({ model: 'claude-sonnet-5' });
}

console.log('\n[3] 오류 경로');
const cases = [
  [401, 'auth', '키'],
  [403, 'forbidden', '브라우저'],
  [429, 'rate_limit', '한도'],
  [500, 'server', '서버'],
];
for (const [status, kind, word] of cases) {
  mockFetch(() => jsonResponse(status, { error: { message: 'x' } }));
  try {
    await AI.callClaude({ messages: [{ role: 'user', content: 'hi' }] });
    ok(`${status} → 오류 발생`, false);
  } catch (e) {
    ok(`${status} → ${kind} 안내`, e.kind === kind && e.message.includes(word), e.message.slice(0, 40));
  }
}
globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
try { await AI.callClaude({ messages: [{ role: 'user', content: 'x' }] }); ok('네트워크 오류', false); }
catch (e) { ok('네트워크 오류 안내', e.kind === 'network' && e.message.includes('인터넷'), e.message.slice(0, 30)); }

AI.clearKey();
try { await AI.callClaude({ messages: [{ role: 'user', content: 'x' }] }); ok('키 없음 → 오류', false); }
catch (e) { ok('키 없음 = no_key (에러 아님 안내용)', e.kind === 'no_key'); }
AI.saveSettings({ key: 'sk-ant-test-1234567890abcdef' });

console.log('\n[4] JSON 파싱');
ok('순수 JSON', AI.extractJSON('{"a":1}').a === 1);
ok('설명 + 코드펜스', AI.extractJSON('추천드립니다:\n```json\n{"teams":[{"name":"A"}]}\n```\n감사합니다').teams[0].name === 'A');
ok('앞뒤 문장 섞임', AI.extractJSON('결과는 {"x":[1,2,3]} 입니다').x.length === 3);
ok('중첩 괄호·문자열 내 괄호', AI.extractJSON('{"t":"a{b}c","n":{"m":[{"k":1}]}}').n.m[0].k === 1);
try { AI.extractJSON('죄송하지만 답할 수 없습니다'); ok('JSON 없음 → 오류', false); }
catch (e) { ok('JSON 없음 → 안내 오류', e.kind === 'parse'); }
try { AI.extractJSON('{"a":1'); ok('잘린 JSON → 오류', false); }
catch (e) { ok('잘린 JSON → 안내 오류', e.kind === 'parse'); }
try { AI.extractJSON('{"a":오류}'); ok('깨진 JSON → 오류', false); }
catch (e) { ok('깨진 JSON → 안내 오류', e.kind === 'parse'); }

console.log('\n[5] 연결 테스트 · 프롬프트');
mockFetch(() => jsonResponse(200, textBody('ping')));
{
  const r = await AI.testConnection();
  ok('연결 테스트 성공', r.ok === true && r.message.includes('연결 성공'), r.message);
  ok('테스트 호출은 짧게(max_tokens 16)', lastRequest.body.max_tokens === 16);
}
mockFetch(() => jsonResponse(401, { error: { message: 'invalid x-api-key' } }));
{
  const r = await AI.testConnection();
  ok('연결 테스트 실패 → 상태코드 포함', r.ok === false && r.status === 401 && r.kind === 'auth', r.message.slice(0, 30));
}

{
  const ctx = AI.buildClubContext(store, { matchId: g.id });
  ok('컨텍스트에 회원·경기 요약', ctx.회원.length === 3 && ctx.경기.참석자수 === 3);
  ok('컨텍스트에 키 없음', !JSON.stringify(ctx).includes('sk-ant'));
  const p = AI.teamCoachPrompt({ store, matchId: g.id, candidates: [], groupCount: 2 });
  ok('팀 코치 프롬프트: 허구 금지 지시', p.system.includes('지어내지 마세요'));
  ok('팀 코치 프롬프트: JSON 스키마 명시', p.system.includes('"teams"') && p.system.includes('"cautions"'));
  const t = AI.tacticsPrompt({ players: [{ name: 'a', skill: 3, pos: 'MF', gk: false }], teamLabel: 'A팀', formations: ['2-2-1'], note: '' });
  ok('전술 프롬프트: 0~1 좌표 지시', t.system.includes('0~1'));
  const n = AI.noticePrompt({ store, matchId: g.id, mode: 'notice', tone: '유쾌하게' });
  ok('공지문 프롬프트: 톤 반영', n.system.includes('유쾌'));
  const rv = AI.noticePrompt({ store, matchId: g.id, mode: 'review', tone: '짧게' });
  ok('총평 프롬프트: 점수 허구 금지', rv.system.includes('지어내지'));
  const a = AI.askPrompt({ store, question: '출석률 낮은 사람?', history: Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x' + i })) });
  ok('자유질문: 최근 6턴만 전달', a.messages.length === 7, a.messages.length + '개(질문 포함)');
}

console.log('\n[6] 마크다운 최소 렌더');
{
  const html = AI.renderMini('**굵게** 시작\n- 항목1\n- 항목2\n\n끝', (x) => String(x));
  ok('굵게 → <b>', html.includes('<b>굵게</b>'));
  ok('목록 → <ul><li>', html.includes('<ul><li>항목1</li>'));
  const esc = (x) => String(x).replace(/</g, '&lt;');
  ok('HTML 이스케이프 적용', AI.renderMini('<script>x</script>', esc).includes('&lt;script'));
}

console.log(`\n결과: ${pass} PASS / ${fail} FAIL\n`);
process.exit(fail ? 1 : 0);
