import assert from 'node:assert/strict';
import { formatMessage, safeHref } from './chatFormat';

const kinds = (s: string) => formatMessage(s).map(p => `${p.kind}:${p.text}`);

assert.deepEqual(kinds('привіт'), ['text:привіт']);
assert.deepEqual(kinds('це *важливо* тут'), ['text:це ', 'bold:важливо', 'text: тут']);
assert.deepEqual(kinds('запусти `npm run dev` зараз'), ['text:запусти ', 'code:npm run dev', 'text: зараз']);
assert.deepEqual(kinds('_курсив_'), ['italic:курсив']);

// слова всередині не форматуються
assert.deepEqual(kinds('my_var_name'), ['text:my_var_name']);
assert.deepEqual(kinds('2*3*4'), ['text:2*3*4']);

// посилання; кінцева пунктуація не входить в адресу
assert.deepEqual(kinds('глянь https://docs.google.com/a/b, ок'), [
  'text:глянь ', 'link:https://docs.google.com/a/b', 'text:, ок',
]);
assert.equal(formatMessage('https://x.test/path?q=1')[0].href, 'https://x.test/path?q=1');

// небезпечні схеми не стають посиланнями
assert.equal(safeHref('javascript:alert(1)'), null);
assert.equal(safeHref('data:text/html,hi'), null);
assert.deepEqual(kinds('javascript:alert(1)'), ['text:javascript:alert(1)']);

// посилання всередині коду не чіпаємо
assert.deepEqual(kinds('`https://a.b`'), ['code:https://a.b']);

console.log('chatFormat tests passed');
