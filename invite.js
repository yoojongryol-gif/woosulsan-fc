/* 축구&joy — 초대 코드 게이트 (v1.2.0, 2026-10-28)
 *
 * 배경: "사장님 단독 사용" → "회원 3명 베타"로 올리는 1단계.
 * 이 앱은 백엔드가 없다(localStorage만, 기기별로 완전히 분리된 저장소 — dev/DATA_MODEL.md 참고).
 * 그래서 "초대 코드"는 기기마다 다르게 저장할 수 없다 — 모든 기기가 같은 값을 확인할 수 있는
 * 유일한 곳은 "배포된 코드 자체"뿐이다. 그래서 INVITE_CODE 는 localStorage가 아니라
 * 이 파일의 상수다. 코드를 바꾸려면 이 값을 바꾸고 다시 배포한다(사장님 요청 → 1회 배포, 1분).
 * 코드가 바뀌면 기존에 로그인했던 기기도 session.code 불일치로 자동 재로그인 요구된다.
 *
 * ⚠️ 중요한 한계(보고 필수): 로그인(이름+코드)은 기기 접근을 막을 뿐, 데이터를 공유하지 않는다.
 * 회원이 자기 기기에서 로그인해도 보이는 건 "그 기기의 빈 앱"이다 — 사장님 명단·경기 기록은
 * 사장님 기기에만 있다. 진짜 데이터 공유는 Firebase 같은 백엔드가 있어야 한다(아래 제안 참고).
 */

export const MODULE_VERSION = 'v1.2.0';

/** 현재 유효한 초대 코드. 사장님이 Settings 화면에서 보고 회원에게 전달한다.
 *  코드를 바꾸려면: 이 값을 바꾸고 재배포(요청 한 줄로 가능). */
export const INVITE_CODE = '웃을산0001';

/** 만료일(ISO, 예: '2026-12-31'). null = 무제한. Settings 화면에 표시만, 값 변경은 재배포 필요. */
export const INVITE_EXPIRES_AT = null;

const SESSION_KEY = 'woosulsan-fc:session';

export function normalizeCode(s) {
  return String(s == null ? '' : s).trim().replace(/\s+/g, '');
}

export function isExpired(now = Date.now()) {
  if (!INVITE_EXPIRES_AT) return false;
  const t = Date.parse(INVITE_EXPIRES_AT);
  return Number.isFinite(t) && now > t;
}

/** @returns {{ok:true}|{ok:false, reason:'expired'|'empty'|'mismatch'}} */
export function checkCode(input) {
  const code = normalizeCode(input);
  if (!code) return { ok: false, reason: 'empty' };
  if (isExpired()) return { ok: false, reason: 'expired' };
  if (code !== normalizeCode(INVITE_CODE)) return { ok: false, reason: 'mismatch' };
  return { ok: true };
}

export function readSession(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

export function writeSession(name, storage = globalThis.localStorage) {
  const session = {
    name: String(name == null ? '' : name).trim().slice(0, 20),
    code: normalizeCode(INVITE_CODE),
    loginAt: new Date().toISOString(),
  };
  try { storage?.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) { /* 저장 실패는 무시 — 매번 다시 로그인 */ }
  return session;
}

export function clearSession(storage = globalThis.localStorage) {
  try { storage?.removeItem(SESSION_KEY); } catch (e) { /* 무시 */ }
}

/** 지금 이 기기가 로그인된 상태인가 (이름 있음 + 코드가 지금 배포된 코드와 같음 + 만료 아님) */
export function sessionValid(storage = globalThis.localStorage) {
  const s = readSession(storage);
  if (!s || !s.name) return false;
  if (isExpired()) return false;
  if (normalizeCode(s.code) !== normalizeCode(INVITE_CODE)) return false;
  return true;
}

export function currentSessionName(storage = globalThis.localStorage) {
  return readSession(storage)?.name || '';
}
