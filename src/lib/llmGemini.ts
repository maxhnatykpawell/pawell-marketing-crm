/**
 * Адаптер Gemini до нейтрального інтерфейсу моделі (див. llm.ts).
 *
 * Весь переклад «наша розмова ↔ формат Gemini» зосереджений тут: схеми
 * інструментів, ролі (assistant → model) і те, що відповіді інструментів
 * Gemini приймає лише у вигляді об'єкта, а не довільного значення.
 */
import { GoogleGenAI, Type } from '@google/genai';
import type { LlmProvider, LlmMessage, LlmTool, LlmTurn } from './llm';

const TYPES: Record<string, Type> = {
  object: Type.OBJECT, string: Type.STRING, number: Type.NUMBER,
  integer: Type.INTEGER, boolean: Type.BOOLEAN, array: Type.ARRAY,
};

/** JSON Schema → типи Gemini. Різниця лише в регістрі назв типів */
export function toGeminiSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  const out: any = { ...schema };
  if (typeof schema.type === 'string') out.type = TYPES[schema.type] ?? Type.STRING;
  if (schema.properties) {
    out.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([k, v]) => [k, toGeminiSchema(v)]),
    );
  }
  if (schema.items) out.items = toGeminiSchema(schema.items);
  return out;
}

export function toGeminiContents(messages: LlmMessage[]): any[] {
  const contents: any[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: m.text }] });
    } else if (m.role === 'assistant') {
      contents.push({
        role: 'model',
        parts: m.toolCalls?.length
          ? m.toolCalls.map(c => ({ functionCall: { name: c.name, args: c.args } }))
          : [{ text: m.text ?? '' }],
      });
    } else {
      const response = m.result && typeof m.result === 'object' && !Array.isArray(m.result)
        ? m.result : { result: m.result };
      const part = { functionResponse: { name: m.name, response } };
      // Відповіді на всі виклики одного кроку Gemini чекає одним повідомленням
      const last = contents[contents.length - 1];
      if (last?.role === 'user' && last.parts.every((p: any) => p.functionResponse)) last.parts.push(part);
      else contents.push({ role: 'user', parts: [part] });
    }
  }
  return contents;
}

export function createGeminiProvider(
  apiKey: string, opts: { model?: string; historyLimit?: number } = {},
): LlmProvider {
  const ai = new GoogleGenAI({ apiKey });
  const model = opts.model ?? 'gemini-2.5-flash';

  return {
    name: model,
    historyLimit: opts.historyLimit ?? 40,

    async complete(system: string, messages: LlmMessage[], tools: LlmTool[]): Promise<LlmTurn> {
      const response = await ai.models.generateContent({
        model,
        contents: toGeminiContents(messages),
        config: {
          systemInstruction: system,
          tools: tools.length
            ? [{
                functionDeclarations: tools.map(t => ({
                  name: t.name, description: t.description, parameters: toGeminiSchema(t.parameters),
                })),
              }]
            : undefined,
        },
      });
      const calls = response.functionCalls || [];
      return {
        text: calls.length ? '' : response.text || '',
        toolCalls: calls.map((c, i) => ({
          id: c.id || `call_${i}`, name: c.name || '', args: (c.args || {}) as Record<string, any>,
        })),
      };
    },
  };
}
