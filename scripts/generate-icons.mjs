// Generates the placeholder PWA icons in public/. Dependency-free (zlib only).
// Run with: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BLUE = [0x1c, 0x7e, 0xd6];
const WHITE = [255, 255, 255];

function crc32(buf) {
  let c;
  const table = Array.from({ length: 256 }, (_, n) => {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function inRoundRect(u, v, x, y, w, h, r) {
  if (u < x || u > x + w || v < y || v > y + h) return false;
  const cx = Math.min(Math.max(u, x + r), x + w - r);
  const cy = Math.min(Math.max(v, y + r), y + h - r);
  return (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
}

// `scale` shrinks the plate toward the center (for the maskable safe zone).
function plate(scale, roundedBackground) {
  const t = (n) => 0.5 + (n - 0.5) * scale;
  const s = (n) => n * scale;
  return (u, v) => {
    if (roundedBackground && !inRoundRect(u, v, 0, 0, 1, 1, 0.19)) return WHITE;
    if (inRoundRect(u, v, t(0.125), t(0.28), s(0.75), s(0.44), s(0.08))) {
      if (inRoundRect(u, v, t(0.1875), t(0.34), s(0.625), s(0.08), s(0.03))) return BLUE;
      for (const bx of [0.22, 0.36, 0.55, 0.69]) {
        if (inRoundRect(u, v, t(bx), t(0.48), s(0.09), s(0.16), s(0.015))) return BLUE;
      }
      return WHITE;
    }
    return BLUE;
  };
}

writeFileSync('public/icon-192.png', png(192, plate(1, true)));
writeFileSync('public/icon-512.png', png(512, plate(1, true)));
writeFileSync('public/icon-512-maskable.png', png(512, plate(0.7, false)));
writeFileSync('public/apple-touch-icon.png', png(180, plate(0.85, false)));
console.log('Icons written to public/');
