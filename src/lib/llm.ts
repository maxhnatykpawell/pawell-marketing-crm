/**
 * Модель за інтерфейсом: асистенти не знають, хто саме відповідає.
 *
 * Розмова описується нейтрально (користувач / асистент з викликами / результат
 * інструмента), а як це лягає на API конкретної моделі — справа адаптера.
 * Тому перехід між хмарною Gemini і моделлю на власному ПК — це зміна рядка в
 * .env, а не переписування логіки асистентів.
 *
 * Тут лише адаптер для будь-якого OpenAI-сумісного сервера (Ollama, LM Studio,
 * llama.cpp, vLLM) і правила вибору провайдера. Адаптер Gemini лежить окремо
 * (llmGemini.ts), щоб цей файл не тягнув SDK і весь розбір перевірявся тестами
 * з підставним fetch.
 */

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, any>;
}

export type LlmMessage =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text?: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; callId: string; name: string; result: unknown };

export interface LlmTool {
  name: string;
  description: string;
  /** JSON Schema з малими літерами типів — як в assistantTools */
  parameters: Record<string, any>;
}

export interface LlmTurn {
  text: string;
  toolCalls: ToolCall[];
}

export interface LlmProvider {
  name: string;
  /** Скільки останніх повідомлень історії передавати моделі */
  historyLimit: number;
  /** Розмір сторінки файла в символах. У локальної моделі контекст менший */
  filePageChars?: number;
  complete(system: string, messages: LlmMessage[], tools: LlmTool[]): Promise<LlmTurn>;
}

// ── Локальна модель (OpenAI-сумісний API) ─────────────────────────────────────

export interface LocalLlmConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  /** Додаткові заголовки, напр. CF-Access-Client-Id для Cloudflare Tunnel */
  headers: Record<string, string>;
  /** Довільні поля тіла запиту, напр. {"reasoning_effort":"none"} */
  extraBody: Record<string, unknown>;
  timeoutMs: number;
  temperature: number;
  historyLimit: number;
  filePageChars: number;
}

type FetchLike = (url: string, init: any) => Promise<{
  ok: boolean; status: number; text(): Promise<string>; json(): Promise<any>;
}>;

/** Міркування моделі (<think>…</think>) — не відповідь, і користувачу воно ні до чого */
export function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    // Відкритий і не закритий блок: модель обірвало на ліміті токенів
    .replace(/<think>[\s\S]*$/i, '')
    .trim();
}

export function parseToolArgs(raw: unknown): Record<string, any> {
  if (raw && typeof raw === 'object') return raw as Record<string, any>;
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    // Зламаний JSON — порожні аргументи: інструмент відповість помилкою
    // валідації, і модель виправиться, а не впаде весь запит
    return {};
  }
}

export function toOpenAiMessages(system: string, messages: LlmMessage[]) {
  const out: any[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.text });
    } else if (m.role === 'assistant') {
      if (m.toolCalls?.length) {
        out.push({
          role: 'assistant',
          content: m.text || null,
          tool_calls: m.toolCalls.map(c => ({
            id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
          })),
        });
      } else {
        out.push({ role: 'assistant', content: m.text ?? '' });
      }
    } else {
      out.push({
        role: 'tool', tool_call_id: m.callId, name: m.name,
        content: JSON.stringify(m.result ?? null),
      });
    }
  }
  return out;
}

export function parseOpenAiTurn(data: any): LlmTurn {
  const message = data?.choices?.[0]?.message;
  if (!message) throw new Error('Модель повернула порожню відповідь');
  const toolCalls: ToolCall[] = (message.tool_calls || []).map((c: any, i: number) => ({
    id: String(c.id || `call_${i}`),
    name: String(c.function?.name || ''),
    args: parseToolArgs(c.function?.arguments),
  })).filter((c: ToolCall) => c.name);
  return { text: stripThinking(String(message.content ?? '')), toolCalls };
}

export function createLocalProvider(cfg: LocalLlmConfig, fetchImpl: FetchLike = fetch as any): LlmProvider {
  const base = cfg.baseUrl.replace(/\/+$/, '');

  return {
    name: `local:${cfg.model}`,
    historyLimit: cfg.historyLimit,
    filePageChars: cfg.filePageChars,

    async complete(system, messages, tools) {
      const body: Record<string, unknown> = {
        model: cfg.model,
        messages: toOpenAiMessages(system, messages),
        temperature: cfg.temperature,
        stream: false,
        ...cfg.extraBody,
      };
      if (tools.length) {
        body.tools = tools.map(t => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }));
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
      try {
        const res = await fetchImpl(`${base}/chat/completions`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
            ...cfg.headers,
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const detail = (await res.text().catch(() => '')).slice(0, 300);
          throw new Error(`Локальна модель відповіла ${res.status}${detail ? `: ${detail}` : ''}`);
        }
        return parseOpenAiTurn(await res.json());
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          throw new Error(`Локальна модель не відповіла за ${Math.round(cfg.timeoutMs / 1000)} с`);
        }
        throw e;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

// ── Запасний варіант ──────────────────────────────────────────────────────────

/**
 * Основний провайдер, а якщо він недоступний — запасний. Вмикається свідомо:
 * запасний шлях відправляє дані в хмару, і людина, яка обрала локальну модель
 * заради приватності, має знати, що це можливо.
 */
export function withFallback(
  primary: LlmProvider, secondary: LlmProvider, onFallback?: (err: Error) => void,
): LlmProvider {
  return {
    name: `${primary.name}→${secondary.name}`,
    historyLimit: primary.historyLimit,
    filePageChars: primary.filePageChars,
    async complete(system, messages, tools) {
      try {
        return await primary.complete(system, messages, tools);
      } catch (e: any) {
        onFallback?.(e);
        return secondary.complete(system, messages, tools);
      }
    },
  };
}

// ── Налаштування з середовища ─────────────────────────────────────────────────

export type LlmSetup =
  | { kind: 'gemini' }
  | { kind: 'local'; config: LocalLlmConfig; fallbackToGemini: boolean }
  | { kind: 'error'; message: string };

function parseJsonObject(raw: string | undefined, name: string): Record<string, any> | string {
  if (!raw?.trim()) return {};
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  } catch { /* нижче */ }
  return `${name} має бути JSON-об'єктом`;
}

const num = (raw: string | undefined, fallback: number, min: number) => {
  const n = Number(raw);
  return Number.isFinite(n) && n >= min ? n : fallback;
};

export function readLlmSetup(env: Record<string, string | undefined>): LlmSetup {
  const provider = (env.LLM_PROVIDER || 'gemini').trim().toLowerCase();
  if (provider === 'gemini') return { kind: 'gemini' };
  if (provider !== 'local') return { kind: 'error', message: `LLM_PROVIDER=${provider}: підтримуються gemini та local` };

  if (!env.LLM_BASE_URL?.trim()) return { kind: 'error', message: 'Для LLM_PROVIDER=local потрібен LLM_BASE_URL (напр. http://localhost:11434/v1)' };
  if (!env.LLM_MODEL?.trim()) return { kind: 'error', message: 'Для LLM_PROVIDER=local потрібен LLM_MODEL (напр. qwen3:14b)' };

  const headers = parseJsonObject(env.LLM_EXTRA_HEADERS, 'LLM_EXTRA_HEADERS');
  if (typeof headers === 'string') return { kind: 'error', message: headers };
  const extraBody = parseJsonObject(env.LLM_EXTRA_BODY, 'LLM_EXTRA_BODY');
  if (typeof extraBody === 'string') return { kind: 'error', message: extraBody };

  return {
    kind: 'local',
    fallbackToGemini: /^(1|true|yes)$/i.test(env.LLM_FALLBACK_GEMINI || ''),
    config: {
      baseUrl: env.LLM_BASE_URL.trim(),
      model: env.LLM_MODEL.trim(),
      apiKey: env.LLM_API_KEY?.trim() || undefined,
      headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, String(v)])),
      extraBody,
      timeoutMs: num(env.LLM_TIMEOUT_MS, 180_000, 1000),
      temperature: Math.min(num(env.LLM_TEMPERATURE, 0.2, 0), 2),
      // Контекст локальної моделі невеликий (16–32 тис. токенів), а кирилиця їсть
      // його вдвічі швидше за латиницю — тому і історії, і файлових сторінок менше
      historyLimit: Math.floor(num(env.LLM_HISTORY_MESSAGES, 10, 2)),
      filePageChars: Math.floor(num(env.LLM_FILE_PAGE_CHARS, 6000, 1000)),
    },
  };
}
