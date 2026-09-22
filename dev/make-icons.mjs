/* 아이콘 PNG 생성 — j⚽y 워드마크 (v0.5.7) (외부 의존성 0, node만) — node dev/make-icons.mjs */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(OUT, { recursive: true });

/* --------- PNG 인코더 --------- */
const CRC_T = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_T[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy ? rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
      : Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --------- 도형 --------- */
const SS = 3; // 슈퍼샘플링
function pentagon(cx, cy, r, rot = -Math.PI / 2) {
  return Array.from({ length: 5 }, (_, i) => {
    const a = rot + (i * 2 * Math.PI) / 5;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}
function inPoly(x, y, poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
function inRoundRect(x, y, w, h, r) {
  if (x < 0 || y < 0 || x > w || y > h) return false;
  const cx = Math.min(Math.max(x, r), w - r);
  const cy = Math.min(Math.max(y, r), h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function mix(a, b, t) { return a + (b - a) * t; }

/* --------- 획(스트로크) 헬퍼 --------- */
function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1; const dy = y2 - y1;
  const L = dx * dx + dy * dy;
  let t = L ? ((px - x1) * dx + (py - y1) * dy) / L : 0;
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
/** 원호 위의 거리 (a0 -> a1 라디안) */
function distArc(px, py, cx, cy, r, a0, a1) {
  let a = Math.atan2(py - cy, px - cx);
  const norm = (v) => { while (v < 0) v += Math.PI * 2; while (v >= Math.PI * 2) v -= Math.PI * 2; return v; };
  const s0 = norm(a0); const s1 = norm(a1); a = norm(a);
  const inside = s0 <= s1 ? (a >= s0 && a <= s1) : (a >= s0 || a <= s1);
  if (inside) return Math.abs(Math.hypot(px - cx, py - cy) - r);
  const e0 = [cx + r * Math.cos(s0), cy + r * Math.sin(s0)];
  const e1 = [cx + r * Math.cos(s1), cy + r * Math.sin(s1)];
  return Math.min(Math.hypot(px - e0[0], py - e0[1]), Math.hypot(px - e1[0], py - e1[1]));
}

/**
 * 아이콘: 둥근 초록 사각형 위에 "j ⚽ y" 워드마크.
 * 축구공이 joy 의 o 자리에 들어가 앱 이름(축구&joy)을 한 글자로 압축한다.
 */
function render(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const R = maskable ? 0 : size * 0.235;
  const s = maskable ? 0.72 : 1;          // maskable 안전영역
  const cx = size / 2; const cy = size / 2;

  const W = size * 0.058 * s;             // 글자 획 두께
  const half = W / 2;
  const ballR = size * 0.152 * s;         // 공(=o) 반지름
  const ringW = size * 0.040 * s;
  const gap = size * 0.052 * s;           // 글자 사이
  const top = cy - size * 0.150 * s;      // 글자 윗선
  const base = cy + size * 0.150 * s;     // 기준선

  // j : 세로획 + 아래 왼쪽 갈고리 + 점
  const jx = cx - ballR - gap - W * 0.5;
  const jHookR = size * 0.070 * s;
  const jStemBottom = base - jHookR;
  const jDot = [jx, top - size * 0.085 * s, W * 0.60];

  // y : 왼팔 + 오른팔(아래로 내려가는 꼬리)
  const yL = cx + ballR + gap;
  const yR = yL + size * 0.150 * s;
  const yM = (yL + yR) / 2;
  const yTail = [yM - size * 0.060 * s, base + size * 0.125 * s];

  const pent = pentagon(cx, cy, ballR * 0.52);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const X = x + (sx + 0.5) / SS;
          const Y = y + (sy + 0.5) / SS;
          if (!maskable && !inRoundRect(X, Y, size, size, R)) continue;
          // 배경: 대각 초록 그라데이션
          const t = Math.min(1, Math.max(0, (X + Y) / (size * 2)));
          let cr = mix(42, 20, t); let cg = mix(154, 87, t); let cb = mix(99, 58, t);

          let ink = false;
          // --- j ---
          if (distSeg(X, Y, jx, top, jx, jStemBottom) <= half) ink = true;
          else if (distArc(X, Y, jx - jHookR, jStemBottom, jHookR, 0, Math.PI / 2) <= half) ink = true;
          else if (Math.hypot(X - jDot[0], Y - jDot[1]) <= jDot[2]) ink = true;
          // --- y ---
          else if (distSeg(X, Y, yL, top, yM, base) <= half) ink = true;
          else if (distSeg(X, Y, yR, top, yTail[0], yTail[1]) <= half) ink = true;
          // --- o = 축구공 ---
          else {
            const d = Math.hypot(X - cx, Y - cy);
            if (Math.abs(d - ballR) < ringW / 2) ink = true;
            else if (inPoly(X, Y, pent)) ink = true;
          }
          if (ink) { cr = 255; cg = 255; cb = 255; }

          r += cr; g += cg; b += cb; a += 255;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      const aa = a / n;
      px[i] = Math.round(aa ? r / (a / 255) : 0);
      px[i + 1] = Math.round(aa ? g / (a / 255) : 0);
      px[i + 2] = Math.round(aa ? b / (a / 255) : 0);
      px[i + 3] = Math.round(aa);
    }
  }
  return encodePNG(size, size, px);
}

writeFileSync(join(OUT, 'icon-192.png'), render(192));
writeFileSync(join(OUT, 'icon-512.png'), render(512));
writeFileSync(join(OUT, 'icon-maskable-512.png'), render(512, { maskable: true }));
console.log('icons written to', OUT);
