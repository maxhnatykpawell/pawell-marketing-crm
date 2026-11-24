import assert from 'node:assert/strict';
import { parseDeepLink, applyDeepLink, buildShareLink } from './deepLink';

assert.deepEqual(parseDeepLink('?view=board&project=p1&card=c1'), { view: 'board', project: 'p1', card: 'c1' });
assert.deepEqual(parseDeepLink(''), {});

// чужі параметри лишаються, порожні значення прибираються
assert.equal(applyDeepLink('?invite=abc&card=old', { view: 'board', card: null }), '?invite=abc&view=board');
assert.equal(applyDeepLink('?view=board', { view: null }), '');

// посилання для поширення не тягне чужих параметрів
assert.equal(buildShareLink('https://crm.test', '/', { view: 'board', project: 'p1' }), 'https://crm.test/?view=board&project=p1');

console.log('deepLink tests passed');
