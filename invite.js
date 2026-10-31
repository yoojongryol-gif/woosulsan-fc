/* 축구&joy — 초대 코드 게이트 (v1.2.0, 2026-10-28 / v1.3.0 해시 비교, 2026-11-01)
 *
 * 배경: "사장님 단독 사용" → "회원 3명 베타"로 올리는 1단계.
 * 이 앱은 백엔드가 없다(localStorage만, 기기별로 완전히 분리된 저장소 — dev/DATA_MODEL.md 참고).
 * 그래서 "초대 코드"는 기기마다 다르게 저장할 수 없다 — 모든 기기가 같은 값을 확인할 수 있는
 * 유일한 곳은 "배포된 코드 자체"뿐이다.
 * v1.3.0: 공개 저장소라 코드 원문을 소스에 두지 않는다. 원문 대신 PBKDF2-SHA256 해시(INVITE_CODE_HASH)만
 * 두고, 입력값을 같은 방식으로 해시해 비교한다. 코드를 바꾸려면 새 코드의 해시를 만들어 이 값을 바꾸고 재배포:
 *   node -e "const c=require('crypto');console.log(c.pbkdf2Sync(Buffer.from('새코드'.normalize('NFC')),Buffer.from('woosulsan-fc:invite:v1'),100000,32,'sha256').toString('hex'))"
 * 코드가 바뀌면 기존에 로그인했던 기기도 session.codeHash 불일치로 자동 재로그인 요구된다.
 * 한계: 코드가 짧으면 해시도 대입으로 풀 수 있다(반복 10만 회로 늦출 뿐). "원문을 그냥 읽히지 않게" 하는 수준이다.
 *
 * ⚠️ 중요한 한계(보고 필수): 로그인(이름+코드)은 기기 접근을 막을 뿐, 데이터를 공유하지 않는다.
 * 회원이 자기 기기에서 로그인해도 보이는 건 "그 기기의 빈 앱"이다 — 사장님 명단·경기 기록은
 * 사장님 기기에만 있다. 진짜 데이터 공유는 Firebase 같은 백엔드가 있어야 한다(아래 제안 참고).
 */

export const MODULE_VERSION = 'v1.3.0';

/** 현재 유효한 초대 코드의 해시 (원문은 저장소에 두지 않는다 — 사장님이 보관·전달). */
export const INVITE_CODE_HASH = '7d6c13cd1cb57b6fe00055e4617fd7a22ad92ae822df179bb08fcf9016267033';
const HASH_SALT = 'woosulsan-fc:invite:v1';
const HASH_ITER = 100000;

/** 만료일(ISO, 예: '2026-12-31'). null = 무제한. Settings 화면에 표시만, 값 변경은 재배포 필요. */
export const INVITE_EXPIRES_AT = null;

const SESSION_KEY = 'woosulsan-fc:session';

export function normalizeCode(s) {
  return String(s == null ? '' : s).trim().replace(/\s+/g, '').normalize('NFC');
}

/** 입력 코드 → 해시(hex). 브라우저 WebCrypto(https·localhost)가 없으면 null */
export async function hashCode(input) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const enc = new TextEncoder();
  const key = await subtle.importKey('raw', enc.encode(normalizeCode(input)), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(HASH_SALT), iterations: HASH_ITER }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function isExpired(now = Date.now()) {
  if (!INVITE_EXPIRES_AT) return false;
  const t = Date.parse(INVITE_EXPIRES_AT);
  return Number.isFinite(t) && now > t;
}

/** @returns {Promise<{ok:true, hash:string}|{ok:false, reason:'expired'|'empty'|'mismatch'|'nocrypto'}>} */
export async function checkCode(input) {
  const code = normalizeCode(input);
  if (!code) return { ok: false, reason: 'empty' };
  if (isExpired()) return { ok: false, reason: 'expired' };
  let h = null;
  try { h = await hashCode(code); } catch (e) { h = null; }
  if (!h) return { ok: false, reason: 'nocrypto' };
  if (h !== INVITE_CODE_HASH) return { ok: false, reason: 'mismatch' };
  return { ok: true, hash: h };
}

export function readSession(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

/** 로그인 기록. code = 이 기기에서 사람이 입력한 코드(설정 화면 '복사'용, 이 기기에만 남는다) */
export function writeSession(name, code, storage = globalThis.localStorage) {
  const session = {
    name: String(name == null ? '' : name).trim().slice(0, 20),
    code: normalizeCode(code),
    codeHash: INVITE_CODE_HASH,
    loginAt: new Date().toISOString(),
  };
  try { storage?.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) { /* 저장 실패는 무시 — 매번 다시 로그인 */ }
  return session;
}

export function clearSession(storage = globalThis.localStorage) {
  try { storage?.removeItem(SESSION_KEY); } catch (e) { /* 무시 */ }
}

/** 지금 이 기기가 로그인된 상태인가 (이름 있음 + 코드 해시가 지금 배포된 해시와 같음 + 만료 아님)
 *  v1.2.0 기기는 세션에 원문 code만 있다 → 한 번 해시해 보고 맞으면 codeHash를 채워 그대로 통과(재로그인 없음). */
export async function sessionValid(storage = globalThis.localStorage) {
  const s = readSession(storage);
  if (!s || !s.name) return false;
  if (isExpired()) return false;
  if (s.codeHash) return s.codeHash === INVITE_CODE_HASH;
  if (!s.code) return false;
  let h = null;
  try { h = await hashCode(s.code); } catch (e) { h = null; }
  if (h !== INVITE_CODE_HASH) return false;
  try { storage?.setItem(SESSION_KEY, JSON.stringify({ ...s, codeHash: h })); } catch (e) { /* 무시 */ }
  return true;
}

export function currentSessionName(storage = globalThis.localStorage) {
  return readSession(storage)?.name || '';
}

/** 이 기기에서 입력해 통과한 코드(설정 화면 표시·복사용). 없으면 '' */
export function currentSessionCode(storage = globalThis.localStorage) {
  return readSession(storage)?.code || '';
}
