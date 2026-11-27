import React, { useMemo, useState } from 'react';
import {
  Plus, Trash2, ChevronDown, ChevronRight, ArrowUp, ArrowDown, Copy,
  AlertTriangle, Layers, FlaskConical, Pencil,
} from 'lucide-react';
import {
  FORMULA_FUNCTIONS,
  PayrollModule,
  PayrollModuleKind,
  PayrollModuleRole,
  PayrollSection,
  PayrollTemplate,
  describeModule,
  evaluateModules,
  hasOwnInput,
  isValidKey,
  parseFormula,
  formulaToSteps,
  suggestKey,
  tierAmount,
} from '../../lib/payrollEngine';
import { PAYROLL_PRESETS, SECTION_DEDUCTIONS, SECTION_INCOME, newId } from '../../lib/payrollTemplates';
import FormulaBuilder from './FormulaBuilder';

const ROLE_LABELS: Record<PayrollModuleRole, string> = {
  income: 'Нарахування',
  deduction: 'Відрахування',
  info: 'Довідково',
};

const ROLE_BADGE: Record<PayrollModuleRole, string> = {
  income: 'bg-green-50 text-green-700 border-green-200',
  deduction: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-gray-100 text-gray-600 border-gray-200',
};

const inputCls =
  'px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50';

const money = (v: number) => Math.round(v).toLocaleString('uk-UA');

/**
 * Перейменування ключа в посиланнях інших модулів.
 *
 * Без цього перейменування ключа тихо зламало б кожну формулу, що на нього
 * посилалась, і помилка спливла б аж у зарплатному документі.
 */
function renameKeyRefs(modules: PayrollModule[], from: string, to: string): PayrollModule[] {
  if (!from || !to || from === to) return modules;
  // Ключ друкують уручну, тож у ньому може бути будь-що — екрануємо, перш ніж
  // ставити в регулярний вираз
  const safe = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^A-Za-z0-9_.])${safe}(?![A-Za-z0-9_])`, 'g');
  return modules.map((m) => {
    const next = { ...m };
    if (next.formula) next.formula = next.formula.replace(re, (_, p) => `${p}${to}`);
    if (next.source === from) next.source = to;
    if (next.base === from) next.base = to;
    if (next.rateSource === from) next.rateSource = to;
    return next;
  });
}

// ── Дрібні будівельні блоки форми ───────────────────────────────────────────

const Field: React.FC<{ label: string; hint?: string; className?: string; children: React.ReactNode }> = ({
  label, hint, className = '', children,
}) => (
  <label className={`space-y-1 block ${className}`}>
    <span className="text-xs font-medium text-gray-600">{label}</span>
    {children}
    {hint && <span className="text-xs text-gray-400 block">{hint}</span>}
  </label>
);

/** Перемикач з кількох варіантів: видно всі одразу, на відміну від випадного списку */
function Segmented<T extends string>({
  value, options, onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex p-0.5 bg-gray-100 rounded-lg gap-0.5 flex-wrap">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            o.value === value ? 'bg-white text-blue-700 font-medium shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Зрозумілі назви типів + приклад: людина обирає за змістом, а не за терміном */
const KIND_CARDS: Array<{ kind: PayrollModuleKind; title: string; example: string }> = [
  { kind: 'input', title: 'Число', example: 'Дні, ліди, разова сума' },
  { kind: 'constant', title: 'Фіксована сума', example: 'Оклад 12 000 ₴' },
  { kind: 'rate', title: 'Ставка × кількість', example: '150 ₴ за кожен лід' },
  { kind: 'percent', title: 'Відсоток', example: '19% від нарахувань' },
  { kind: 'tiers', title: 'Бонус за рівнем', example: 'Від 100% плану — 5000 ₴' },
  { kind: 'formula', title: 'Формула', example: 'Власний розрахунок' },
];

const ROLE_OPTIONS: Array<{ value: PayrollModuleRole; label: string }> = [
  { value: 'income', label: 'Додається до виплати' },
  { value: 'deduction', label: 'Віднімається' },
  { value: 'info', label: 'Лише для розрахунків' },
];

/** Панель з налаштуваннями обраного типу */
const Panel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">{children}</div>
);

// ── Редактор одного модуля ──────────────────────────────────────────────────

export interface ModuleEditorProps {
  module: PayrollModule;
  siblings: PayrollModule[];
  sections: PayrollSection[];
  onChange: (patch: Partial<PayrollModule>) => void;
  onRenameKey: (key: string) => void;
}

export const ModuleEditor: React.FC<ModuleEditorProps> = ({ module: m, siblings, sections, onChange, onRenameKey }) => {
  const others = siblings.filter((s) => s.id !== m.id);
  const keyTaken = others.some((s) => s.key === m.key);
  const keyBad = !isValidKey(m.key);
  const formulaError = m.kind === 'formula' && m.formula ? parseFormula(m.formula).error : undefined;

  /** Кроки поточної формули; null — виражається лише текстом */
  const steps = m.kind === 'formula' ? formulaToSteps(m.formula || '') : null;
  const [textMode, setTextMode] = useState(false);
  // Конструктор показуємо, коли формула ним виражається і людина не пішла в текст
  const builderMode = !!steps && !textMode;

  // «Додатково» згорнуте, доки там усе гаразд: ключ, секція й роль у більшості
  // випадків виставляються самі. Помилка в ключі розгортає блок сама.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const showAdvanced = advancedOpen || keyBad || keyTaken;
  const [probe, setProbe] = useState<number | ''>('');

  const sectionTitle = sections.find((s) => s.id === m.sectionId)?.title || '—';
  const roleLabel = ROLE_OPTIONS.find((r) => r.value === m.role)?.label || '';

  const refOptions = (extra: Array<[string, string]> = []) => (
    <>
      {extra.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
      {others.map((s) => (
        <option key={s.id} value={s.key}>{s.label}</option>
      ))}
    </>
  );

  const selectCls = `${inputCls} bg-white w-full`;

  return (
    <div className="p-4 bg-gray-50 border-t border-gray-200 space-y-5">
      {/* 1. Як називається */}
      <Field label="Назва в документі">
        <input
          className={`${inputCls} w-full text-base`}
          value={m.label}
          placeholder="Наприклад: Кількість переглядів"
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>

      {/* 2. Що це за розрахунок */}
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-gray-600">Як рахується</span>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {KIND_CARDS.map((c) => {
            const active = c.kind === m.kind;
            return (
              <button
                key={c.kind}
                type="button"
                onClick={() => onChange({ kind: c.kind })}
                className={`text-left px-3 py-2 rounded-xl border transition-colors ${
                  active
                    ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400'
                    : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span className={`block text-sm font-medium ${active ? 'text-blue-700' : 'text-gray-800'}`}>
                  {c.title}
                </span>
                <span className="block text-xs text-gray-500 truncate">{c.example}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Налаштування обраного типу */}
      <Panel>
        {m.kind === 'input' && (
          <p className="text-sm text-gray-600">
            У документі з'явиться поле, куди вписують число. Саме воно нічого не нараховує, але
            його можна використати в інших модулях.
          </p>
        )}

        {m.kind === 'constant' && (
          <Field label="Сума в кожному документі, ₴" className="max-w-xs">
            <input
              type="number"
              className={`${inputCls} w-full`}
              value={m.value ?? ''}
              onChange={(e) => onChange({ value: Number(e.target.value) })}
            />
          </Field>
        )}

        {m.kind === 'rate' && (
          <>
            <div className="flex items-end gap-2 flex-wrap">
              <Field label={m.rateSource === undefined ? 'Платити, ₴' : 'Ставка береться з'} className="w-40">
                {m.rateSource === undefined ? (
                  <input
                    type="number"
                    step="any"
                    className={`${inputCls} w-full`}
                    value={m.rate ?? ''}
                    onChange={(e) => onChange({ rate: Number(e.target.value) })}
                  />
                ) : (
                  <select
                    className={selectCls}
                    value={m.rateSource}
                    onChange={(e) => onChange({ rateSource: e.target.value })}
                  >
                    <option value="">— оберіть —</option>
                    {refOptions()}
                  </select>
                )}
              </Field>
              <span className="pb-2 text-sm text-gray-500">за кожну одиницю</span>
              <button
                type="button"
                className="pb-2 text-xs text-blue-600 hover:underline"
                onClick={() =>
                  onChange(m.rateSource === undefined ? { rateSource: others[0]?.key || '' } : { rateSource: undefined })
                }
              >
                {m.rateSource === undefined ? 'ставка з іншого модуля' : 'ввести число'}
              </button>
            </div>
            <Field label="Скільки одиниць">
              <select
                className={`${selectCls} md:w-80`}
                value={m.source || ''}
                onChange={(e) => onChange({ source: e.target.value || undefined })}
              >
                {refOptions([['', 'Вписують у документі']])}
              </select>
            </Field>
          </>
        )}

        {m.kind === 'percent' && (
          <>
            <Field label="Від чого рахувати" className="md:w-80">
              <select
                className={selectCls}
                value={m.base || ''}
                onChange={(e) => onChange({ base: e.target.value })}
              >
                {refOptions([
                  ['', '— оберіть —'],
                  ['INCOME', 'Усі нарахування'],
                  ['DEDUCTIONS', 'Усі відрахування'],
                ])}
              </select>
            </Field>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-gray-600">Відсоток</span>
              <div className="flex items-center gap-3 flex-wrap">
                <Segmented
                  value={m.fixedPercent ? 'fixed' : 'input'}
                  onChange={(v) => onChange({ fixedPercent: v === 'fixed' })}
                  options={[
                    { value: 'fixed', label: 'Один і той самий' },
                    { value: 'input', label: 'Вписують щомісяця' },
                  ]}
                />
                {m.fixedPercent && (
                  <span className="inline-flex items-center gap-1.5">
                    <input
                      type="number"
                      step="any"
                      className={`${inputCls} w-24`}
                      value={m.percent ?? ''}
                      onChange={(e) => onChange({ percent: Number(e.target.value) })}
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </span>
                )}
              </div>
            </div>
          </>
        )}

        {m.kind === 'tiers' && (
          <>
            <Field label="Що порівнювати з порогами" className="md:w-80">
              <select
                className={selectCls}
                value={m.source || ''}
                onChange={(e) => onChange({ source: e.target.value || undefined })}
              >
                {refOptions([['', 'Число, яке вписують у документі']])}
              </select>
            </Field>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-gray-600">Як рахувати між порогами</span>
              <div>
                <Segmented
                  value={m.interpolateTiers ? 'smooth' : 'step'}
                  onChange={(v) => onChange({ interpolateTiers: v === 'smooth' ? true : undefined })}
                  options={[
                    { value: 'step', label: 'Ступенями' },
                    { value: 'smooth', label: 'Плавно' },
                  ]}
                />
              </div>
              <p className="text-xs text-gray-400">
                {m.interpolateTiers
                  ? 'Сума росте разом із числом: між двома порогами вона пропорційно переходить від нижньої до верхньої. Вище найвищого порога лишається остання сума.'
                  : 'Діє найвищий досягнутий поріг, його сума не змінюється, поки не досягнуто наступного.'}
              </p>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-gray-600 max-w-md">
                <span>Від значення</span>
                <span>Сума, ₴</span>
                <span className="w-7" />
              </div>
              {(m.tiers || []).map((t, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 max-w-md items-center">
                  <input
                    type="number"
                    step="any"
                    className={`${inputCls} w-full`}
                    value={t.from}
                    onChange={(e) => {
                      const tiers = [...(m.tiers || [])];
                      tiers[i] = { ...t, from: Number(e.target.value) };
                      onChange({ tiers });
                    }}
                  />
                  <input
                    type="number"
                    step="any"
                    className={`${inputCls} w-full`}
                    value={t.amount}
                    onChange={(e) => {
                      const tiers = [...(m.tiers || [])];
                      tiers[i] = { ...t, amount: Number(e.target.value) };
                      onChange({ tiers });
                    }}
                  />
                  <button
                    type="button"
                    title="Прибрати поріг"
                    onClick={() => onChange({ tiers: (m.tiers || []).filter((_, j) => j !== i) })}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  // Новий поріг стає вище за найвищий — так не лишається нуля,
                  // який треба спершу виправляти
                  const top = Math.max(0, ...(m.tiers || []).map((t) => Number(t.from) || 0));
                  onChange({ tiers: [...(m.tiers || []), { from: top, amount: 0 }] });
                }}
                className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                <Plus size={14} /> Додати поріг
              </button>
            </div>

            {(m.tiers || []).length > 0 && (
              <div className="flex items-center gap-2 flex-wrap text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <span className="text-gray-500">Перевірити: якщо</span>
                <input
                  type="number"
                  step="any"
                  className={`${inputCls} w-32`}
                  value={probe}
                  placeholder="число"
                  onChange={(e) => setProbe(e.target.value === '' ? '' : Number(e.target.value))}
                />
                <span className="text-gray-500">— буде</span>
                <b className="tabular-nums text-gray-800">
                  {probe === '' ? '—' : `${money(tierAmount(m.tiers, probe, !!m.interpolateTiers))} ₴`}
                </b>
              </div>
            )}
          </>
        )}

        {m.kind === 'formula' && (
          <div className="space-y-2">
            {/*
              Формула без власного поля рахує лише з чужих чисел. Але «понаднормові
              × 1.5» — це один рядок документа, у який вписують години, тож формулі
              треба вміти мати своє число. У самій формулі воно доступне як `ключ.n`.
            */}
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={!!m.hasInput}
                onChange={(e) => onChange({ hasInput: e.target.checked || undefined })}
              />
              <span className="text-sm text-gray-700 leading-snug">
                Додати поле для числа в документі
                <span className="block text-xs text-gray-400">
                  У формулі воно буде як{' '}
                  <code className="px-1 py-0.5 bg-gray-100 rounded font-mono">{m.key || 'ключ'}.n</code>
                  {' '}— у кроках це «Це поле: введене число».
                </span>
              </span>
            </label>

            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-xs font-medium text-gray-600">
                {builderMode ? 'Кроки обчислення' : 'Вираз'}
              </span>
              <button
                type="button"
                onClick={() => setTextMode((v) => !v)}
                // Вираз, який кроками не виражається, лишає кнопку недоступною в
                // обох режимах: інакше в текстовому вона натискалась би, нічого
                // не змінюючи, і читалася б як поламана.
                disabled={!steps}
                title={steps ? undefined : 'Цей вираз кроками не збирається'}
                className="text-xs font-medium text-blue-600 hover:underline disabled:text-gray-300 disabled:no-underline disabled:cursor-not-allowed"
              >
                {builderMode ? 'Ввести текстом' : 'Зібрати кроками'}
              </button>
            </div>

            {builderMode ? (
              /* key — щоб при переході на інший модуль кроки перечитались із його
                 формули, а не лишились від попереднього */
              <FormulaBuilder
                key={m.id}
                initialSteps={steps || []}
                modules={others}
                self={m}
                onChange={(formula) => onChange({ formula })}
              />
            ) : (
              <textarea
                className={`${inputCls} w-full font-mono ${formulaError ? 'border-red-400 bg-red-50' : ''}`}
                rows={2}
                value={m.formula || ''}
                placeholder="(leads + planBonus) * 0.15"
                onChange={(e) => onChange({ formula: e.target.value })}
              />
            )}

            {formulaError && (
              <div className="text-xs text-red-600 flex items-center gap-1">
                <AlertTriangle size={12} /> {formulaError}
              </div>
            )}

            {/* Кажемо прямо, чому конструктор недоступний: мовчазна кнопка,
                яка не натискається, читається як поламана. */}
            {!steps && !formulaError && m.formula && (
              <div className="text-xs text-gray-500">
                Тут умова, функція або власне групування — кроками такий вираз не збирається,
                тож він лишається текстом.
              </div>
            )}

            {/* Довідник потрібен лише тим, хто пише текстом, — решті він заважає */}
            {!builderMode && (
              <details className="text-xs text-gray-500">
                <summary className="cursor-pointer text-blue-600 hover:underline">Що можна писати у виразі</summary>
                <div className="space-y-1 pt-2">
                  <div>
                    <span className="font-medium">Модулі:</span>{' '}
                    {others.length === 0 ? (
                      <span className="text-gray-400">поки жодного</span>
                    ) : (
                      others.map((s) => (
                        <code key={s.id} className="mx-0.5 px-1.5 py-0.5 bg-gray-100 rounded text-gray-700">
                          {s.key}
                        </code>
                      ))
                    )}
                  </div>
                  <div>
                    <span className="font-medium">Підсумки:</span>{' '}
                    {['INCOME', 'DEDUCTIONS', 'BALANCE'].map((v) => (
                      <code key={v} className="mx-0.5 px-1.5 py-0.5 bg-gray-100 rounded text-gray-700">{v}</code>
                    ))}
                  </div>
                  <div>
                    <span className="font-medium">Функції:</span>{' '}
                    {FORMULA_FUNCTIONS.map((f) => (
                      <code key={f} className="mx-0.5 px-1.5 py-0.5 bg-gray-100 rounded text-gray-700">{f}()</code>
                    ))}
                  </div>
                  <div>
                    Умови: <code className="px-1 bg-gray-100 rounded">plan {'>='} 100 ? 5000 : 0</code>.
                    Суфікс <code className="px-1 bg-gray-100 rounded">.n</code> дає введену кількість, а не суму:{' '}
                    <code className="px-1 bg-gray-100 rounded">leads.n</code>
                  </div>
                </div>
              </details>
            )}
          </div>
        )}

        {/*
          Поле, яке заповнюють у документі. Одне місце для всіх типів, що мають
          власне поле, — відсоток виняток, там підпис завжди «%».
        */}
        {hasOwnInput(m) && m.kind !== 'percent' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-gray-100">
            <Field label="Підпис біля поля в документі">
              <input
                className={`${inputCls} w-full`}
                value={m.unit || ''}
                placeholder="год / днів / лідів / ₴"
                onChange={(e) => onChange({ unit: e.target.value })}
              />
            </Field>
            <Field label="Значення за замовчуванням">
              <input
                type="number"
                className={`${inputCls} w-full`}
                value={m.defaultValue ?? ''}
                placeholder="порожньо"
                onChange={(e) =>
                  onChange({ defaultValue: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              />
            </Field>
          </div>
        )}
      </Panel>

      {/* 4. Додатково — те, що рідко чіпають */}
      <div>
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
        >
          {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="font-medium">Додатково</span>
          {!showAdvanced && (
            <span className="text-xs text-gray-400">
              {sectionTitle} · {roleLabel} · <span className="font-mono">{m.key}</span>
            </span>
          )}
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-3 pl-5">
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-gray-600">Що робить із підсумком</span>
              <div>
                <Segmented
                  value={m.role}
                  onChange={(v) => onChange({ role: v })}
                  options={ROLE_OPTIONS}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="В якій секції показувати">
                <select
                  className={selectCls}
                  value={m.sectionId}
                  onChange={(e) => onChange({ sectionId: e.target.value })}
                >
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Ім'я для формул"
                hint={
                  keyBad
                    ? undefined
                    : 'Потрібне, лише коли іншу формулу пишуть текстом. У нового модуля підлаштовується під назву.'
                }
              >
                <input
                  className={`${inputCls} w-full font-mono ${keyBad || keyTaken ? 'border-red-400 bg-red-50' : ''}`}
                  value={m.key}
                  onChange={(e) => onRenameKey(e.target.value)}
                />
                {keyBad && (
                  <span className="text-xs text-red-500 block">
                    Латиниця, цифри й «_», не з цифри. INCOME / DEDUCTIONS / BALANCE зайняті.
                  </span>
                )}
                {keyTaken && !keyBad && <span className="text-xs text-red-500 block">Такий ключ уже є</span>}
              </Field>
            </div>
            <Field label="Підказка під назвою поля (необов'язково)">
              <input
                className={`${inputCls} w-full`}
                placeholder="Дрібний текст у документі, наприклад: «за даними Google Analytics»"
                value={m.hint || ''}
                onChange={(e) => onChange({ hint: e.target.value || undefined })}
              />
            </Field>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Редактор шаблону ────────────────────────────────────────────────────────

interface PayrollTemplateEditorProps {
  templates: PayrollTemplate[];
  onChange: (templates: PayrollTemplate[]) => void;
}

export const PayrollTemplateEditor: React.FC<PayrollTemplateEditorProps> = ({ templates, onChange }) => {
  const [selectedId, setSelectedId] = useState<string>(templates[0]?.id || '');
  const [expandedId, setExpandedId] = useState<string>('');
  // Модулі, створені в цій сесії й ще не перейменовані вручну: їхній ключ
  // підлаштовується під назву. Збережені модулі не чіпаємо — під їхні ключі
  // можуть бути вже заповнені документи.
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [testValues, setTestValues] = useState<Record<string, number>>({});
  const [showTest, setShowTest] = useState(false);

  const template = templates.find((t) => t.id === selectedId) || templates[0];

  const patchTemplate = (patch: Partial<PayrollTemplate>) => {
    if (!template) return;
    onChange(
      templates.map((t) =>
        t.id === template.id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t
      )
    );
  };

  const setModules = (modules: PayrollModule[]) => patchTemplate({ modules });

  const addTemplate = (presetId: string) => {
    const preset = PAYROLL_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const created = preset.build();
    onChange([...templates, created]);
    setSelectedId(created.id);
  };

  const duplicateTemplate = () => {
    if (!template) return;
    const copy: PayrollTemplate = {
      ...template,
      id: newId(),
      name: `${template.name} (копія)`,
      sections: template.sections.map((s) => ({ ...s })),
      // id модулів мають бути новими, інакше індивідуальні правки з іншої
      // посади почали б чіплятися й до копії
      modules: template.modules.map((m) => ({ ...m, id: newId() })),
      updatedAt: new Date().toISOString(),
    };
    onChange([...templates, copy]);
    setSelectedId(copy.id);
  };

  const removeTemplate = () => {
    if (!template) return;
    const rest = templates.filter((t) => t.id !== template.id);
    onChange(rest);
    setSelectedId(rest[0]?.id || '');
  };

  const addModule = (sectionId: string) => {
    if (!template) return;
    const label = 'Новий модуль';
    const key = suggestKey(label, template.modules.map((m) => m.key));
    const order = Math.max(0, ...template.modules.map((m) => m.order + 1), 0);
    const role: PayrollModuleRole =
      sectionId === SECTION_DEDUCTIONS ? 'deduction' : sectionId === SECTION_INCOME ? 'income' : 'info';
    const created: PayrollModule = { id: newId(), key, label, kind: 'input', role, sectionId, order };
    setModules([...template.modules, created]);
    setFreshIds((prev) => new Set(prev).add(created.id));
    setExpandedId(created.id);
  };

  const patchModule = (id: string, patch: Partial<PayrollModule>) => {
    if (!template) return;
    const current = template.modules.find((m) => m.id === id);
    if (current && patch.label !== undefined && freshIds.has(id) && patch.label.trim()) {
      const taken = template.modules.filter((m) => m.id !== id).map((m) => m.key);
      const key = suggestKey(patch.label, taken);
      const renamed = renameKeyRefs(template.modules, current.key, key);
      setModules(renamed.map((m) => (m.id === id ? { ...m, ...patch, key } : m)));
      return;
    }
    setModules(template.modules.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const renameModuleKey = (id: string, nextKey: string) => {
    if (!template) return;
    const current = template.modules.find((m) => m.id === id);
    if (!current) return;
    // Ключ уже правили вручну — далі він більше не слідує за назвою
    if (freshIds.has(id)) {
      setFreshIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
    const renamed = renameKeyRefs(template.modules, current.key, nextKey);
    setModules(renamed.map((m) => (m.id === id ? { ...m, key: nextKey } : m)));
  };

  const removeModule = (id: string) => {
    if (!template) return;
    setModules(template.modules.filter((m) => m.id !== id));
  };

  /** Пересунути модуль у межах своєї секції */
  const moveModule = (id: string, dir: -1 | 1) => {
    if (!template) return;
    const target = template.modules.find((m) => m.id === id);
    if (!target) return;
    const inSection = template.modules
      .filter((m) => m.sectionId === target.sectionId)
      .sort((a, b) => a.order - b.order);
    const i = inSection.findIndex((m) => m.id === id);
    const j = i + dir;
    if (j < 0 || j >= inSection.length) return;
    const a = inSection[i];
    const b = inSection[j];
    setModules(
      template.modules.map((m) =>
        m.id === a.id ? { ...m, order: b.order } : m.id === b.id ? { ...m, order: a.order } : m
      )
    );
  };

  const addSection = () => {
    if (!template) return;
    const order = Math.max(0, ...template.sections.map((s) => s.order + 1), 0);
    patchTemplate({
      sections: [...template.sections, { id: newId(), title: 'Нова секція', order, tone: 'neutral' }],
    });
  };

  const removeSection = (sectionId: string) => {
    if (!template || template.sections.length <= 1) return;
    const fallback = template.sections.find((s) => s.id !== sectionId)!;
    patchTemplate({
      sections: template.sections.filter((s) => s.id !== sectionId),
      // Модулі не видаляємо разом із секцією — переносимо, щоб не втратити налаштовані КПІ
      modules: template.modules.map((m) => (m.sectionId === sectionId ? { ...m, sectionId: fallback.id } : m)),
    });
  };

  const preview = useMemo(
    () => evaluateModules(template?.modules || [], testValues),
    [template, testValues]
  );

  const sortedSections = useMemo(
    () => [...(template?.sections || [])].sort((a, b) => a.order - b.order),
    [template]
  );

  if (templates.length === 0) {
    return (
      <div className="py-12 flex flex-col items-center text-center gap-4">
        <Layers size={40} className="text-gray-300" />
        <div>
          <p className="font-medium text-gray-700">Ще немає жодного шаблону посади</p>
          <p className="text-sm text-gray-500 mt-1">
            Почніть із заготовки — потім модулі можна додавати, множити й міняти як завгодно.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {PAYROLL_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => addTemplate(p.id)}
              title={p.description}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-6 items-start">
      {/* Список посад */}
      <div className="w-56 shrink-0 space-y-3">
        <div className="space-y-1">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
                t.id === template?.id
                  ? 'bg-blue-50 text-blue-700 font-medium border border-blue-200'
                  : 'text-gray-700 hover:bg-gray-100 border border-transparent'
              }`}
            >
              <span className="block truncate">{t.name}</span>
              <span className="block text-xs text-gray-400">{t.modules.length} модулів</span>
            </button>
          ))}
        </div>
        <div className="space-y-1 pt-2 border-t">
          <span className="text-xs font-medium text-gray-500 px-1">Додати посаду</span>
          {PAYROLL_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => addTemplate(p.id)}
              title={p.description}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg text-left"
            >
              <Plus size={14} className="shrink-0" />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Деталі посади */}
      {template && (
        <div className="flex-1 min-w-0 space-y-4">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px] space-y-2">
              <input
                className={`${inputCls} w-full text-lg font-semibold`}
                value={template.name}
                onChange={(e) => patchTemplate({ name: e.target.value })}
              />
              <input
                className={`${inputCls} w-full`}
                placeholder="Опис посади (необов'язково)"
                value={template.description || ''}
                onChange={(e) => patchTemplate({ description: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowTest((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition-colors ${
                  showTest
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <FlaskConical size={16} /> Перевірка
              </button>
              <button
                onClick={duplicateTemplate}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-xl text-sm hover:bg-gray-50"
              >
                <Copy size={16} /> Копія
              </button>
              <button
                onClick={removeTemplate}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 text-red-600 rounded-xl text-sm hover:bg-red-50"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          {showTest && (
            <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl space-y-3">
              <p className="text-xs text-gray-600">
                Підставте пробні числа — суми модулів нижче перерахуються. Це не зачіпає реальні документи.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {template.modules.filter(hasOwnInput).map((m) => (
                  <label key={m.id} className="space-y-1">
                    <span className="text-xs text-gray-500 block truncate" title={m.label}>{m.label}</span>
                    <input
                      type="number"
                      step="any"
                      className={`${inputCls} w-full`}
                      value={testValues[m.key] ?? ''}
                      onChange={(e) =>
                        setTestValues({ ...testValues, [m.key]: Number(e.target.value) })
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-4 text-sm pt-2 border-t border-blue-200">
                <span>Нараховано: <b>{money(preview.income)} ₴</b></span>
                <span>Відрахування: <b>{money(preview.deductions)} ₴</b></span>
                <span>Баланс: <b>{money(preview.balance)} ₴</b></span>
              </div>
            </div>
          )}

          {preview.issues.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-1">
              {preview.issues.map((i, idx) => (
                <div key={idx} className="text-sm text-red-700 flex items-center gap-2">
                  <AlertTriangle size={14} className="shrink-0" /> {i.message}
                </div>
              ))}
            </div>
          )}

          {/* Секції з модулями */}
          <div className="space-y-4">
            {sortedSections.map((section) => {
              const modules = template.modules
                .filter((m) => m.sectionId === section.id)
                .sort((a, b) => a.order - b.order);
              return (
                <div key={section.id} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                    <Pencil size={13} className="text-gray-400 shrink-0" />
                    <input
                      className="flex-1 bg-transparent font-medium text-gray-800 focus:outline-none min-w-0"
                      value={section.title}
                      onChange={(e) =>
                        patchTemplate({
                          sections: template.sections.map((s) =>
                            s.id === section.id ? { ...s, title: e.target.value } : s
                          ),
                        })
                      }
                    />
                    <select
                      className="text-xs px-2 py-1 border border-gray-300 rounded-lg bg-white text-gray-600"
                      value={section.tone || 'neutral'}
                      onChange={(e) =>
                        patchTemplate({
                          sections: template.sections.map((s) =>
                            s.id === section.id ? { ...s, tone: e.target.value as PayrollSection['tone'] } : s
                          ),
                        })
                      }
                    >
                      <option value="neutral">Нейтральна</option>
                      <option value="income">Прихід</option>
                      <option value="deduction">Відрахування</option>
                    </select>
                    {template.sections.length > 1 && (
                      <button
                        onClick={() => removeSection(section.id)}
                        title="Видалити секцію (модулі перенесуться)"
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  <div className="divide-y divide-gray-100">
                    {modules.map((m) => {
                      const expanded = expandedId === m.id;
                      const amount = preview.amounts[m.key] || 0;
                      return (
                        <div key={m.id}>
                          <div
                            className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer ${
                              expanded ? 'bg-blue-50/40' : 'hover:bg-gray-50/50'
                            }`}
                            onClick={() => setExpandedId(expanded ? '' : m.id)}
                          >
                            <span className="p-1 text-gray-400 shrink-0">
                              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-gray-800 truncate">{m.label}</span>
                                <code className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                                  {m.key}
                                </code>
                                <span
                                  className={`text-xs px-1.5 py-0.5 rounded-full border ${ROLE_BADGE[m.role]}`}
                                >
                                  {ROLE_LABELS[m.role]}
                                </span>
                              </div>
                              <span className="text-xs text-gray-400 block truncate">
                                {describeModule(m, new Map(template.modules.map((x) => [x.key, x])))}
                              </span>
                            </div>
                            {showTest && (
                              <span className="text-sm text-gray-500 tabular-nums shrink-0">{money(amount)} ₴</span>
                            )}
                            <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => moveModule(m.id, -1)}
                                className="p-1 text-gray-300 hover:text-gray-600"
                                title="Вище"
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                onClick={() => moveModule(m.id, 1)}
                                className="p-1 text-gray-300 hover:text-gray-600"
                                title="Нижче"
                              >
                                <ArrowDown size={14} />
                              </button>
                              <button
                                onClick={() => removeModule(m.id)}
                                className="p-1 text-gray-300 hover:text-red-500"
                                title="Видалити модуль"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          {expanded && (
                            <ModuleEditor
                              module={m}
                              siblings={template.modules}
                              sections={sortedSections}
                              onChange={(patch) => patchModule(m.id, patch)}
                              onRenameKey={(key) => renameModuleKey(m.id, key)}
                            />
                          )}
                        </div>
                      );
                    })}
                    <button
                      onClick={() => addModule(section.id)}
                      className="w-full flex items-center gap-1.5 px-4 py-2.5 text-sm text-blue-600 hover:bg-blue-50/50 font-medium"
                    >
                      <Plus size={14} /> Додати модуль
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={addSection}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-dashed border-gray-300 rounded-xl hover:bg-gray-50 w-full justify-center"
          >
            <Plus size={14} /> Додати секцію
          </button>
        </div>
      )}
    </div>
  );
};


