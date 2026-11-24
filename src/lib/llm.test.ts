import {
  stripThinking, parseToolArgs, toOpenAiMessages, parseOpenAiTurn, createLocalProvider,
  withFallback, readLlmSetup, LlmMessage, LlmProvider, LocalLlmConfig,
} from './llm';
import { toGeminiContents, toGeminiSchema } from './llmGemini';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`); failures++; }
}

const cfg: LocalLlmConfig = {
  baseUrl: 'http://pc:11434/v1/', model: 'qwen3:14b', apiKey: 'sk-local',
  headers: { 'CF-Access-Client-Id': 'abc' }, extraBody: { reasoning_effort: 'none' },
  timeoutMs: 200, temperature: 0.2, historyLimit: 10, filePageChars: 6000,
};

const convo: LlmMessage[] = [
  { role: 'user', text: 'Що в проєкті горить?' },
  { role: 'assistant', toolCalls: [
    { id: 'c1', name: 'search_project_cards', args: { onlyOverdue: true } },
    { id: 'c2', name: 'get_team', args: {} },
  ] },
  { role: 'tool', callId: 'c1', name: 'search_project_cards', result: { total: 1 } },
  { role: 'tool', callId: 'c2', name: 'get_team', result: [{ name: 'Олена' }] },
];

async function main() {
  console.log('\nРозбір відповіді');
  {
    check('<think> вирізається', stripThinking('<think>міркую…</think>Готово'), 'Готово');
    check('обірваний <think>', stripThinking('Текст<think>міркую без кінця'), 'Текст');
    check('без think лишається як є', stripThinking('  Привіт '), 'Привіт');
    check('аргументи-рядок', parseToolArgs('{"a":1}'), { a: 1 });
    check('аргументи-об’єкт', parseToolArgs({ a: 2 }), { a: 2 });
    check('зламаний JSON → порожньо', parseToolArgs('{a:'), {});
    check('масив замість об’єкта → порожньо', parseToolArgs('[1,2]'), {});

    const turn = parseOpenAiTurn({ choices: [{ message: {
      content: null,
      tool_calls: [
        { id: 'x1', function: { name: 'get_team', arguments: '{}' } },
        { function: { name: 'search_project_cards', arguments: '{"query":"макет"}' } },
        { function: { name: '', arguments: '{}' } },
      ],
    } }] });
    check('виклики інструментів', turn.toolCalls, [
      { id: 'x1', name: 'get_team', args: {} },
      { id: 'call_1', name: 'search_project_cards', args: { query: 'макет' } },
    ]);
    check('текстова відповідь', parseOpenAiTurn({ choices: [{ message: { content: '<think>x</think>Відповідь' } }] }),
      { text: 'Відповідь', toolCalls: [] });
    let err = '';
    try { parseOpenAiTurn({ choices: [] }); } catch (e: any) { err = e.message; }
    check('порожня відповідь — помилка', err, 'Модель повернула порожню відповідь');
  }

  console.log('\nФормат OpenAI');
  {
    const msgs = toOpenAiMessages('СИСТЕМА', convo);
    check('системне повідомлення першим', msgs[0], { role: 'system', content: 'СИСТЕМА' });
    check('виклики як tool_calls зі строковими аргументами', msgs[2].tool_calls[0],
      { id: 'c1', type: 'function', function: { name: 'search_project_cards', arguments: '{"onlyOverdue":true}' } });
    check('content у виклику null', msgs[2].content, null);
    check('результат прив’язаний до виклику', [msgs[3].role, msgs[3].tool_call_id, msgs[3].content], ['tool', 'c1', '{"total":1}']);
    check('масив у результаті не ламається', msgs[4].content, '[{"name":"Олена"}]');
    check('звичайна відповідь асистента', toOpenAiMessages('s', [{ role: 'assistant', text: 'Так' }])[1], { role: 'assistant', content: 'Так' });
  }

  console.log('\nЗапит до локальної моделі');
  {
    let seen: any = null;
    const fakeFetch = async (url: string, init: any) => {
      seen = { url, init, body: JSON.parse(init.body) };
      return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
    };
    const p = createLocalProvider(cfg, fakeFetch as any);
    const turn = await p.complete('SYS', [{ role: 'user', text: 'hi' }],
      [{ name: 'get_team', description: 'Люди', parameters: { type: 'object', properties: {} } }]);
    check('відповідь', turn, { text: 'ok', toolCalls: [] });
    check('адреса без подвійного слеша', seen.url, 'http://pc:11434/v1/chat/completions');
    check('ключ і додаткові заголовки', [seen.init.headers.Authorization, seen.init.headers['CF-Access-Client-Id']], ['Bearer sk-local', 'abc']);
    check('модель, температура, без стрімінгу', [seen.body.model, seen.body.temperature, seen.body.stream], ['qwen3:14b', 0.2, false]);
    check('extraBody додано', seen.body.reasoning_effort, 'none');
    check('інструмент у форматі function', seen.body.tools[0], {
      type: 'function', function: { name: 'get_team', description: 'Люди', parameters: { type: 'object', properties: {} } },
    });

    await p.complete('SYS', [{ role: 'user', text: 'hi' }], []);
    check('без інструментів поле tools не шлемо', 'tools' in seen.body, false);

    const bad = createLocalProvider(cfg, (async () => ({ ok: false, status: 404, text: async () => 'model not found', json: async () => ({}) })) as any);
    let e1 = '';
    try { await bad.complete('s', [], []); } catch (e: any) { e1 = e.message; }
    check('HTTP-помилка з деталями', e1, 'Локальна модель відповіла 404: model not found');

    const slow = createLocalProvider(cfg, ((_u: string, init: any) => new Promise((_res, rej) => {
      init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })) as any);
    let e2 = '';
    try { await slow.complete('s', [], []); } catch (e: any) { e2 = e.message; }
    check('таймаут зрозумілою мовою', e2, 'Локальна модель не відповіла за 0 с'.replace('0 с', '0 с'));
  }

  console.log('\nЗапасний перехід');
  {
    const ok = (name: string, text: string): LlmProvider => ({ name, historyLimit: 5, complete: async () => ({ text, toolCalls: [] }) });
    const down: LlmProvider = { name: 'local', historyLimit: 10, filePageChars: 6000, complete: async () => { throw new Error('ECONNREFUSED'); } };

    const errors: string[] = [];
    const p = withFallback(down, ok('gemini', 'з хмари'), e => errors.push(e.message));
    check('при збої відповідає запасний', (await p.complete('s', [], [])).text, 'з хмари');
    check('збій повідомлено', errors, ['ECONNREFUSED']);
    check('ліміти беруться від основного', [p.historyLimit, p.filePageChars], [10, 6000]);
    check('основний живий — запасний мовчить', (await withFallback(ok('a', 'локально'), ok('b', 'хмара')).complete('s', [], [])).text, 'локально');
    let both = '';
    try { await withFallback(down, down).complete('s', [], []); } catch (e: any) { both = e.message; }
    check('обидва лягли — помилка доходить', both, 'ECONNREFUSED');
  }

  console.log('\nНалаштування');
  {
    check('за замовчуванням Gemini', readLlmSetup({}), { kind: 'gemini' });
    check('невідомий провайдер', (readLlmSetup({ LLM_PROVIDER: 'foo' }) as any).kind, 'error');
    check('local без адреси', (readLlmSetup({ LLM_PROVIDER: 'local', LLM_MODEL: 'm' }) as any).message.includes('LLM_BASE_URL'), true);
    check('local без моделі', (readLlmSetup({ LLM_PROVIDER: 'local', LLM_BASE_URL: 'http://x' }) as any).message.includes('LLM_MODEL'), true);
    check('зламаний JSON у заголовках',
      (readLlmSetup({ LLM_PROVIDER: 'local', LLM_BASE_URL: 'http://x', LLM_MODEL: 'm', LLM_EXTRA_HEADERS: '{oops' }) as any).message,
      "LLM_EXTRA_HEADERS має бути JSON-об'єктом");

    const s: any = readLlmSetup({
      LLM_PROVIDER: ' Local ', LLM_BASE_URL: 'http://pc:11434/v1', LLM_MODEL: 'qwen3:14b',
      LLM_EXTRA_HEADERS: '{"CF-Access-Client-Id":"id"}', LLM_EXTRA_BODY: '{"reasoning_effort":"none"}',
      LLM_FALLBACK_GEMINI: 'true', LLM_TIMEOUT_MS: '90000', LLM_HISTORY_MESSAGES: '6',
    });
    check('local розібрано', [s.kind, s.fallbackToGemini, s.config.timeoutMs, s.config.historyLimit, s.config.filePageChars],
      ['local', true, 90000, 6, 6000]);
    check('заголовки й тіло', [s.config.headers, s.config.extraBody], [{ 'CF-Access-Client-Id': 'id' }, { reasoning_effort: 'none' }]);
    const d: any = readLlmSetup({ LLM_PROVIDER: 'local', LLM_BASE_URL: 'http://x', LLM_MODEL: 'm', LLM_TIMEOUT_MS: 'abc', LLM_HISTORY_MESSAGES: '0' });
    check('сміття у числах → типові значення', [d.config.timeoutMs, d.config.historyLimit, d.fallbackToGemini], [180000, 10, false]);
  }

  console.log('\nФормат Gemini');
  {
    const c = toGeminiContents(convo);
    check('assistant → model', c[1].role, 'model');
    check('виклики як functionCall', c[1].parts.map((p: any) => p.functionCall.name), ['search_project_cards', 'get_team']);
    check('відповіді на виклики одним повідомленням', [c.length, c[2].parts.length], [3, 2]);
    check('масив обгорнуто в об’єкт', c[2].parts[1].functionResponse.response, { result: [{ name: 'Олена' }] });
    check('об’єкт лишається як є', c[2].parts[0].functionResponse.response, { total: 1 });
    const schema = toGeminiSchema({ type: 'object', properties: { a: { type: 'string' }, b: { type: 'array', items: { type: 'number' } } } });
    check('схема перекладена', [schema.type, schema.properties.a.type, schema.properties.b.items.type], ['OBJECT', 'STRING', 'NUMBER']);
  }

  if (failures > 0) { console.log(`\n✗ Провалено: ${failures}`); process.exit(1); }
  console.log('\n✓ Усе гаразд');
}

main();
