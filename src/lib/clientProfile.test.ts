import assert from 'node:assert/strict';
import {
  sanitizeClientProfile, isEmptyClientProfile, resolveResponsible, matchesOwnerFocus, attachOwners, NO_OWNER,
} from './clientProfile';

// ── Санітизація ──────────────────────────────────────────────────────────────
assert.deepEqual(sanitizeClientProfile({ responsibleUserId: 'u1' }), { responsibleUserId: 'u1' });
assert.deepEqual(sanitizeClientProfile({ responsibleUserId: '  u1  ' }), { responsibleUserId: 'u1' });
assert.deepEqual(sanitizeClientProfile(null), {});
assert.deepEqual(sanitizeClientProfile('сміття'), {});
assert.deepEqual(sanitizeClientProfile({ responsibleUserId: '' }), {}, 'порожнє — не призначення');
assert.deepEqual(sanitizeClientProfile({ responsibleUserId: '   ' }), {});
assert.deepEqual(sanitizeClientProfile({ responsibleUserId: 5 }), {}, 'число — не id');
assert.deepEqual(sanitizeClientProfile({ responsibleUserId: 'a/b' }), {}, 'слеш вивів би запис за межі колекції');
assert.deepEqual(sanitizeClientProfile({ responsibleUserId: '../x' }), {});
assert.deepEqual(sanitizeClientProfile({ responsibleUserId: 'x'.repeat(300) }), {});
assert.deepEqual(sanitizeClientProfile({ responsibleUserId: 'u1', evil: '<script>', updatedBy: 'Хакер' }), { responsibleUserId: 'u1' }, 'зайві поля не проходять');
assert.equal(isEmptyClientProfile({}), true);
assert.equal(isEmptyClientProfile({ responsibleUserId: 'u1' }), false);

// ── Хто відповідає: наше призначення важливіше за KeepInCRM ───────────────────
const team = new Map([['u1', 'Ірина Блюс'], ['u2', 'Марек Новак']]);
assert.deepEqual(resolveResponsible({ responsibleUserId: 'u1' }, team, 'Менеджер з CRM'),
  { source: 'local', userId: 'u1', name: 'Ірина Блюс', missing: false }, 'наше призначення перекриває CRM');
assert.deepEqual(resolveResponsible({}, team, 'Менеджер з CRM'),
  { source: 'keepincrm', userId: null, name: 'Менеджер з CRM', missing: false }, 'у нас не призначено — показуємо, що віддала CRM');
assert.deepEqual(resolveResponsible(undefined, team, null),
  { source: 'none', userId: null, name: null, missing: false });
assert.deepEqual(resolveResponsible(undefined, team),
  { source: 'none', userId: null, name: null, missing: false });

// Людину прибрали з команди — призначення не губимо, але й імені не вигадуємо
assert.deepEqual(resolveResponsible({ responsibleUserId: 'gone' }, team, 'Менеджер з CRM'),
  { source: 'local', userId: 'gone', name: null, missing: true });

// ── Фокус за відповідальним ──────────────────────────────────────────────────
assert.equal(matchesOwnerFocus('u1', null), true);
assert.equal(matchesOwnerFocus(null, null), true);
assert.equal(matchesOwnerFocus('u1', 'u1'), true);
assert.equal(matchesOwnerFocus('u2', 'u1'), false);
assert.equal(matchesOwnerFocus(null, 'u1'), false);
assert.equal(matchesOwnerFocus(null, NO_OWNER), true, '«без відповідального»');
assert.equal(matchesOwnerFocus(undefined, NO_OWNER), true);
assert.equal(matchesOwnerFocus('u1', NO_OWNER), false);

// ── Приєднання до клієнтів ───────────────────────────────────────────────────
{
  const clients = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  const out = attachOwners(clients, { a: { responsibleUserId: 'u1' } });
  assert.deepEqual(out.map(c => c.responsibleUserId), ['u1', null]);
  assert.equal(out[0].name, 'A', 'решта полів збережена');
  assert.equal((clients[0] as any).responsibleUserId, undefined, 'вхід не змінюється');
}

console.log('clientProfile tests passed');
