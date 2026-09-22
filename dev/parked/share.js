/* 웃을산 FC — 팀 카드 공유 (서버 없이 링크/파일 교환)
 * 포맷 v1 문서: dev/SHARE_FORMAT.md
 * JSON → (가능하면 deflate 압축) → base64url → #t=<payload>
 */

export const SHARE_VERSION = 1;
export const SHARE_BASE = 'https://yoojongryol-gif.github.io/woosulsan-fc/';

/* ---------------- base64url ---------------- */
function bytesToB64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBytes(str) {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---------------- 압축 (지원 브라우저에서만) ---------------- */
export function canCompress() {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
}
async function deflate(bytes) {
  const cs = new CompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function inflate(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* ---------------- 인코딩 / 디코딩 ---------------- */
/** payload(JSON 직렬화 가능) → base64url 문자열. 접두 'z' = 압축본, 'j' = 평문 */
export async function encodePayload(payload) {
  const json = JSON.stringify(payload);
  const raw = new TextEncoder().encode(json);
  if (canCompress()) {
    try {
      const packed = await deflate(raw);
      if (packed.length < raw.length) return 'z' + bytesToB64url(packed);
    } catch (e) { /* 압축 실패 시 평문 */ }
  }
  return 'j' + bytesToB64url(raw);
}

export async function decodePayload(str) {
  const s = String(str || '').trim();
  if (!s) throw new Error('빈 카드입니다.');
  const mode = s[0];
  const body = s.slice(1);
  let bytes;
  try { bytes = b64urlToBytes(body); } catch (e) { throw new Error('카드 형식이 올바르지 않습니다.'); }
  if (mode === 'z') {
    if (!canCompress()) throw new Error('이 브라우저에서는 압축된 카드를 열 수 없습니다. 최신 브라우저에서 열어 주세요.');
    bytes = await inflate(bytes);
  } else if (mode !== 'j') {
    throw new Error('모르는 카드 형식입니다. 앱을 최신으로 업데이트해 주세요.');
  }
  let obj;
  try { obj = JSON.parse(new TextDecoder().decode(bytes)); } catch (e) { throw new Error('카드 내용을 읽지 못했습니다.'); }
  return validateCard(obj);
}

/** 받은 카드 검증 + 앞으로의 버전 호환 규칙 */
export function validateCard(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('카드 내용이 비어 있습니다.');
  const v = Number(obj.v);
  if (!Number.isFinite(v)) throw new Error('카드 버전이 없습니다.');
  if (v > SHARE_VERSION) {
    throw new Error(`상대가 더 새로운 버전(v${v})의 앱을 쓰고 있습니다. 앱을 새로고침해 주세요.`);
  }
  if (!obj.club?.id || !obj.team?.players?.length) throw new Error('클럽 또는 선수 정보가 없는 카드입니다.');
  return {
    v,
    club: {
      id: String(obj.club.id),
      name: String(obj.club.name || '상대 클럽').slice(0, 30),
      color: /^#[0-9a-f]{6}$/i.test(obj.club.color || '') ? obj.club.color : '#2f5fa8',
    },
    team: {
      name: String(obj.team.name || '팀').slice(0, 30),
      date: String(obj.team.date || '').slice(0, 10),
      place: String(obj.team.place || '').slice(0, 40),
      formation: String(obj.team.formation || '').slice(0, 10),
      size: Number(obj.team.size) || obj.team.players.length,
      players: obj.team.players.slice(0, 40).map((p, i) => ({
        name: String(p.name || `선수${i + 1}`).slice(0, 20),
        pos: ['FW', 'MF', 'DF', 'GK'].includes(p.pos) ? p.pos : 'MF',
        no: Number.isFinite(Number(p.no)) ? Number(p.no) : i + 1,
        gk: !!p.gk,
        // 선택 정보 (기본 공유에는 없음)
        skill: Number.isFinite(Number(p.skill)) ? Number(p.skill) : null,
        age: Number.isFinite(Number(p.age)) ? Number(p.age) : null,
        gender: p.gender === '남' || p.gender === '여' ? p.gender : null,
        abil: p.abil && typeof p.abil === 'object' ? p.abil : null,
      })),
      bench: Array.isArray(obj.team.bench) ? obj.team.bench.slice(0, 40).map((p, i) => ({
        name: String(p.name || `교체${i + 1}`).slice(0, 20),
        pos: ['FW', 'MF', 'DF', 'GK'].includes(p.pos) ? p.pos : 'MF',
        gk: !!p.gk,
      })) : [],
    },
    opts: obj.opts && typeof obj.opts === 'object' ? obj.opts : {},
    sentAt: obj.sentAt || null,
  };
}

/** 공유 링크 만들기 */
export async function buildShareLink(payload, base = SHARE_BASE) {
  const code = await encodePayload(payload);
  return { url: `${base}#t=${code}`, code, length: `${base}#t=${code}`.length };
}

/** 링크/텍스트에서 카드 코드 추출 (#t=... 또는 코드 자체) */
export function extractCode(text) {
  const s = String(text || '').trim();
  const m = s.match(/#t=([A-Za-z0-9\-_]+)/);
  if (m) return m[1];
  if (/^[jz][A-Za-z0-9\-_]+$/.test(s)) return s;
  return null;
}

/**
 * 우리 팀 → 공유 카드 페이로드
 * 기본은 이름·포지션·등번호만. opts 로 실력/나이/성별/능력치를 선택 포함.
 */
export function buildTeamCard({ club, teamName, date, place, formation, size, players, bench = [], opts = {} }) {
  const pick = (m, i) => {
    const base = { name: m.name, pos: m.pos || 'MF', no: i + 1, gk: !!m.gk };
    if (opts.skill) base.skill = m.skill ?? null;
    if (opts.age && m.birthYear) base.age = new Date().getFullYear() - m.birthYear;
    if (opts.gender && m.gender) base.gender = m.gender;
    if (opts.abil && m.abil) base.abil = m.abil;
    return base;
  };
  return {
    v: SHARE_VERSION,
    club: { id: club.id, name: club.name, color: club.color },
    team: {
      name: teamName, date: date || '', place: place || '',
      formation: formation || '', size: size || players.length,
      players: players.map(pick),
      bench: bench.map((m) => ({ name: m.name, pos: m.pos || 'MF', gk: !!m.gk })),
    },
    opts: { skill: !!opts.skill, age: !!opts.age, gender: !!opts.gender, abil: !!opts.abil },
    sentAt: new Date().toISOString(),
  };
}
