import assert from 'node:assert/strict';
import { decideSplash, SPLASH_TIMING } from './splash';

const ctx = (o: Partial<{ search: string; seen: boolean; reducedMotion: boolean }> = {}) =>
  ({ search: '', seen: false, reducedMotion: false, ...o });

// Перший запуск у сеансі — повна анімація
assert.equal(decideSplash(ctx()), 'full');

// Уже показували — не повторюємо
assert.equal(decideSplash(ctx({ seen: true })), 'none');

// Просили менше руху — коротка версія, а не повна
assert.equal(decideSplash(ctx({ reducedMotion: true })), 'short');
// ...і вже бачили — тим паче нічого
assert.equal(decideSplash(ctx({ reducedMotion: true, seen: true })), 'none');

// ?splash=1 показує знову, навіть якщо вже бачили
assert.equal(decideSplash(ctx({ seen: true, search: '?splash=1' })), 'full');
assert.equal(decideSplash(ctx({ seen: true, search: '?foo=1&splash=1' })), 'full');
// але повагу до «менше руху» не скасовує
assert.equal(decideSplash(ctx({ seen: true, search: '?splash=1', reducedMotion: true })), 'short');

// Інші значення параметра не вмикають
assert.equal(decideSplash(ctx({ seen: true, search: '?splash=0' })), 'none');
assert.equal(decideSplash(ctx({ seen: true, search: '?splash' })), 'none');

// Часи: заставка не коротша за саму анімацію (~2,6 с) і не нескінченна
assert.ok(SPLASH_TIMING.fullMs >= 2600 && SPLASH_TIMING.fullMs <= 4000);
assert.ok(SPLASH_TIMING.shortMs < SPLASH_TIMING.fullMs);

console.log('splash tests passed');
