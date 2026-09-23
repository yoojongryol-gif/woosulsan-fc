/* 축구&joy — 실행 환경 감지 (데이터가 "어디에" 저장되는지 알려주기 위한 모듈)
 *
 * 배경: localStorage 는 "브라우저 + 출처" 단위로 나뉜다. 그래서 같은 주소라도
 *   · 카톡 인앱 브라우저에서 연 앱
 *   · 사파리/크롬 탭에서 연 앱
 *   · 홈 화면에 추가한 앱(standalone)  ← iOS 는 사파리와도 분리된다 (5959 실측)
 * 이 셋은 서로 다른 저장소를 쓴다. "명단이 사라졌다" 의 가장 흔한 원인이라 앱이 먼저 알려 준다.
 */

/** 버전 스탬프 — app.js 와 다르면 캐시가 섞인 것이므로 앱이 스스로 복구한다 */
export const MODULE_VERSION = 'v0.6.2';

/* ---------- 모듈 버전 섞임 복구 계획 (v0.5.8) ----------
 * 배포 직후 GitHub Pages 는 파일마다 따로 퍼져서 "app.js 만 새것" 인 구간이 생긴다.
 * 한 번만 새로고침하면 그 구간 안에서 재시도를 다 써 버리므로, 몇 번 더 기다렸다 다시 받는다.
 */
export const MOD_RETRY_MAX = 3;
export function moduleFixPlan(badCount, tries, max = MOD_RETRY_MAX) {
  const n = Number(badCount) || 0;
  if (n <= 0) return { action: 'ok' };
  const t = Number.isFinite(Number(tries)) ? Math.max(0, Number(tries)) : max;
  if (t >= max) return { action: 'giveup' };
  const attempt = t + 1;
  return { action: 'retry', attempt, wait: 600 * attempt * attempt };  // 0.6s / 2.4s / 5.4s
}

export const META_KEY = 'woosulsan-fc:meta';   // { lastBackupAt, bannerHiddenUntil }

const IN_APP = [
  { key: 'kakao', label: '카카오톡', re: /KAKAOTALK/i },
  { key: 'naver', label: '네이버 앱', re: /NAVER\(inapp|NAVER /i },
  { key: 'instagram', label: '인스타그램', re: /Instagram/i },
  { key: 'facebook', label: '페이스북', re: /FBAN|FBAV/i },
  { key: 'line', label: '라인', re: /Line\//i },
  { key: 'band', label: '밴드', re: /BAND\//i },
  { key: 'daum', label: '다음 앱', re: /DaumApps/i },
  { key: 'everytime', label: '앱 내 브라우저', re: /; wv\)/i },   // 안드로이드 WebView 일반
];

/**
 * @param {string} ua  navigator.userAgent
 * @param {object} opts { standalone:boolean, displayMode:'standalone'|'browser' }
 * @returns {{mode:'standalone'|'inapp'|'browser', app:string|null, appLabel:string|null, os:'ios'|'android'|'other', label:string}}
 */
export function detectEnv(ua = '', opts = {}) {
  const os = /iPhone|iPad|iPod/i.test(ua) ? 'ios' : (/Android/i.test(ua) ? 'android' : 'other');
  const hit = IN_APP.find((x) => x.re.test(ua));
  const standalone = !!opts.standalone || opts.displayMode === 'standalone';

  if (standalone) {
    return { mode: 'standalone', app: null, appLabel: null, os, label: '홈 화면 앱' };
  }
  if (hit) {
    return { mode: 'inapp', app: hit.key, appLabel: hit.label, os, label: `${hit.label} 안의 브라우저` };
  }
  return { mode: 'browser', app: null, appLabel: null, os, label: '브라우저 탭' };
}

/** 지금 브라우저 환경 읽기 (앱에서 호출) */
export function currentEnv(nav = globalThis.navigator, win = globalThis) {
  return detectEnv(nav?.userAgent || '', {
    standalone: !!nav?.standalone,
    displayMode: win?.matchMedia?.('(display-mode: standalone)')?.matches ? 'standalone' : 'browser',
  });
}

/* ---------------- 배너 판단 ---------------- */
/**
 * @returns {{type:'inapp'|'tab', title, body, action}|null}
 */
export function bannerFor(env, memberCount = 0, now = Date.now(), hiddenUntil = 0) {
  if (hiddenUntil && now < Number(hiddenUntil)) return null;
  if (env.mode === 'inapp') {
    return {
      type: 'inapp',
      title: `${env.appLabel} 안에서 열었습니다`,
      body: '여기서 넣은 명단은 이 앱 안에만 저장되고, 사파리·크롬에서 열면 보이지 않습니다. 브라우저로 연 뒤 홈 화면에 추가해서 쓰세요.',
      action: env.os === 'android' ? 'android-open' : 'ios-open',
    };
  }
  if (env.mode === 'browser' && memberCount > 0) {
    return {
      type: 'tab',
      title: '브라우저 탭에서 열었습니다',
      body: '홈 화면에 추가한 앱과 이 탭은 저장이 분리됩니다. 한 곳만 정해서 쓰세요.',
      action: env.os === 'ios' ? 'ios-add' : 'android-add',
    };
  }
  return null;
}

/** 안드로이드에서 크롬으로 다시 열기 위한 intent 링크 */
export function androidChromeIntent(url) {
  const clean = String(url).replace(/^https?:\/\//, '');
  return `intent://${clean}#Intent;scheme=https;package=com.android.chrome;end`;
}

/* ---------------- 백업 리마인더 ---------------- */
export const BACKUP_INTERVAL_DAYS = 7;

export function readMeta(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(META_KEY);
    const j = raw ? JSON.parse(raw) : {};
    return { lastBackupAt: j.lastBackupAt || null, bannerHiddenUntil: j.bannerHiddenUntil || 0 };
  } catch (e) { return { lastBackupAt: null, bannerHiddenUntil: 0 }; }
}
export function writeMeta(patch, storage = globalThis.localStorage) {
  const next = { ...readMeta(storage), ...patch };
  try { storage?.setItem(META_KEY, JSON.stringify(next)); } catch (e) { /* 저장 실패는 무시 */ }
  return next;
}

/** 백업 안내를 띄울까? (회원이 있고, 마지막 백업이 7일 넘었거나 아예 없으면) */
export function needsBackup(memberCount, lastBackupAt, now = Date.now(), days = BACKUP_INTERVAL_DAYS) {
  if (!memberCount) return false;
  if (!lastBackupAt) return true;
  // ISO 문자열·숫자 둘 다 받는다 (Number('2026-09-22T...') 는 NaN 이라 이전에 안내가 아예 안 떴다)
  const t = typeof lastBackupAt === 'number' ? lastBackupAt : Date.parse(lastBackupAt);
  if (!Number.isFinite(t)) return true;
  return now - t > days * 24 * 60 * 60 * 1000;
}

/** "3일 전", "오늘" 같은 표기 */
export function sinceLabel(iso, now = Date.now()) {
  if (!iso) return '아직 없음';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '알 수 없음';
  const diff = now - t;
  const day = 24 * 60 * 60 * 1000;
  if (diff < 60 * 1000) return '방금';
  if (diff < day) return `${Math.floor(diff / (60 * 60 * 1000)) || 1}시간 전`;
  const d = Math.floor(diff / day);
  return d === 1 ? '어제' : `${d}일 전`;
}
