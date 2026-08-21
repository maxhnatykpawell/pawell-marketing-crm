/**
 * Шаблони посад: заготовки, з яких збирають зарплату, і міст до документів,
 * створених до модульної системи.
 *
 * Стара форма мала одну зашиту формулу на всіх. Тут вона перетворена на
 * звичайний шаблон — завдяки цьому старі документи рахує той самий рушій,
 * що й нові, і в коді лишається одна реалізація формули замість трьох.
 */

import type {
  PayrollAssignment,
  PayrollModule,
  PayrollSection,
  PayrollTemplate,
} from './payrollEngine';
import { resolveTemplate, suggestKey } from './payrollEngine';
import type { CustomPayrollField, PayrollDocument, PayrollSettings } from '../types';

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

// ── Базова структура ────────────────────────────────────────────────────────

export const SECTION_BASE = 'sec-base';
export const SECTION_INCOME = 'sec-income';
export const SECTION_DEDUCTIONS = 'sec-deductions';

export const BASE_SECTIONS: PayrollSection[] = [
  { id: SECTION_BASE, title: 'Інформація для обчислення', order: 0, tone: 'neutral' },
  { id: SECTION_INCOME, title: 'Нарахування коштів, прихід', order: 1, tone: 'income' },
  { id: SECTION_DEDUCTIONS, title: 'Відрахування', order: 2, tone: 'deduction' },
];

/** Підписи стандартних рядків — беруться зі старих налаштувань, якщо їх міняли */
const DEFAULT_LABELS = {
  baseSalary: 'Ставка',
  workingDaysInMonth: 'Кількість робочих днів в місяці',
  salaryPerDay: 'Оклад за 1 день',
  salaryPerHour: 'Оклад за 1 годину',
  workedDays: 'Відпрацьованих днів',
  paidVacationDays: 'Днів у оплачуваній відпустці',
  overtimeHours: 'Кількість понаднормових годин',
  businessTripDays: 'Кількість днів у відрядженні',
  teamBonus: 'Командний бонус',
  additionalActivity: 'Додаткова діяльність',
  sum: 'Сума',
  tax: 'Податок',
  amountReceived: 'Сума яка прийшла на карту',
  companyDebts: 'Будь які види боргів перед компанією',
  balance: 'Баланс',
};

type Labels = typeof DEFAULT_LABELS;

/**
 * Модулі, що відтворюють стару зашиту формулу.
 *
 * Порядок і `id` навмисно сталі: за ними міграція знаходить куди покласти
 * значення зі старих документів.
 */
export function baseModules(labels: Partial<Labels> = {}): PayrollModule[] {
  const L = { ...DEFAULT_LABELS, ...labels };
  return [
    {
      id: 'mod-base-salary', key: 'baseSalary', label: L.baseSalary,
      kind: 'input', role: 'info', sectionId: SECTION_BASE, order: 0, unit: '₴',
    },
    {
      id: 'mod-working-days', key: 'workingDays', label: L.workingDaysInMonth,
      kind: 'input', role: 'info', sectionId: SECTION_BASE, order: 1, unit: 'днів', defaultValue: 21,
    },
    {
      id: 'mod-salary-per-day', key: 'salaryPerDay', label: L.salaryPerDay,
      kind: 'formula', role: 'info', sectionId: SECTION_BASE, order: 2,
      formula: 'baseSalary / workingDays',
    },
    {
      id: 'mod-salary-per-hour', key: 'salaryPerHour', label: L.salaryPerHour,
      kind: 'formula', role: 'info', sectionId: SECTION_BASE, order: 3,
      formula: 'salaryPerDay / 8',
    },
    {
      id: 'mod-worked-days', key: 'workedDays', label: L.workedDays,
      kind: 'rate', role: 'income', sectionId: SECTION_INCOME, order: 10,
      rateSource: 'salaryPerDay', unit: 'день',
    },
    {
      id: 'mod-vacation-days', key: 'vacationDays', label: L.paidVacationDays,
      kind: 'input', role: 'info', sectionId: SECTION_INCOME, order: 11, unit: 'днів',
    },
    {
      id: 'mod-overtime-hours', key: 'overtimeHours', label: L.overtimeHours,
      kind: 'input', role: 'info', sectionId: SECTION_INCOME, order: 12, unit: 'год',
    },
    {
      id: 'mod-trip-days', key: 'tripDays', label: L.businessTripDays,
      kind: 'input', role: 'info', sectionId: SECTION_INCOME, order: 13, unit: 'днів',
    },
    {
      id: 'mod-team-bonus', key: 'teamBonus', label: L.teamBonus,
      kind: 'percent', role: 'income', sectionId: SECTION_INCOME, order: 14,
      base: 'workedDays',
    },
    {
      id: 'mod-additional', key: 'additionalActivity', label: L.additionalActivity,
      kind: 'input', role: 'income', sectionId: SECTION_INCOME, order: 15, unit: '₴',
    },
    {
      id: 'mod-tax', key: 'tax', label: L.tax,
      kind: 'percent', role: 'deduction', sectionId: SECTION_DEDUCTIONS, order: 20,
      base: 'INCOME',
    },
    {
      id: 'mod-received', key: 'amountReceived', label: L.amountReceived,
      kind: 'input', role: 'deduction', sectionId: SECTION_DEDUCTIONS, order: 21, unit: '₴',
    },
    {
      id: 'mod-debts', key: 'companyDebts', label: L.companyDebts,
      kind: 'input', role: 'deduction', sectionId: SECTION_DEDUCTIONS, order: 22, unit: '₴',
    },
  ];
}

function makeTemplate(name: string, modules: PayrollModule[], description?: string): PayrollTemplate {
  return {
    id: newId(),
    name,
    description,
    sections: BASE_SECTIONS.map((s) => ({ ...s })),
    modules,
    updatedAt: new Date().toISOString(),
  };
}

// ── Заготовки ───────────────────────────────────────────────────────────────

export interface PayrollPreset {
  id: string;
  name: string;
  description: string;
  build: () => PayrollTemplate;
}

export const PAYROLL_PRESETS: PayrollPreset[] = [
  {
    id: 'blank',
    name: 'Порожній шаблон',
    description: 'Три секції без модулів — збираєте посаду з нуля.',
    build: () => makeTemplate('Нова посада', []),
  },
  {
    id: 'base',
    name: 'Оклад за відпрацьовані дні',
    description: 'Стандартна схема: ставка, робочі дні, командний бонус, податок і борги.',
    build: () => makeTemplate('Оклад за дні', baseModules()),
  },
  {
    id: 'kpi',
    name: 'Оклад + КПІ (приклад)',
    description: 'Базова схема плюс ставка за ліди, тарифна сітка за план і бонус формулою.',
    build: () =>
      makeTemplate('Посада з КПІ', [
        ...baseModules(),
        {
          id: newId(), key: 'leads', label: 'Бонус за ліди',
          kind: 'rate', role: 'income', sectionId: SECTION_INCOME, order: 16,
          rate: 150, unit: 'лід',
        },
        {
          id: newId(), key: 'planPercent', label: 'Виконання плану',
          kind: 'input', role: 'info', sectionId: SECTION_INCOME, order: 17, unit: '%',
        },
        {
          id: newId(), key: 'planBonus', label: 'Бонус за план',
          kind: 'tiers', role: 'income', sectionId: SECTION_INCOME, order: 18,
          source: 'planPercent',
          tiers: [
            { from: 80, amount: 2000 },
            { from: 100, amount: 5000 },
            { from: 120, amount: 8000 },
          ],
        },
        {
          id: newId(), key: 'kpiShare', label: 'Надбавка 15% від КПІ',
          kind: 'formula', role: 'income', sectionId: SECTION_INCOME, order: 19,
          formula: '(leads + planBonus) * 0.15',
        },
      ]),
  },
];

// ── Спадщина ────────────────────────────────────────────────────────────────

/** Легасі-поля документа в тому порядку, в якому вони лягають на базові модулі */
const LEGACY_VALUE_MAP: Array<[keyof PayrollDocument, string]> = [
  ['baseSalary', 'baseSalary'],
  ['workingDaysInMonth', 'workingDays'],
  ['workedDays', 'workedDays'],
  ['paidVacationDays', 'vacationDays'],
  ['overtimeHours', 'overtimeHours'],
  ['businessTripDays', 'tripDays'],
  ['teamBonusPercent', 'teamBonus'],
  ['additionalActivity', 'additionalActivity'],
  ['taxPercent', 'tax'],
  ['amountReceived', 'amountReceived'],
  ['companyDebts', 'companyDebts'],
];

/** Старе кастомне поле → модуль. Три легасі-типи лягають на `input` і `rate`. */
function legacyFieldToModule(
  field: CustomPayrollField,
  role: 'income' | 'deduction',
  order: number,
  taken: Set<string>
): PayrollModule {
  const key = suggestKey(field.label || 'field', taken);
  taken.add(key);
  const sectionId = role === 'income' ? SECTION_INCOME : SECTION_DEDUCTIONS;
  const type = field.type || 'fixed';

  if (type === 'multiplier') {
    return {
      id: field.id, key, label: field.label, kind: 'rate', role, sectionId, order,
      rate: field.multiplierRate || 0, unit: field.multiplierUnit || 'шт',
    };
  }
  if (type === 'percentage') {
    // Старий «відсоток» рахувався від введеної суми: це та сама ставка,
    // тільки за одну гривню — percentRate / 100.
    return {
      id: field.id, key, label: field.label, kind: 'rate', role, sectionId, order,
      rate: (field.percentRate || 0) / 100, unit: '₴',
    };
  }
  return { id: field.id, key, label: field.label, kind: 'input', role, sectionId, order, unit: '₴' };
}

/** Кастомні поля людини зі старих налаштувань (профіль перекриває глобальні) */
function legacyCustomFields(settings: PayrollSettings, userId: string) {
  const profile = settings.userProfiles?.[userId];
  return {
    bonuses: profile?.customBonuses?.length ? profile.customBonuses : settings.customBonuses || [],
    deductions: profile?.customDeductions?.length
      ? profile.customDeductions
      : settings.customDeductions || [],
  };
}

/**
 * Збирає шаблон, еквівалентний старій зашитій формулі для конкретної людини.
 * Використовується і для читання старих документів, і як стартова точка,
 * коли шаблонів ще не завели.
 */
export function legacyTemplate(settings: PayrollSettings, userId: string): PayrollTemplate {
  const modules = baseModules(settings.labels);
  const taken = new Set(modules.map((m) => m.key));
  const { bonuses, deductions } = legacyCustomFields(settings, userId);

  bonuses.forEach((f, i) => modules.push(legacyFieldToModule(f, 'income', 16 + i, taken)));
  deductions.forEach((f, i) => modules.push(legacyFieldToModule(f, 'deduction', 30 + i, taken)));

  return {
    id: `legacy-${userId || 'default'}`,
    name: 'Стара схема',
    description: 'Документи, створені до модульних шаблонів',
    sections: BASE_SECTIONS.map((s) => ({ ...s })),
    modules,
    updatedAt: undefined,
  };
}

/** Значення старого документа, перекладені на ключі модулів */
export function legacyValues(doc: PayrollDocument, template: PayrollTemplate): Record<string, number> {
  const values: Record<string, number> = {};
  for (const [docField, key] of LEGACY_VALUE_MAP) {
    const v = Number(doc[docField]);
    if (Number.isFinite(v)) values[key] = v;
  }
  // Кастомні поля зберігались за id — модулі з них мають той самий id
  const byId = new Map(template.modules.map((m) => [m.id, m]));
  const custom = { ...(doc.customBonusesValues || {}), ...(doc.customDeductionsValues || {}) };
  for (const [fieldId, value] of Object.entries(custom)) {
    const m = byId.get(fieldId);
    const v = Number(value);
    if (m && Number.isFinite(v)) values[m.key] = v;
  }
  return values;
}

// ── Доступ із компонентів ───────────────────────────────────────────────────

export function getTemplates(settings: PayrollSettings | undefined): PayrollTemplate[] {
  return (settings?.templates || []).filter((t) => !t.archived);
}

export function getAssignment(
  settings: PayrollSettings | undefined,
  userId: string
): PayrollAssignment | undefined {
  return settings?.assignments?.[userId];
}

/**
 * Ефективний шаблон людини: призначена посада плюс індивідуальні правки.
 * Якщо посаду ще не призначили — стара схема, щоб форма не була порожньою.
 */
export function templateForUser(
  settings: PayrollSettings,
  userId: string
): { template: PayrollTemplate; isLegacy: boolean } {
  const assignment = getAssignment(settings, userId);
  const assigned = assignment && (settings.templates || []).find((t) => t.id === assignment.templateId);
  if (assigned) {
    return { template: resolveTemplate(assigned, assignment) as PayrollTemplate, isLegacy: false };
  }
  return { template: legacyTemplate(settings, userId), isLegacy: true };
}

/**
 * Шаблон і значення, за якими треба показувати конкретний документ.
 *
 * Документ рахується за власним знімком: зміна шаблону не переписує вже
 * виплачені місяці. Старі документи отримують знімок на льоту.
 */
export function documentView(
  doc: PayrollDocument,
  settings: PayrollSettings
): { template: PayrollTemplate; values: Record<string, number> } {
  if (doc.templateSnapshot) {
    return { template: doc.templateSnapshot, values: doc.values || {} };
  }
  const template = legacyTemplate(settings, doc.userId);
  return { template, values: legacyValues(doc, template) };
}
