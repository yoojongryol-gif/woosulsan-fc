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

export const MODULE_VERSION = 'v1.3.2';

/** 초대 코드 게이트 켜기/끄기 (v1.3.1). false = 게이트를 건너뛰고 바로 앱을 연다.
 *  배경: 백엔드가 없어 데이터는 기기별 localStorage — 게이트는 데이터를 지키지 못하고 입장 마찰만 만든다.
 *  값을 바꾸면 재배포해야 반영된다. */
export const INVITE_ENABLED = false; // 2026-11-01 사장님 결정: 공유 백엔드 전까지 게이트 끔(입장화면 멈춤 신고)

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

const toHex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');

/* ---- 순수 JS PBKDF2-HMAC-SHA256 (v1.3.1) ----
 * WebCrypto(crypto.subtle)가 없거나 PBKDF2를 거부하는 환경(일부 인앱 브라우저·구형 WebView·비보안 접속)에서도
 * 같은 해시를 만든다. v1.3.0은 이 경우 정답 코드도 거부하고 기존 로그인 기기까지 잠갔다. */
const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
const IV256 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const W = new Uint32Array(64);
function compress(H, words) {   // H: Uint32Array(8) 갱신, words: 16개 32비트 워드
  for (let i = 0; i < 16; i++) W[i] = words[i];
  for (let i = 16; i < 64; i++) {
    const a = W[i - 15], b = W[i - 2];
    const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
    const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
  }
  let [a, b, c, d, e, f, g, h] = H;
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K256[i] + W[i]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
}
function sha256Blocks(H, bytes, prefixLen) {   // 패딩 포함 전체 처리 (prefixLen = 앞서 처리한 바이트 수)
  const total = prefixLen + bytes.length;
  const n = Math.ceil((bytes.length + 9) / 64) * 64;
  const buf = new Uint8Array(n); buf.set(bytes); buf[bytes.length] = 0x80;
  const bits = total * 8;
  buf[n - 4] = (bits >>> 24) & 255; buf[n - 3] = (bits >>> 16) & 255; buf[n - 2] = (bits >>> 8) & 255; buf[n - 1] = bits & 255;
  buf[n - 5] = Math.floor(bits / 2 ** 32) & 255;
  const w = new Uint32Array(16);
  for (let o = 0; o < n; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = (buf[o + i * 4] << 24) | (buf[o + i * 4 + 1] << 16) | (buf[o + i * 4 + 2] << 8) | buf[o + i * 4 + 3];
    compress(H, w);
  }
}
function wordsToBytes(H) {
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) { out[i * 4] = H[i] >>> 24; out[i * 4 + 1] = H[i] >>> 16; out[i * 4 + 2] = H[i] >>> 8; out[i * 4 + 3] = H[i]; }
  return out;
}
function sha256(bytes) { const H = new Uint32Array(IV256); sha256Blocks(H, bytes, 0); return wordsToBytes(H); }
export function pbkdf2Sha256Js(passBytes, saltBytes, iter) {
  let key = passBytes.length > 64 ? sha256(passBytes) : passBytes;
  const k = new Uint8Array(64); k.set(key);
  const ipad = new Uint32Array(16), opad = new Uint32Array(16);
  for (let i = 0; i < 16; i++) {
    const v = (k[i * 4] << 24) | (k[i * 4 + 1] << 16) | (k[i * 4 + 2] << 8) | k[i * 4 + 3];
    ipad[i] = v ^ 0x36363636; opad[i] = v ^ 0x5c5c5c5c;
  }
  const Hi = new Uint32Array(IV256); compress(Hi, ipad);   // 키 블록 미리 처리
  const Ho = new Uint32Array(IV256); compress(Ho, opad);
  const hmac = (msg) => {
    const a = new Uint32Array(Hi); sha256Blocks(a, msg, 64);
    const b = new Uint32Array(Ho); sha256Blocks(b, wordsToBytes(a), 64);
    return wordsToBytes(b);
  };
  const first = new Uint8Array(saltBytes.length + 4); first.set(saltBytes); first[first.length - 1] = 1;   // 블록 번호 1 (32바이트 출력)
  let u = hmac(first); const t = u.slice();
  for (let i = 1; i < iter; i++) { u = hmac(u); for (let j = 0; j < 32; j++) t[j] ^= u[j]; }
  return t;
}

/** 입력 코드 → 해시(hex). WebCrypto 우선, 없거나 실패하면 순수 JS로 같은 값을 계산한다 (v1.3.1) */
export async function hashCode(input) {
  const enc = new TextEncoder();
  const pass = enc.encode(normalizeCode(input));
  const salt = enc.encode(HASH_SALT);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      const key = await subtle.importKey('raw', pass, 'PBKDF2', false, ['deriveBits']);
      const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: HASH_ITER }, key, 256);
      return toHex(new Uint8Array(bits));
    } catch (e) { console.warn('[invite] WebCrypto PBKDF2 실패 → 순수 JS로 계산', e); }
  }
  return toHex(pbkdf2Sha256Js(pass, salt, HASH_ITER));
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
