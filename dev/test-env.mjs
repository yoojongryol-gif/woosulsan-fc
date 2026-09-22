/* v0.5.3 테스트 — 실행 환경 감지 · 배너 · 백업 시각 · 입력 초안 (node dev/test-env.mjs) */
let pass = 0; let fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass += 1; console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail += 1; console.error(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
}

/* localStorage 스텁 (key(i) 까지 지원 — hasAnyDraft 가 쓴다) */
function makeStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}
globalThis.localStorage = makeStorage();

const { detectEnv, bannerFor, androidChromeIntent, readMeta, writeMeta, needsBackup, sinceLabel } = await import('../env.js');
const { saveDraft, readDraft, clearDraft, hasAnyDraft, debounce, draftAgeLabel, DRAFT_TTL_MS } = await import('../drafts.js');

const UA = {
  kakaoIOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.4.5',
  kakaoAOS: 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36 KAKAOTALK',
  safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeAOS: 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 320.0.0',
  naver: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 NAVER(inapp; search; 1200)',
  webview: 'Mozilla/5.0 (Linux; Android 14; SM-S921N; wv) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
};

console.log('\n[1] 실행 환경 감지');
ok('카톡(iOS)', (() => { const e = detectEnv(UA.kakaoIOS); return e.mode === 'inapp' && e.app === 'kakao' && e.os === 'ios'; })());
ok('카톡(안드로이드)', (() => { const e = detectEnv(UA.kakaoAOS); return e.mode === 'inapp' && e.os === 'android'; })());
ok('인스타', detectEnv(UA.instagram).app === 'instagram');
ok('네이버 앱', detectEnv(UA.naver).app === 'naver');
ok('안드로이드 웹뷰', detectEnv(UA.webview).mode === 'inapp');
ok('사파리 탭', (() => { const e = detectEnv(UA.safari); return e.mode === 'browser' && e.os === 'ios'; })());
ok('크롬 탭', detectEnv(UA.chromeAOS).mode === 'browser');
ok('데스크톱', (() => { const e = detectEnv(UA.desktop); return e.mode === 'browser' && e.os === 'other'; })());
ok('홈 화면 앱(iOS standalone)', detectEnv(UA.safari, { standalone: true }).mode === 'standalone');
ok('홈 화면 앱(display-mode)', detectEnv(UA.chromeAOS, { displayMode: 'standalone' }).mode === 'standalone');
ok('카톡보다 standalone 우선', detectEnv(UA.kakaoIOS, { standalone: true }).mode === 'standalone');
ok('사람이 읽는 라벨', detectEnv(UA.kakaoIOS).label === '카카오톡 안의 브라우저', detectEnv(UA.kakaoIOS).label);

console.log('\n[2] 배너 규칙');
{
  const kakao = detectEnv(UA.kakaoIOS);
  const tab = detectEnv(UA.safari);
  const app = detectEnv(UA.safari, { standalone: true });
  ok('카톡 = 회원 0명이어도 경고', bannerFor(kakao, 0)?.type === 'inapp');
  ok('카톡 안내 문구', /사파리·크롬에서 열면 보이지 않습니다/.test(bannerFor(kakao, 0).body));
  ok('iOS 카톡 = 여는 방법 안내', bannerFor(kakao, 0).action === 'ios-open');
  ok('안드로이드 카톡 = 크롬 열기', bannerFor(detectEnv(UA.kakaoAOS), 0).action === 'android-open');
  ok('브라우저 탭 + 회원 있음 = 안내', bannerFor(tab, 3)?.type === 'tab');
  ok('브라우저 탭 + 회원 0명 = 안내 없음', bannerFor(tab, 0) === null);
  ok('홈 화면 앱 = 안내 없음', bannerFor(app, 30) === null);
  const now = Date.now();
  ok('하루 숨김 동작', bannerFor(kakao, 0, now, now + 60000) === null);
  ok('숨김 기간 지나면 다시', bannerFor(kakao, 0, now, now - 60000)?.type === 'inapp');
  ok('크롬 intent 링크', androidChromeIntent('https://x.io/a/') === 'intent://x.io/a/#Intent;scheme=https;package=com.android.chrome;end',
    androidChromeIntent('https://x.io/a/'));
}

console.log('\n[3] 백업 시각 · 메타');
{
  globalThis.localStorage = makeStorage();
  ok('초기 메타', readMeta().lastBackupAt === null && readMeta().bannerHiddenUntil === 0);
  writeMeta({ lastBackupAt: new Date().toISOString() });
  ok('백업 시각 기록', !!readMeta().lastBackupAt);
  writeMeta({ bannerHiddenUntil: 123 });
  ok('부분 갱신(둘 다 보존)', !!readMeta().lastBackupAt && readMeta().bannerHiddenUntil === 123);
  const now = Date.now();
  ok('회원 0명 = 백업 안내 없음', needsBackup(0, null, now) === false);
  ok('백업 이력 없음 = 안내', needsBackup(5, null, now) === true);
  ok('7일 안 = 안내 없음', needsBackup(5, new Date(now - 3 * 86400000).toISOString(), now) === false);
  ok('7일 지남 = 안내', needsBackup(5, new Date(now - 8 * 86400000).toISOString(), now) === true);
  ok('경과 표기', sinceLabel(new Date(now - 2 * 86400000).toISOString(), now) === '2일 전'
    && sinceLabel(null) === '아직 없음' && sinceLabel(new Date(now - 30000).toISOString(), now) === '방금');
}

console.log('\n[4] 입력 초안');
{
  const st = makeStorage();
  globalThis.localStorage = st;
  ok('초안 없음', readDraft('bulk') === null && hasAnyDraft() === false);
  saveDraft('bulk', '김민준\n이서준');
  ok('초안 저장/복원', readDraft('bulk').value === '김민준\n이서준');
  ok('초안 있음 감지(업데이트 가드용)', hasAnyDraft() === true);
  ok('앱 데이터 키와 분리', [...st._map.keys()].every((k) => k.startsWith('woosulsan-fc:draft:')), [...st._map.keys()].join(','));
  saveDraft('bulk', '   ');
  ok('빈 값이면 초안 삭제', readDraft('bulk') === null);
  saveDraft('member-name', '홍길동');
  clearDraft('member-name');
  ok('저장 성공 시 삭제', readDraft('member-name') === null && hasAnyDraft() === false);

  // 만료
  saveDraft('roster', '명단');
  const old = JSON.parse(st.getItem('woosulsan-fc:draft:roster'));
  st.setItem('woosulsan-fc:draft:roster', JSON.stringify({ ...old, at: Date.now() - DRAFT_TTL_MS - 1000 }));
  ok('오래된 초안은 버림', readDraft('roster') === null);

  // 재시작(다른 storage 객체) 후에도 살아남기
  saveDraft('bulk', '재시작 후에도 남아야 함');
  const raw = st.getItem('woosulsan-fc:draft:bulk');
  const st2 = makeStorage();
  st2.setItem('woosulsan-fc:draft:bulk', raw);
  globalThis.localStorage = st2;
  ok('앱 재시작 후 복원', readDraft('bulk').value === '재시작 후에도 남아야 함');
  ok('경과 표기', draftAgeLabel(Date.now() - 5 * 60000) === '5분 전', draftAgeLabel(Date.now() - 5 * 60000));
}

console.log('\n[5] 디바운스');
{
  let calls = 0;
  const d = debounce(() => { calls += 1; }, 20);
  d(); d(); d();
  await new Promise((r) => setTimeout(r, 50));
  ok('디바운스 = 마지막 1회', calls === 1, `${calls}회`);
  d.cancel();
  d(); d.cancel();
  await new Promise((r) => setTimeout(r, 40));
  ok('취소하면 실행 안 됨', calls === 1);
}

console.log('\n[모듈 버전 섞임 복구 계획 (v0.5.8)]');
{
  const { moduleFixPlan, MOD_RETRY_MAX } = await import('../env.js');
  ok('어긋난 파일 0개면 통과', moduleFixPlan(0, 0).action === 'ok');
  const p1 = moduleFixPlan(1, 0);
  ok('1회차 = 재시도, 0.6초 대기', p1.action === 'retry' && p1.attempt === 1 && p1.wait === 600, JSON.stringify(p1));
  const p2 = moduleFixPlan(2, 1);
  ok('2회차 = 2.4초로 늘어남', p2.action === 'retry' && p2.attempt === 2 && p2.wait === 2400, JSON.stringify(p2));
  const p3 = moduleFixPlan(1, 2);
  ok('3회차 = 5.4초', p3.action === 'retry' && p3.attempt === 3 && p3.wait === 5400, JSON.stringify(p3));
  ok('3회를 다 쓰면 포기(사람에게 안내)', moduleFixPlan(1, 3).action === 'giveup');
  ok('그 뒤로도 계속 포기', moduleFixPlan(1, 9).action === 'giveup');
  ok('sessionStorage 가 막혀 NaN 이면 즉시 포기', moduleFixPlan(1, NaN).action === 'giveup');
  ok('음수 시도 횟수는 0으로 본다', moduleFixPlan(1, -5).attempt === 1);
  ok('재시도 상한 기본값 3', MOD_RETRY_MAX === 3);
  ok('배포 구간을 덮는 총 대기 8.4초', 600 + 2400 + 5400 === 8400);
}

console.log(`\n결과: ${pass} PASS / ${fail} FAIL\n`);
process.exit(fail ? 1 : 0);
