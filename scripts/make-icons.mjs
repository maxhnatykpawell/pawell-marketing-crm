/**
 * Генерує PNG-іконки застосунку (літера «P» на синьому фоні) у public/icons.
 * Без залежностей: малюємо піксель за пікселем із суперсемплінгом і пишемо PNG
 * через zlib. Запуск: node scripts/make-icons.mjs
 *
 * Іконка «на всю площу» з літерою в центральних ~55%: так вона однаково
 * придатна і як звичайна (any), і як maskable (Android обрізає її колом/«сквіркл»),
 * і для iOS (apple-touch-icon, iOS сам заокруглює кути).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = path.resolve(process.cwd(), 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

const BG_TOP = [37, 99, 235];    // blue-600
const BG_BOTTOM = [79, 70, 229]; // indigo-600
const FG = [255, 255, 255];

/** Покриття літери «P» у точці (x, y) ∈ [0,1]²: 1 — літера, 0 — фон */
function glyph(x, y) {
  // Літера займає центральну ділянку: ширина ~0.36, висота ~0.5
  const left = 0.32, right = 0.68, top = 0.25, bottom = 0.75;
  const stemW = 0.095;
  // Стовбур
  if (x >= left && x <= left + stemW && y >= top && y <= bottom) return 1;
  // Чаша: кільце з центром праворуч від стовбура
  const cy = top + (bottom - top) * 0.28;
  const rOuter = (bottom - top) * 0.28;
  const rInner = rOuter - stemW;
  const cx = right - rOuter;
  if (x >= left && x <= cx && y >= top && y <= top + stemW) return 1;              // верхня перемичка
  if (x >= left && x <= cx && y >= cy + rOuter - stemW && y <= cy + rOuter) return 1; // нижня перемичка
  if (x > cx) {
    const d = Math.hypot(x - cx, y - cy);
    if (d <= rOuter && d >= rInner) return 1;
  }
  return 0;
}

function render(size) {
  const SS = 3; // суперсемплінг для згладжування
  const px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let g = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          g += glyph((i + (sx + 0.5) / SS) / size, (j + (sy + 0.5) / SS) / size);
        }
      }
      g /= SS * SS;
      const t = (i + j) / (2 * size); // діагональний градієнт
      const o = (j * size + i) * 4;
      for (let c = 0; c < 3; c++) {
        const bg = BG_TOP[c] + (BG_BOTTOM[c] - BG_TOP[c]) * t;
        px[o + c] = Math.round(bg + (FG[c] - bg) * g);
      }
      px[o + 3] = 255;
    }
  }
  return px;
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 біт, RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // фільтр None
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  fs.writeFileSync(path.join(OUT, name), png(size, render(size)));
  console.log(`✓ ${name} (${size}×${size})`);
}
