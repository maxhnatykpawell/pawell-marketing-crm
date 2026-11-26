import React, { useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import Sheet from '../chat/Sheet';
import type { ClientRecord } from '../../lib/clientAnalytics';
import {
  CONTRACT_LABELS, CONTRACT_SIZES, ClientPowerInput, computePower, isEmptyPowerInput, MANUAL_CRITERIA,
  MAX_SCORE, TIER1_MIN, POWER_CRITERIA, POWER_CRITERION_LABELS, POWER_TIER_BY_ID, PowerContext, PowerScore,
  sanitizePowerInput,
} from '../../lib/clientPower';

const SCORE_STYLE: Record<PowerScore, string> = {
  1: 'bg-gray-100 text-gray-600',
  2: 'bg-blue-100 text-blue-700',
  3: 'bg-emerald-100 text-emerald-700',
};

/**
 * Оцінка одного клієнта: п'ять ознак із балами й поясненням, а під ними поля для
 * тих, що вводяться вручну. Підсумок перераховується одразу, поки людина вводить,
 * тож видно, як відповідь змінює тір, ще до збереження.
 */
export default function ClientPowerDialog({
  client, ctx, initial, meta, onClose, onSave,
}: {
  client: ClientRecord;
  ctx: PowerContext;
  initial: ClientPowerInput;
  /** Хто й коли оцінив востаннє */
  meta?: { updatedAt?: string; updatedBy?: string | null };
  onClose: () => void;
  onSave: (input: ClientPowerInput) => Promise<void>;
}) {
  const [potential, setPotential] = useState(initial.potentialUah != null ? String(initial.potentialUah) : '');
  const [contract, setContract] = useState(initial.contractSize ?? null);
  const [contacts, setContacts] = useState(initial.contacts != null ? String(initial.contacts) : '');
  const [fullAccount, setFullAccount] = useState(!!initial.fullAccount);
  const [framework, setFramework] = useState(!!initial.framework);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Порожнє поле — «не оцінено», а не нуль: різниця принципова (0 контактів — це відповідь, а не відсутність)
  const draft = useMemo<ClientPowerInput>(() => sanitizePowerInput({
    potentialUah: potential.trim() === '' ? undefined : Number(potential.replace(/\s/g, '').replace(',', '.')),
    contractSize: contract ?? undefined,
    contacts: contacts.trim() === '' ? undefined : Number(contacts),
    fullAccount,
    framework,
  }), [potential, contract, contacts, fullAccount, framework]);

  const result = useMemo(() => computePower(client, draft, ctx), [client, draft, ctx]);
  const tierMeta = result.tier ? POWER_TIER_BY_ID[result.tier] : null;

  const potentialInvalid = potential.trim() !== '' && draft.potentialUah === undefined;
  const contactsInvalid = contacts.trim() !== '' && draft.contacts === undefined;

  const submit = async () => {
    if (potentialInvalid || contactsInvalid) return;
    setBusy(true);
    setError(null);
    try { await onSave(draft); onClose(); }
    catch (e: any) { setError(e.message || 'Не вдалось зберегти'); setBusy(false); }
  };

  return (
    <Sheet
      title={client.name}
      onClose={onClose}
      footer={
        <div className="flex items-center gap-2">
          {error && <span className="flex-1 min-w-0 text-xs text-red-600">{error}</span>}
          {!error && <span className="flex-1" />}
          <button onClick={onClose} className="h-11 sm:h-9 px-4 text-sm text-gray-600 hover:bg-gray-200 rounded-lg">Скасувати</button>
          <button
            onClick={submit}
            disabled={busy || potentialInvalid || contactsInvalid}
            className="h-11 sm:h-9 px-5 inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isEmptyPowerInput(draft) && !isEmptyPowerInput(initial) ? 'Очистити оцінку' : 'Зберегти'}
          </button>
        </div>
      }
    >
      <div className="px-5 py-4 space-y-5">
        {/* Підсумок */}
        <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
          <div>
            {tierMeta ? (
              <span className={`text-xs font-bold px-2 py-0.5 rounded border ${tierMeta.badge}`}>
                {tierMeta.label}{result.complete ? '' : ' · попередній'}
              </span>
            ) : (
              <span className="text-xs font-bold text-gray-400">Без тіру (немає обороту)</span>
            )}
            {tierMeta && (
              <p className="text-[11px] text-gray-500 mt-1.5">{tierMeta.owner} · на звʼязку {tierMeta.cadence}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-black text-gray-900 tabular-nums leading-none">
              {result.score}<span className="text-sm font-semibold text-gray-400">/{MAX_SCORE}</span>
            </p>
            {!result.complete && <p className="text-[10px] text-amber-600 mt-1">бракує {result.missing.length}</p>}
          </div>
        </div>

        {result.score >= TIER1_MIN && !result.fullAccount && tierMeta?.id === 2 && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Балів достатньо для Tier 1, але акаунт не позначено як повний. Для Tier 1 потрібен повний акаунт:
            5+ контактів щонайменше з трьох ланок (керівництво, технічна, закупівлі чи експлуатація).
          </p>
        )}

        {/* Чотири ознаки, з яких складається тір */}
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
          {POWER_CRITERIA.map(k => {
            const s = result.scores[k];
            return (
              <li key={k} className="flex items-center gap-3 px-3 py-2.5">
                <span className={`w-7 h-7 rounded-lg text-sm font-black flex items-center justify-center shrink-0 ${s ? SCORE_STYLE[s] : 'bg-amber-50 text-amber-500'}`}>
                  {s ?? '?'}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-gray-800">
                    {POWER_CRITERION_LABELS[k]}
                    <span className="ml-1.5 text-[10px] font-semibold text-gray-400 uppercase">
                      {MANUAL_CRITERIA.includes(k) ? 'вручну' : 'авто'}
                    </span>
                  </span>
                  <span className="block text-xs text-gray-500 truncate" title={result.notes[k]}>{result.notes[k]}</span>
                </span>
              </li>
            );
          })}
        </ul>

        {/* Ручні поля */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Потенціал на рік, ₴</label>
            <input
              inputMode="numeric"
              value={potential}
              onChange={e => setPotential(e.target.value)}
              placeholder="Скільки клієнт може купувати за рік"
              className={`w-full px-3 py-2.5 sm:py-2 text-sm border rounded-lg outline-none focus:ring-2 ${potentialInvalid ? 'border-red-300 focus:ring-red-100' : 'border-gray-200 focus:border-indigo-400 focus:ring-indigo-100'}`}
            />
            {potentialInvalid && <p className="text-xs text-red-500 mt-1">Введіть число без літер</p>}
          </div>

          <div>
            <span className="block text-sm font-medium text-gray-700 mb-1.5">Контракт</span>
            <div className="flex flex-wrap gap-2">
              {CONTRACT_SIZES.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setContract(contract === c ? null : c)}
                  aria-pressed={contract === c}
                  className={`min-h-[40px] sm:min-h-[32px] px-3 text-xs rounded-lg border transition ${contract === c ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'}`}
                >
                  {CONTRACT_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-start gap-3 min-h-[44px] cursor-pointer">
            <input type="checkbox" checked={framework} onChange={e => setFramework(e.target.checked)} className="mt-1 w-4 h-4" />
            <span>
              <span className="block text-sm text-gray-800">Рамковий договір</span>
              <span className="block text-xs text-gray-500">Купує за рамковим договором: частота вважається «щомісяця» незалежно від історії.</span>
            </span>
          </label>

          <label className="flex items-start gap-3 min-h-[44px] cursor-pointer">
            <input type="checkbox" checked={fullAccount} onChange={e => setFullAccount(e.target.checked)} className="mt-1 w-4 h-4" />
            <span>
              <span className="block text-sm text-gray-800">Повний акаунт <span className="text-[10px] font-semibold text-gray-400 uppercase ml-1">умова Tier 1</span></span>
              <span className="block text-xs text-gray-500">5+ контактів щонайменше з трьох ланок: керівництво, технічна, закупівлі чи експлуатація. Бали не дає, але без неї найвищий тір — Tier 2.</span>
            </span>
          </label>

          <div className="border-t border-gray-100 pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Контактів із добрими стосунками
              <span className="ml-1.5 text-[10px] font-semibold text-gray-400 uppercase">довідково · у бали не входить</span>
            </label>
            <input
              inputMode="numeric"
              value={contacts}
              onChange={e => setContacts(e.target.value)}
              placeholder="Знають нас, відповідають, спілкувались за 3 місяці"
              className={`w-full px-3 py-2.5 sm:py-2 text-sm border rounded-lg outline-none focus:ring-2 ${contactsInvalid ? 'border-red-300 focus:ring-red-100' : 'border-gray-200 focus:border-indigo-400 focus:ring-indigo-100'}`}
            />
            {contactsInvalid && <p className="text-xs text-red-500 mt-1">Ціле число від 0 до 500</p>}
          </div>
        </div>

        {meta?.updatedAt && (
          <p className="text-[11px] text-gray-400 flex items-center gap-1">
            <Check className="w-3 h-3" />
            Оцінено {new Date(meta.updatedAt).toLocaleDateString('uk-UA')}{meta.updatedBy ? `, ${meta.updatedBy}` : ''}
          </p>
        )}
      </div>
    </Sheet>
  );
}
