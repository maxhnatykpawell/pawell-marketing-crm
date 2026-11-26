/**
 * Генератор PNG-іконок із векторного логотипа (для головного екрана телефона, apple-touch).
 *
 * У проєкті немає растеризатора SVG, тож контури малює браузер: скрипт піднімає крихітний
 * локальний сервер, віддає сторінку з canvas, а сторінка присилає готові PNG назад.
 *
 * Запуск:  npx tsx scratch/gen-brand-icons.ts
 *   далі відкрити http://localhost:5197/ у будь-якому браузері — файли запишуться в public/icons
 *   і сервер завершиться сам.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { LOGO_PATHS, BRAND, LOGO_VIEWBOX } from '../src/components/brand/PawellLogo';

// Шлях від кореня проєкту (скрипт запускають звідти): у ES-модулі __dirname недоступний
const OUT = path.resolve(process.cwd(), 'public/icons');
// Дозволяємо писати лише ці файли: сервер приймає дані з сторінки
const ALLOWED = new Set(['icon-192.png', 'icon-512.png', 'apple-touch-icon.png']);
const saved = new Set<string>();

const page = `<!doctype html><meta charset="utf-8"><title>Іконки PAWELL</title>
<body style="font:14px sans-serif;background:#0b0b0f;color:#f9db00;padding:24px"><p id="s">Малюємо…</p>
<script>
const PATHS = ${JSON.stringify(LOGO_PATHS)};
const BRAND = ${JSON.stringify(BRAND)};
const VB = ${JSON.stringify(LOGO_VIEWBOX)};
// Логотип займає 62 % ширини: решту лишаємо під безпечну зону маскованих іконок (Android обрізає краї)
const SHARE = 0.62;
async function draw(size) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = BRAND.ink; g.fillRect(0, 0, size, size);
  const k = (size * SHARE) / VB.w;
  g.setTransform(k, 0, 0, k, (size - VB.w * k) / 2, (size - VB.h * k) / 2);
  g.fillStyle = BRAND.yellow;
  g.fill(new Path2D(PATHS.frame));
  PATHS.letters.forEach(d => g.fill(new Path2D(d)));
  return new Promise(r => c.toBlob(r, 'image/png'));
}
(async () => {
  const jobs = [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]];
  for (const [name, size] of jobs) {
    const blob = await draw(size);
    const res = await fetch('/save/' + name, { method: 'POST', body: blob });
    document.getElementById('s').textContent = name + ': ' + res.status;
  }
  document.getElementById('s').textContent = 'Готово: іконки записано в public/icons';
})();
</script>`;

const server = http.createServer((req, res) => {
  const m = req.url?.match(/^\/save\/([\w.-]+)$/);
  if (req.method === 'POST' && m && ALLOWED.has(m[1])) {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      fs.writeFileSync(path.join(OUT, m[1]), Buffer.concat(chunks));
      saved.add(m[1]);
      console.log('записано', m[1], Buffer.concat(chunks).length, 'байт');
      res.end('ok');
      if (saved.size === ALLOWED.size) setTimeout(() => { server.close(); process.exit(0); }, 300);
    });
    return;
  }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(page);
});
server.listen(5197, '127.0.0.1', () => console.log('Відкрийте http://localhost:5197/'));
