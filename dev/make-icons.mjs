/* 아이콘 PNG 생성 (외부 의존성 0, node만) — node dev/make-icons.mjs */
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

function render(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const R = maskable ? 0 : size * 0.235;
  const s = maskable ? 0.74 : 1; // maskable 안전영역
  const cx = size / 2; const cy = size / 2;
  const ringR = size * 0.30 * s;
  const ringW = size * 0.035 * s;
  const pent = pentagon(cx, cy - size * 0.005, size * 0.175 * s);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const px0 = x + (sx + 0.5) / SS;
          const py0 = y + (sy + 0.5) / SS;
          if (!maskable && !inRoundRect(px0, py0, size, size, R)) continue;
          // 배경 그라데이션 (대각)
          const t = Math.min(1, Math.max(0, (px0 + py0) / (size * 2)));
          let cr = mix(42, 20, t); let cg = mix(154, 87, t); let cb = mix(99, 58, t);
          // 링
          const d = Math.hypot(px0 - cx, py0 - cy);
          if (Math.abs(d - ringR) < ringW / 2) { cr = mix(cr, 255, .55); cg = mix(cg, 255, .55); cb = mix(cb, 255, .55); }
          // 오각형(공)
          if (inPoly(px0, py0, pent)) { cr = 255; cg = 255; cb = 255; }
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
