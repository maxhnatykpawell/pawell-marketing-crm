/**
 * Генерує іконки застосунку в public/icons і public/favicon.svg.
 *
 * Мотив той самий, що й у банері кабінету: рівна сітка крапок (порядок) із
 * хвилею, що тече крізь неї (потік). Літеру «P» складають яскраві білі крапки,
 * решта сітки ледь видна й переливається діагональною хвилею.
 *
 * Без залежностей: малюємо піксель за пікселем із суперсемплінгом і пишемо PNG
 * через zlib. Запуск: node scripts/make-icons.mjs
 *
 * Сітка займає центральні 60% площі, тож іконка однаково придатна і як звичайна
 * (any), і як maskable (Android обрізає колом/«сквіркл»), і для iOS (apple-touch-icon,
 * iOS сам заокруглює кути).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = path.resolve(process.cwd(), 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

// Градієнт фону: ті самі кольори, що в банері кабінету
const STOPS = [
  [0.0, [37, 99, 235]],   // blue-600
  [0.55, [79, 70, 229]],  // indigo-600
  [1.0, [124, 58, 237]],  // violet-600
];
const FG = [255, 255, 255];

// Сітка 9×9, літера «P» 5×7 у її центрі (стовпці 2-6, рядки 1-7)
const N = 9;
const SPACING = 0.075;
const START = 0.5 - (SPACING * (N - 1)) / 2;
const R_LETTER = 0.037;
const R_BG = 0.0185;
const P_BITMAP = [
  '1111.',
  '1...1',
  '1...1',
  '1111.',
  '1....',
  '1....',
  '1....',
];
const isLetter = (c, r) => P_BITMAP[r - 1]?.[c - 2] === '1';
/** Прозорість фонової крапки: діагональна хвиля, як у банері */
const waveAlpha = (c, r) => 0.16 + 0.24 * (0.5 + 0.5 * Math.sin((c - r) * 0.75 + 0.6));

function bgAt(t) {
  for (let k = 1; k < STOPS.length; k++) {
    if (t <= STOPS[k][0]) {
      const [t0, c0] = STOPS[k - 1];
      const [t1, c1] = STOPS[k];
      const u = (t - t0) / (t1 - t0);
      return c0.map((v, i) => v + (c1[i] - v) * u);
    }
  }
  return STOPS[STOPS.length - 1][1];
}

/** Яскравість білого в точці (x, y) ∈ [0,1]²: 0 — чистий фон, 1 — суцільний білий */
function dots(x, y) {
  const c = Math.round((x - START) / SPACING);
  const r = Math.round((y - START) / SPACING);
  if (c < 0 || c >= N || r < 0 || r >= N) return 0;
  const d = Math.hypot(x - (START + c * SPACING), y - (START + r * SPACING));
  const letter = isLetter(c, r);
  if (d > (letter ? R_LETTER : R_BG)) return 0;
  return letter ? 1 : waveAlpha(c, r);
}

function render(size) {
  const SS = 4; // суперсемплінг для згладжування
  const px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let g = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          g += dots((i + (sx + 0.5) / SS) / size, (j + (sy + 0.5) / SS) / size);
        }
      }
      g /= SS * SS;
      const bg = bgAt((i + j) / (2 * size)); // діагональний градієнт
      const o = (j * size + i) * 4;
      for (let c = 0; c < 3; c++) px[o + c] = Math.round(bg[c] + (FG[c] - bg[c]) * g);
      px[o + 3] = 255;
    }
  }
  return px;
}

/** Той самий малюнок для вкладки браузера: векторний, із заокругленими кутами */
function faviconSvg() {
  const f = v => +(v * 64).toFixed(2);
  let circles = '';
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const cx = f(START + c * SPACING);
      const cy = f(START + r * SPACING);
      circles += isLetter(c, r)
        ? `    <circle cx="${cx}" cy="${cy}" r="${f(R_LETTER)}" fill="#fff"/>\n`
        : `    <circle cx="${cx}" cy="${cy}" r="${f(R_BG)}" fill="#fff" fill-opacity="${waveAlpha(c, r).toFixed(2)}"/>\n`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <title>PAWELL</title>
  <defs>
    <linearGradient id="p" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2563eb"/>
      <stop offset="0.55" stop-color="#4f46e5"/>
      <stop offset="1" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#p)"/>
  <g>
${circles}  </g>
</svg>
`;
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
fs.writeFileSync(path.resolve(process.cwd(), 'public', 'favicon.svg'), faviconSvg());
console.log('✓ favicon.svg');
