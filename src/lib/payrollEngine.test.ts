import {
  PayrollModule,
  evaluateModules,
  formulaVars,
  hasOwnInput,
  isValidKey,
  parseFormula,
  resolveModules,
  suggestKey,
  tierAmount,
} from './payrollEngine';
import { baseModules, legacyTemplate, legacyValues } from './payrollTemplates';
import type { CustomPayrollField, PayrollDocument, PayrollSettings } from '../types';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${name}`);
  } else {
    console.log(`  ✗ ${name}\n      очікувалось: ${e}\n      отримано:    ${a}`);
    failures++;
  }
}

/** Коротко зібрати модуль, щоб тести читались як таблиця */
let order = 0;
function mod(m: Partial<PayrollModule> & { key: string; kind: PayrollModule['kind'] }): PayrollModule {
  return {
    id: m.id || m.key,
    label: m.label || m.key,
    role: m.role || 'info',
    sectionId: m.sectionId || 'sec',
    order: m.order ?? order++,
    ...m,
  } as PayrollModule;
}

const evalOne = (m: PayrollModule[], values: Record<string, number> = {}) => evaluateModules(m, values);

// ── Формули ─────────────────────────────────────────────────────────────────

console.log('\nформульна мова');

function calc(formula: string, values: Record<string, number> = {}): number {
  const modules = [
    ...Object.keys(values).map((k) => mod({ key: k, kind: 'input' })),
    mod({ key: 'result', kind: 'formula', formula }),
  ];
  return evalOne(modules, values).amounts.result;
}

check('додавання й множення за пріоритетом', calc('2 + 3 * 4'), 14);
check('дужки міняють пріоритет', calc('(2 + 3) * 4'), 20);
check('віднімання зліва направо', calc('10 - 3 - 2'), 5);
check('ділення зліва направо', calc('100 / 5 / 2'), 10);
check('унарний мінус', calc('-5 + 8'), 3);
check('десяткові числа', calc('0.5 * 3'), 1.5);
check('змінні', calc('a * b', { a: 3, b: 7 }), 21);
check('порівняння дає 1/0', calc('a > b', { a: 5, b: 2 }), 1);
check('«>=» не розпадається на «>»', calc('a >= 100', { a: 100 }), 1);
check('тернарний оператор', calc('a >= 100 ? 5000 : 2000', { a: 120 }), 5000);
check('вкладені тернарні', calc('a >= 100 ? 3 : a >= 80 ? 2 : 1', { a: 85 }), 2);
check('логічне І', calc('a > 0 && b > 0', { a: 1, b: 0 }), 0);
check('логічне АБО', calc('a > 0 || b > 0', { a: 0, b: 3 }), 1);
check('заперечення', calc('!a', { a: 0 }), 1);
check('min / max', calc('max(min(a, 100), 10)', { a: 250 }), 100);
check('if()', calc('if(a > 10, 100, 50)', { a: 11 }), 100);
check('round', calc('round(a / 3)', { a: 10 }), 3);
check('clamp', calc('clamp(a, 0, 50)', { a: 90 }), 50);
// Оклад за день при нулі робочих днів — це порожня клітинка, а не Infinity у документі
check('ділення на нуль дає 0', calc('a / b', { a: 100, b: 0 }), 0);
check('невідома змінна = 0', calc('nemaje * 2'), 0);
check('ліниве І не чіпає другу гілку', calc('b > 0 && a / b > 1', { a: 10, b: 0 }), 0);

check('розбір ловить незакриту дужку', !!parseFormula('(2 + 3').error, true);
check('розбір ловить невідому функцію', !!parseFormula('sinus(2)').error, true);
check('розбір ловить зайвий хвіст', !!parseFormula('2 + 3 )').error, true);
check('розбір ловить чужий символ', !!parseFormula('2 # 3').error, true);
check('коректний вираз без помилки', parseFormula('a * (b + 1)').error, undefined);
check('змінні виразу', formulaVars('a * (b + a) - c').sort(), ['a', 'b', 'c']);
check('змінні з суфіксом .n', formulaVars('leads.n * 2'), ['leads.n']);

// ── Модулі ──────────────────────────────────────────────────────────────────

console.log('\nтипи модулів');

check(
  'input віддає введене число',
  evalOne([mod({ key: 'x', kind: 'input', role: 'income' })], { x: 250 }).income,
  250
);
check(
  'constant не залежить від документа',
  evalOne([mod({ key: 'x', kind: 'constant', role: 'income', value: 700 })], { x: 999 }).income,
  700
);
check(
  'rate множить введену кількість на ставку',
  evalOne([mod({ key: 'leads', kind: 'rate', role: 'income', rate: 150 })], { leads: 12 }).income,
  1800
);
check(
  'rate бере кількість з іншого модуля',
  evalOne(
    [
      mod({ key: 'days', kind: 'input' }),
      mod({ key: 'pay', kind: 'rate', role: 'income', rate: 500, source: 'days' }),
    ],
    { days: 4 }
  ).income,
  2000
);
check(
  'rate бере ставку з іншого модуля',
  evalOne(
    [
      mod({ key: 'perDay', kind: 'constant', value: 1000 }),
      mod({ key: 'worked', kind: 'rate', role: 'income', rateSource: 'perDay' }),
    ],
    { worked: 21 }
  ).income,
  21000
);
check(
  'percent з фіксованою ставкою',
  evalOne(
    [
      mod({ key: 'base', kind: 'input', role: 'income' }),
      mod({ key: 'bonus', kind: 'percent', role: 'income', base: 'base', fixedPercent: true, percent: 10 }),
    ],
    { base: 10000 }
  ).amounts.bonus,
  1000
);
check(
  'percent із відсотком з документа',
  evalOne(
    [
      mod({ key: 'base', kind: 'input', role: 'income' }),
      mod({ key: 'bonus', kind: 'percent', role: 'income', base: 'base' }),
    ],
    { base: 10000, bonus: 7 }
  ).amounts.bonus,
  700
);
check(
  'percent від INCOME бачить усі нарахування',
  evalOne(
    [
      mod({ key: 'a', kind: 'input', role: 'income' }),
      mod({ key: 'b', kind: 'input', role: 'income' }),
      mod({ key: 'tax', kind: 'percent', role: 'deduction', base: 'INCOME', fixedPercent: true, percent: 20 }),
    ],
    { a: 6000, b: 4000 }
  ).amounts.tax,
  2000
);

console.log('\nтарифна сітка');
const tiers = [
  { from: 100, amount: 5000 },
  { from: 80, amount: 2000 },
  { from: 120, amount: 8000 },
];
check('нижче найменшого порога — нуль', tierAmount(tiers, 50), 0);
check('рівно на порозі — поріг спрацьовує', tierAmount(tiers, 80), 2000);
check('між порогами — нижчий', tierAmount(tiers, 99), 2000);
check('порядок порогів не важливий', tierAmount(tiers, 130), 8000);
check('порожня сітка — нуль', tierAmount([], 500), 0);
check(
  'tiers читає значення з іншого модуля',
  evalOne(
    [
      mod({ key: 'plan', kind: 'input' }),
      mod({ key: 'planBonus', kind: 'tiers', role: 'income', source: 'plan', tiers }),
    ],
    { plan: 105 }
  ).income,
  5000
);

// ── Підсумки, залежності, помилки ───────────────────────────────────────────

console.log('\nпідсумки та залежності');

const chain = [
  mod({ key: 'leads', kind: 'rate', role: 'income', rate: 150 }),
  mod({ key: 'planBonus', kind: 'tiers', role: 'income', source: 'plan', tiers }),
  mod({ key: 'plan', kind: 'input' }),
  mod({ key: 'lead15', kind: 'formula', role: 'income', formula: '(leads + planBonus) * 0.15' }),
  mod({ key: 'tax', kind: 'percent', role: 'deduction', base: 'INCOME', fixedPercent: true, percent: 10 }),
];
// Модуль оголошено після того, хто на нього посилається — порядок має вирішити рушій
const chainResult = evalOne(chain, { leads: 20, plan: 105 });
check('ставка × кількість', chainResult.amounts.leads, 3000);
check('поріг за планом', chainResult.amounts.planBonus, 5000);
check('формула поверх двох модулів', chainResult.amounts.lead15, 1200);
check('нарахування підсумовані', chainResult.income, 9200);
check('податок від суми нарахувань', chainResult.amounts.tax, 920);
check('баланс', chainResult.balance, 8280);
check('info не потрапляє в підсумок', chainResult.amounts.plan, 105);

check(
  '.n дає введену кількість, а не суму',
  evalOne(
    [
      mod({ key: 'leads', kind: 'rate', role: 'income', rate: 150 }),
      mod({ key: 'perLead', kind: 'formula', formula: 'leads.n * 2' }),
    ],
    { leads: 20 }
  ).amounts.perLead,
  40
);

// Податок оголошено раніше за бонуси, які він має враховувати: порядок
// обчислення мусить визначати граф залежностей, а не порядок у списку
const declaredEarly = evalOne(
  [
    mod({ key: 'tax', kind: 'percent', role: 'deduction', base: 'INCOME', fixedPercent: true, percent: 10, order: 0 }),
    mod({ key: 'salary', kind: 'input', role: 'income', order: 1 }),
    mod({ key: 'bonus', kind: 'input', role: 'income', order: 2 }),
  ],
  { salary: 30000, bonus: 6700 }
);
check('податок бачить бонуси, оголошені після нього', declaredEarly.amounts.tax, 3670);
check(
  'BALANCE доступний у формулі',
  evalOne(
    [
      mod({ key: 'a', kind: 'input', role: 'income' }),
      mod({ key: 'b', kind: 'input', role: 'deduction' }),
      mod({ key: 'view', kind: 'formula', role: 'info', formula: 'BALANCE' }),
    ],
    { a: 1000, b: 250 }
  ).amounts.view,
  750
);

const cyclic = evalOne([
  mod({ key: 'a', kind: 'formula', label: 'А', formula: 'b + 1' }),
  mod({ key: 'b', kind: 'formula', label: 'Б', formula: 'a + 1' }),
]);
check('цикл не зациклює рушій', [cyclic.amounts.a, cyclic.amounts.b], [0, 0]);
check('цикл потрапляє в issues', cyclic.issues.length, 2);

// Нарахування, що посилається на підсумок нарахувань — це замкнене коло
const pseudoCycle = evalOne([
  mod({ key: 'a', kind: 'input', role: 'income' }),
  mod({ key: 'boom', kind: 'formula', label: 'Коло', role: 'income', formula: 'INCOME * 0.1' }),
]);
check('нарахування від INCOME визнано циклом', pseudoCycle.issues.length, 1);
check('цикл через INCOME не зациклює рушій', pseudoCycle.amounts.boom, 0);

const dupes = evalOne([
  mod({ key: 'x', kind: 'input', role: 'income' }),
  mod({ key: 'x', id: 'x2', kind: 'input', role: 'income' }),
], { x: 100 });
check('дубль ключа рахується один раз', dupes.income, 100);
check('дубль ключа помічений', dupes.issues.length, 1);

check(
  'формула на неіснуючий модуль скаржиться',
  evalOne([mod({ key: 'a', kind: 'formula', formula: 'nema * 2' })]).issues.length,
  1
);
check(
  'percent без бази скаржиться',
  evalOne([mod({ key: 'a', kind: 'percent', role: 'income' })], { a: 10 }).issues.length,
  1
);

console.log('\nполя вводу');
check('input має власне поле', hasOwnInput(mod({ key: 'a', kind: 'input' })), true);
check('rate без джерела має поле', hasOwnInput(mod({ key: 'a', kind: 'rate' })), true);
check('rate з джерелом поля не має', hasOwnInput(mod({ key: 'a', kind: 'rate', source: 'b' })), false);
check('percent з фікс. ставкою поля не має', hasOwnInput(mod({ key: 'a', kind: 'percent', fixedPercent: true })), false);
check('formula поля не має', hasOwnInput(mod({ key: 'a', kind: 'formula' })), false);

console.log('\nключі');
check('простий ключ валідний', isValidKey('leadsBonus'), true);
check('ключ з дефісом невалідний', isValidKey('leads-bonus'), false);
check('ключ з цифри невалідний', isValidKey('2leads'), false);
check('псевдозмінну не можна зайняти', isValidKey('INCOME'), false);
check('ключ із кирилиці', suggestKey('Бонус за ліди', []), 'bonusZaLidy');
check('ключ уникає зайнятих', suggestKey('Бонус', ['bonus']), 'bonus2');
check('назва без латиниці не ламає ключ', /^[A-Za-z_]/.test(suggestKey('₴₴₴', [])), true);

// ── Індивідуальні правки поверх шаблону ─────────────────────────────────────

console.log('\nправки поверх шаблону');

const template = {
  id: 't1',
  name: 'Таргетолог',
  sections: [],
  modules: [
    mod({ id: 'm1', key: 'leads', kind: 'rate', role: 'income', rate: 150, order: 0 }),
    mod({ id: 'm2', key: 'extra', kind: 'input', role: 'income', order: 1 }),
  ],
};

check(
  'override міняє ставку',
  evalOne(resolveModules(template, { templateId: 't1', overrides: { m1: { rate: 200 } } }), { leads: 10 }).income,
  2000
);
check(
  'вимкнений модуль не рахується',
  evalOne(resolveModules(template, { templateId: 't1', disabledModuleIds: ['m2'] }), { leads: 1, extra: 500 }).income,
  150
);
check(
  'індивідуальний модуль додається',
  evalOne(
    resolveModules(template, {
      templateId: 't1',
      extraModules: [mod({ id: 'm3', key: 'personal', kind: 'constant', role: 'income', value: 1000, order: 5 })],
    }),
    { leads: 0, extra: 0 }
  ).income,
  1000
);
check(
  'override не може зламати ключ, на який посилаються формули',
  resolveModules(template, { templateId: 't1', overrides: { m1: { key: 'zzz' } as any } })[0].key,
  'leads'
);

// ── Сумісність зі старою формулою ───────────────────────────────────────────

console.log('\nстара формула = новий рушій');

/** Точна копія обчислення зі старої PayrollForm — еталон для порівняння */
function legacyMath(doc: PayrollDocument, settings: PayrollSettings) {
  const custom = (fields: CustomPayrollField[], values: Record<string, number> = {}) =>
    Object.entries(values).reduce((acc, [id, val]) => {
      const field = fields.find((f) => f.id === id);
      const numVal = Number(val) || 0;
      if (!field || !field.type || field.type === 'fixed') return acc + numVal;
      if (field.type === 'multiplier') return acc + numVal * (field.multiplierRate || 0);
      if (field.type === 'percentage') return acc + (numVal * (field.percentRate || 0)) / 100;
      return acc;
    }, 0);

  const salaryPerDay = doc.workingDaysInMonth! > 0 ? doc.baseSalary! / doc.workingDaysInMonth! : 0;
  const workedDaysIncome = doc.workedDays! * salaryPerDay;
  const teamBonusAmount = (workedDaysIncome * doc.teamBonusPercent!) / 100;
  const sum =
    workedDaysIncome +
    teamBonusAmount +
    doc.additionalActivity! +
    custom(settings.customBonuses, doc.customBonusesValues);
  const taxAmount = (sum * doc.taxPercent!) / 100;
  const balance =
    sum -
    taxAmount -
    doc.amountReceived! -
    doc.companyDebts! -
    custom(settings.customDeductions, doc.customDeductionsValues);
  return { sum: Math.round(sum), balance: Math.round(balance) };
}

const legacySettings: PayrollSettings = {
  labels: baseModules()[0] ? ({} as any) : ({} as any),
  customBonuses: [
    { id: 'cb1', label: 'Бонус за клієнтів', type: 'multiplier', multiplierRate: 300, multiplierUnit: 'клієнт' },
    { id: 'cb2', label: 'Разова премія', type: 'fixed' },
    { id: 'cb3', label: 'Відсоток з продажів', type: 'percentage', percentRate: 5 },
  ],
  customDeductions: [
    { id: 'cd1', label: 'Штраф за запізнення', type: 'multiplier', multiplierRate: 100, multiplierUnit: 'раз' },
    { id: 'cd2', label: 'Аванс', type: 'fixed' },
  ],
};

const legacyDoc: PayrollDocument = {
  id: 'doc1',
  userId: 'u1',
  period: '2026-07',
  baseSalary: 30000,
  workingDaysInMonth: 22,
  workedDays: 20,
  paidVacationDays: 2,
  overtimeHours: 6,
  businessTripDays: 1,
  teamBonusPercent: 12,
  additionalActivity: 3500,
  customBonusesValues: { cb1: 4, cb2: 1500, cb3: 80000 },
  taxPercent: 19.5,
  amountReceived: 12000,
  companyDebts: 800,
  customDeductionsValues: { cd1: 3, cd2: 5000 },
  createdAt: '2026-08-01T00:00:00.000Z',
};

const migrated = legacyTemplate(legacySettings, 'u1');
const migratedResult = evaluateModules(migrated.modules, legacyValues(legacyDoc, migrated));
const reference = legacyMath(legacyDoc, legacySettings);

check('нараховано збігається зі старою формулою', Math.round(migratedResult.income), reference.sum);
check('баланс збігається зі старою формулою', Math.round(migratedResult.balance), reference.balance);
check('оклад за день перенесено', Math.round(migratedResult.amounts.salaryPerDay), Math.round(30000 / 22));
check('ставка за клієнта перенесена', migratedResult.amounts[migrated.modules.find((m) => m.id === 'cb1')!.key], 1200);
check('старий «відсоток» перенесено як ставку', migratedResult.amounts[migrated.modules.find((m) => m.id === 'cb3')!.key], 4000);
check('штраф став відрахуванням', migratedResult.amounts[migrated.modules.find((m) => m.id === 'cd1')!.key], 300);
check('міграція не лишає помилок', migratedResult.issues, []);

// Нуль робочих днів валив стару форму в NaN — перевіряємо, що тепер ні
const zeroDays = evaluateModules(
  migrated.modules,
  legacyValues({ ...legacyDoc, workingDaysInMonth: 0 }, migrated)
);
check('нуль робочих днів не дає NaN', Number.isFinite(zeroDays.balance), true);

console.log(failures === 0 ? '\nВсі перевірки пройдено\n' : `\n${failures} перевірок не пройдено\n`);
if (failures > 0) process.exit(1);
