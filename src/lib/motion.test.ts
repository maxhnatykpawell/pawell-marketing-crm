import assert from 'node:assert/strict';
import { tabDirection, shouldDismiss, staggerDelay, DUR, SPRING, EASE } from './motion';

const TABS = ['tasks', 'chat', 'profile'] as const;

// ── Напрямок переходу між вкладками ──────────────────────────────────────────
assert.equal(tabDirection(TABS, 'tasks', 'chat'), 1, 'вправо');
assert.equal(tabDirection(TABS, 'chat', 'tasks'), -1, 'вліво');
assert.equal(tabDirection(TABS, 'tasks', 'profile'), 1);
assert.equal(tabDirection(TABS, 'profile', 'tasks'), -1);
assert.equal(tabDirection(TABS, 'chat', 'chat'), 0, 'та сама вкладка — без руху');
assert.equal(tabDirection(TABS, 'tasks', 'nope' as any), 0, 'невідома вкладка не ламає');

// ── Закриття панелі жестом ───────────────────────────────────────────────────
assert.equal(shouldDismiss(150, 0), true, 'потягнули далеко');
assert.equal(shouldDismiss(110, 0), false, 'рівно на порозі — ще ні');
assert.equal(shouldDismiss(111, 0), true);
assert.equal(shouldDismiss(60, 0), false, 'недалеко й повільно — повертаємо назад');
assert.equal(shouldDismiss(60, 900), true, 'недалеко, але різко — закриваємо');
assert.equal(shouldDismiss(10, 2000), false, 'ледь торкнулись — навіть різкий рух не закриває');
assert.equal(shouldDismiss(-200, 0), false, 'потягнули вгору — це не закриття');
assert.equal(shouldDismiss(-50, 3000), false);

// ── Каскад ───────────────────────────────────────────────────────────────────
assert.equal(staggerDelay(0), 0);
assert.ok(Math.abs(staggerDelay(2) - 0.07) < 1e-9);
assert.equal(staggerDelay(8), staggerDelay(80), 'після ліміту всі з тією ж затримкою: довгий список не «розтягується»');
assert.equal(staggerDelay(-3), 0, 'від\'ємний індекс не дає від\'ємної затримки');
assert.ok(staggerDelay(80) < 0.5, 'весь каскад коротший за пів секунди');

// ── Токени: вихід коротший за вхід, криві коректні ────────────────────────────
assert.ok(DUR.exit < DUR.base && DUR.base < DUR.slow);
assert.ok(SPRING.sheet.damping > 0 && SPRING.ui.stiffness > 0);
assert.equal(EASE.out.length, 4);
assert.ok(EASE.out.every(n => typeof n === 'number'));

console.log('motion tests passed');
