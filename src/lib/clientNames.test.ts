import assert from 'node:assert/strict';
import {
  pickClientName, isFallbackName, fallbackName, applyClientNames, countFallbackNames, describeShape,
} from './clientNames';

// ── Витяг імені з різних форм відповіді ──────────────────────────────────────
assert.equal(pickClientName({ id: 1, name: 'ТОВ Альфа' }), 'ТОВ Альфа');
assert.equal(pickClientName({ id: 1, title: 'Укрзалізниця' }), 'Укрзалізниця');
assert.equal(pickClientName({ id: 1, name: '   ', title: 'Київстар' }), 'Київстар', 'порожнє поле пропускаємо');
assert.equal(pickClientName({ id: 1, company: { name: 'Метінвест' } }), 'Метінвест');
assert.equal(pickClientName({ id: 1, company: { title: 'Нафтогаз' } }), 'Нафтогаз');
assert.equal(pickClientName({ id: 1, person: { full_name: 'Іван Шевчук' } }), 'Іван Шевчук');
assert.equal(pickClientName({ id: 1, person: { first_name: 'Марія', last_name: 'Коваль' } }), 'Коваль Марія');
assert.equal(pickClientName({ id: 1, first_name: 'Олег', last_name: 'Іваненко' }), 'Іваненко Олег');
assert.equal(pickClientName({ id: 1, name: '  Подвійний   пробіл ' }), 'Подвійний пробіл', 'зайві пробіли стискаються');

// Компанія важливіша за людину: на картці клієнта вона й є назвою
assert.equal(pickClientName({ company: { name: 'Роshen' }, person: { full_name: 'Менеджер Петро' } }), 'Роshen');

// company / person як рядок, контакти масивом
assert.equal(pickClientName({ id: 1, company: 'ТОВ Бета' }), 'ТОВ Бета');
assert.equal(pickClientName({ id: 1, client_name: 'Гамма' }), 'Гамма');
assert.equal(pickClientName({ id: 1, contacts: [{ phone: '1' }, { full_name: 'Петро Сидоренко' }] }), 'Петро Сидоренко', 'перший контакт з іменем');
assert.equal(pickClientName({ id: 1, primary_contact: { first_name: 'Ольга', last_name: 'Гнатик' } }), 'Гнатик Ольга');

// Назву джерела, менеджера чи етапу назвою клієнта вважати не можна
assert.equal(pickClientName({ id: 1, source: { name: 'Instagram' }, manager: { name: 'Менеджер' }, stage: { title: 'Новий' } }), null);

// Нічого придатного → null, а не «undefined» чи номер
assert.equal(pickClientName({ id: 42 }), null);
assert.equal(pickClientName({ id: 42, name: null, title: '' }), null);
assert.equal(pickClientName(null), null);
assert.equal(pickClientName(undefined), null);
assert.equal(pickClientName('рядок'), null);
assert.equal(pickClientName({ name: 12345 }), null, 'число — не назва');

// ── Запасна назва ────────────────────────────────────────────────────────────
assert.equal(fallbackName('77'), 'Клієнт #77');
assert.equal(isFallbackName('Клієнт #77'), true);
assert.equal(isFallbackName('Клієнт Іванов'), false, 'звичайна назва зі словом «Клієнт» — не запасна');
assert.equal(isFallbackName(undefined), false);

// ── Підстановка назв ─────────────────────────────────────────────────────────
{
  const clients = [
    { id: '1', name: 'Клієнт #1', revenue: 10 },
    { id: '2', name: 'Справжня назва', revenue: 20 },
    { id: '3', name: 'Клієнт #3', revenue: 30 },
  ];
  const out = applyClientNames(clients, { '1': 'ТОВ Альфа', '2': 'Інша назва', '9': 'Невідомий' });
  assert.deepEqual(out.map(c => c.name), ['ТОВ Альфа', 'Справжня назва', 'Клієнт #3'], 'справжні не перезаписуємо, невідомі лишаємо');
  assert.equal(out[0].revenue, 10, 'решта полів збережена');
  assert.equal(clients[0].name, 'Клієнт #1', 'вхід не змінюється');

  // Нічого підставляти — повертаємо той самий масив (без зайвих перерендерів)
  assert.equal(applyClientNames(clients, {}), clients);
  assert.equal(applyClientNames(clients, null), clients);
  assert.equal(countFallbackNames(clients), 2);
  assert.equal(countFallbackNames(out), 1);
}

// ── Діагностика не виносить значень ──────────────────────────────────────────
{
  const shape = describeShape({ id: 5, name: 'Секретна назва', person: { full_name: 'Іван' }, tags: [{ name: 'B2B' }] }) as any;
  assert.deepEqual(shape, { id: 'number', name: 'string', person: { full_name: 'string' }, tags: [{ name: 'string' }] });
  assert.ok(!JSON.stringify(shape).includes('Секретна'), 'персональних даних у діагностиці немає');
}

console.log('clientNames tests passed');
