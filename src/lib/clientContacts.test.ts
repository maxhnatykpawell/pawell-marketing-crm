import assert from 'node:assert/strict';
import { normalizeClientDetails, hasAnyDetails, telHref } from './clientContacts';

const users = new Map([['7', 'Ірина Блюс'], ['9', 'Марек Новак']]);

// ── Відповідальний ───────────────────────────────────────────────────────────
assert.deepEqual(normalizeClientDetails({ manager: { id: 7, name: 'Олег Ткач' } }, users).responsible, { id: '7', name: 'Олег Ткач' });
assert.deepEqual(normalizeClientDetails({ manager: { id: 7 } }, users).responsible, { id: '7', name: 'Ірина Блюс' }, 'імʼя з довідника, коли в картці лише id');
assert.deepEqual(normalizeClientDetails({ manager_id: 9 }, users).responsible, { id: '9', name: 'Марек Новак' });
assert.deepEqual(normalizeClientDetails({ responsible: 7 }, users).responsible, { id: '7', name: 'Ірина Блюс' });
assert.deepEqual(normalizeClientDetails({ owner: 'Іван Шевчук' }, users).responsible, { id: null, name: 'Іван Шевчук' }, 'рядок, що не є id — це ім’я');
assert.deepEqual(normalizeClientDetails({ manager: { id: 555 } }, users).responsible, { id: '555', name: null }, 'невідомий id — без імені, але не губимо');
assert.equal(normalizeClientDetails({ title: 'ТОВ' }, users).responsible, null);
// Джерело й етап менеджером не стають
assert.equal(normalizeClientDetails({ source: { name: 'Instagram' }, stage: { title: 'Новий' } }, users).responsible, null);

// ── Люди й ролі в одній компанії ─────────────────────────────────────────────
{
  const d = normalizeClientDetails({
    id: 1, title: 'Аеропорт',
    phone: '+38 044 111-22-33',
    contacts: [
      { full_name: 'Петро Директоров', position: 'Директор', phone: '+380501112233' },
      { first_name: 'Ольга', last_name: 'Технолог', position: 'Головний технолог', department: 'Технічний', phones: ['067 444 55 66', { number: '063 777 88 99' }] },
      { name: 'Відділ закупівель', role: 'Закупівлі', email: 'buy@airport.ua', phone: '044 999 00 11' },
    ],
  });
  assert.equal(d.contacts.length, 3);
  const by = (n: string) => d.contacts.find(c => c.name === n)!;
  assert.equal(by('Петро Директоров').role, 'Директор');
  assert.deepEqual(by('Технолог Ольга').phones, ['067 444 55 66', '063 777 88 99'], 'кілька номерів однієї людини');
  assert.equal(by('Технолог Ольга').role, 'Головний технолог · Технічний');
  assert.deepEqual(by('Відділ закупівель').emails, ['buy@airport.ua']);
  assert.deepEqual(d.companyPhones, ['+38 044 111-22-33'], 'загальний телефон компанії окремо від людей');
  assert.equal(hasAnyDetails(d), true);
}

// Номер, що вже належить людині, у «загальних» не дублюється (навіть записаний інакше)
{
  const d = normalizeClientDetails({ phone: '050-111-22-33', contacts: [{ name: 'Іван', phone: '+38 (050) 111 22 33' }] });
  assert.deepEqual(d.companyPhones, []);
  assert.equal(d.contacts[0].phones.length, 1);
}

// Кілька номерів в одному рядку
assert.deepEqual(
  normalizeClientDetails({ contacts: [{ name: 'А', phone: '050 111 22 33, 067 444 55 66; 050 111 22 33' }] }).contacts[0].phones,
  ['050 111 22 33', '067 444 55 66'], 'розділено й без дублів',
);

// Основний контакт спершу, решта за алфавітом
{
  const d = normalizeClientDetails({
    contacts: [{ name: 'Яків', phone: '0501112233' }, { name: 'Андрій', phone: '0502223344' }],
    primary_contact: { name: 'Борис', phone: '0503334455' },
  });
  assert.deepEqual(d.contacts.map(c => c.name), ['Борис', 'Андрій', 'Яків']);
  assert.equal(d.contacts[0].primary, true);
}

// Та сама людина у двох полях не дублюється
{
  const d = normalizeClientDetails({
    person: { name: 'Марія', phone: '0501112233' },
    contacts: [{ name: 'Марія', phone: '0501112233', position: 'Бухгалтер' }],
  });
  assert.equal(d.contacts.length, 1);
  assert.equal(d.contacts[0].role, 'Бухгалтер', 'доповнено роллю з іншого поля');
  assert.equal(d.contacts[0].primary, true);
}

// ── Не вигадуємо ─────────────────────────────────────────────────────────────
{
  const d = normalizeClientDetails({ id: 5, title: 'ТОВ Без контактів', contacts: [{}, { foo: 'bar' }, null] });
  assert.deepEqual(d.contacts, []);
  assert.equal(hasAnyDetails(d), false);
}
assert.deepEqual(normalizeClientDetails(null), { responsible: null, companyPhones: [], companyEmails: [], contacts: [] });
assert.deepEqual(normalizeClientDetails('сміття'), { responsible: null, companyPhones: [], companyEmails: [], contacts: [] });
// Не телефон: короткі числа, ідентифікатори, текст
assert.deepEqual(normalizeClientDetails({ phone: '12345' }).companyPhones, []);
assert.deepEqual(normalizeClientDetails({ phone: 'немає' }).companyPhones, []);
assert.deepEqual(normalizeClientDetails({ contacts: [{ name: 'X', phone: 'АБВ 1234567890123456789' }] }).contacts[0].phones, []);

// Пошта: з рядка з текстом
assert.deepEqual(normalizeClientDetails({ email: 'Пишіть сюди: info@firm.ua, дякуємо' }).companyEmails, ['info@firm.ua']);

// ── tel: ─────────────────────────────────────────────────────────────────────
assert.equal(telHref('+38 (050) 111-22-33'), 'tel:+380501112233');

console.log('clientContacts tests passed');
