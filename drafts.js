/* 축구&joy — 입력 초안 보존 (v0.5.3)
 *
 * 사고 배경(2026-09-22): 새 버전 서비스워커가 준비되면 앱이 곧바로 location.reload() 를 했다.
 * 일괄 추가 시트에 명단을 입력하던 중에 새로고침이 걸리면 저장 전 입력이 통째로 사라진다.
 * → ① 입력 중에는 새로고침하지 않고(app.js 의 업데이트 가드) ② 입력 내용은 여기서 계속 보존한다.
 *
 * 초안은 앱 데이터(woosulsan-fc:v1)와 분리된 키에 저장하므로 내보내기 JSON 에 섞이지 않는다.
 */

/** 버전 스탬프 — app.js 와 다르면 캐시가 섞인 것이므로 앱이 스스로 복구한다 */
export const MODULE_VERSION = 'v0.6.3';

export const DRAFT_PREFIX = 'woosulsan-fc:draft:';
export const DRAFT_TTL_MS = 3 * 24 * 60 * 60 * 1000;   // 3일 지난 초안은 버린다

export function draftKey(form) { return DRAFT_PREFIX + form; }

export function saveDraft(form, value, storage = globalThis.localStorage) {
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (!text || !text.trim()) return clearDraft(form, storage);
    storage?.setItem(draftKey(form), JSON.stringify({ v: text, at: Date.now() }));
    return true;
  } catch (e) { return false; }
}

export function readDraft(form, { now = Date.now(), storage = globalThis.localStorage } = {}) {
  try {
    const raw = storage?.getItem(draftKey(form));
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (!j?.v) return null;
    if (now - Number(j.at || 0) > DRAFT_TTL_MS) { clearDraft(form, storage); return null; }
    return { value: j.v, at: j.at };
  } catch (e) { return null; }
}

export function clearDraft(form, storage = globalThis.localStorage) {
  try { storage?.removeItem(draftKey(form)); } catch (e) { /* noop */ }
  return false;
}

/** 지금 저장된 초안이 하나라도 있나 (업데이트 가드에서 사용) */
export function hasAnyDraft(storage = globalThis.localStorage) {
  try {
    for (let i = 0; i < (storage?.length || 0); i += 1) {
      const k = storage.key(i);
      if (k && k.startsWith(DRAFT_PREFIX)) return true;
    }
  } catch (e) { /* noop */ }
  return false;
}

/** 입력 이벤트용 디바운스 */
export function debounce(fn, ms = 300) {
  let t = null;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args) => { clearTimeout(t); fn(...args); };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

/** "3분 전에 쓰던 내용" 같은 안내 문구 */
export function draftAgeLabel(at, now = Date.now()) {
  const diff = now - Number(at || 0);
  if (diff < 60 * 1000) return '방금';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}분 전`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}시간 전`;
  return `${Math.floor(diff / 86400000)}일 전`;
}
