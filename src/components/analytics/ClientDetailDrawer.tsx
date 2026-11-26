import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Gauge, Loader2, Mail, Pencil, Phone, Tag, TrendingUp, UserRound, X } from 'lucide-react';
import { ClientDetailsResponse, getClientDetails } from '../../api';
import { hasAnyDetails, telHref } from '../../lib/clientContacts';
import { resolveResponsible } from '../../lib/clientProfile';
import type { User } from '../../types';
import {
  CUSTOMER_KIND_LABELS, CUSTOMER_KIND_STYLES, EnrichedClient, TIERS, tierOfRevenue,
} from '../../lib/clientAnalytics';
import {
  ClientPowerInput, MAX_SCORE, MANUAL_CRITERIA, POWER_CRITERIA, POWER_CRITERION_LABELS, POWER_TIER_BY_ID,
  addMonths, monthKey, type PowerScore,
} from '../../lib/clientPower';
import { pluralUk } from '../../lib/plural';

const fmt = (n: number) => Math.round(n).toLocaleString('uk-UA');
const uah = (n: number) => `${fmt(n)} ₴`;

const SCORE_STYLE: Record<PowerScore, string> = {
  1: 'bg-gray-100 text-gray-600',
  2: 'bg-blue-100 text-blue-700',
  3: 'bg-emerald-100 text-emerald-700',
};

/** Скільки останніх місяців показуємо на графіку */
const CHART_MONTHS = 24;

const monthLabel = (m: string, withYear = false) => {
  const [y, mm] = m.split('-').map(Number);
  return new Date(y, mm - 1, 1).toLocaleDateString('uk-UA', withYear ? { month: 'short', year: 'numeric' } : { month: 'short' });
};

/**
 * Картка клієнта: усе, що ми про нього знаємо, на одному екрані.
 *
 * Відкривається кліком по назві в таблиці. Бічна панель, а не окрема сторінка: список
 * лишається на місці, фільтри не губляться, а до наступного клієнта можна перейти, не
 * втрачаючи позицію. На телефоні панель займає весь екран.
 *
 * Показує лише те, що вже є в знімку KeepInCRM: оборот, угоди, помісячні покупки, теги.
 * Окремих угод і контактів у знімку немає, тож їх тут свідомо немає, щоб не вигадувати.
 */
/** Телефони з посиланням tel: (на телефоні дзвінок одним дотиком) і пошта з mailto: */
function ContactLines({ phones, emails }: { phones: string[]; emails: string[] }) {
  return (
    <div className="space-y-1">
      {phones.map(p => (
        <a key={p} href={telHref(p)} className="flex items-center gap-2 min-h-[32px] text-sm text-gray-800 hover:text-blue-700">
          <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span className="tabular-nums">{p}</span>
        </a>
      ))}
      {emails.map(e => (
        <a key={e} href={`mailto:${e}`} className="flex items-center gap-2 min-h-[32px] text-sm text-gray-800 hover:text-blue-700 break-all">
          <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          {e}
        </a>
      ))}
    </div>
  );
}

export default function ClientDetailDrawer({
  client, powerInput, powerMeta, onEditPower, onClose,
  team, ownerMeta, onSaveResponsible,
}: {
  client: EnrichedClient;
  /** Команда: відповідальним може бути лише хтось із неї */
  team: User[];
  /** Хто й коли призначив відповідального */
  ownerMeta?: { updatedAt?: string; updatedBy?: string | null };
  /** Призначити відповідального (id користувача) або прибрати наше призначення (null) */
  onSaveResponsible: (userId: string | null) => Promise<void>;
  /** Ручна оцінка (контакти, повний акаунт тощо) */
  powerInput: ClientPowerInput;
  powerMeta?: { updatedAt?: string; updatedBy?: string | null };
  onEditPower: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Поверх панелі відкрито ще вікно (оцінка) — Esc закриває його, а не панель під ним
      if (document.querySelectorAll('[role="dialog"]').length > 1) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Відповідальний і контакти беремо з CRM при відкритті: у нашому знімку їх немає
  const [details, setDetails] = useState<ClientDetailsResponse | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [ownerBusy, setOwnerBusy] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);

  const teamNames = useMemo(() => new Map(team.map(u => [u.id, u.name])), [team]);
  const resolved = resolveResponsible(
    { responsibleUserId: client.responsibleUserId ?? null },
    teamNames,
    details?.responsible?.name ?? null,
  );

  const changeOwner = async (userId: string | null) => {
    setOwnerBusy(true);
    setOwnerError(null);
    try { await onSaveResponsible(userId); }
    catch (e: any) { setOwnerError(e.message || 'Не вдалось зберегти'); }
    finally { setOwnerBusy(false); }
  };

  const loadDetails = useCallback(() => {
    let cancelled = false;
    setDetailsLoading(true);
    setDetailsError(null);
    getClientDetails(client.id)
      .then(d => { if (!cancelled) setDetails(d); })
      .catch(e => { if (!cancelled) setDetailsError(e.message || 'Не вдалось завантажити'); })
      .finally(() => { if (!cancelled) setDetailsLoading(false); });
    // Перехід до іншого клієнта не має показати відповідь попереднього
    return () => { cancelled = true; };
  }, [client.id]);

  useEffect(() => {
    setDetails(null);
    return loadDetails();
  }, [loadDetails]);

  const tier = tierOfRevenue(client.revenue);
  const tierMeta = tier !== null ? TIERS.find(t => t.id === tier) : undefined;
  const power = client.power;
  const powerTier = power?.tier ? POWER_TIER_BY_ID[power.tier] : null;
  const kind = CUSTOMER_KIND_STYLES[client.customerKind];

  // ── Помісячні покупки: останні N місяців, пропущені — нулями ────────────────
  const stats = client.monthlyStats;
  const chart = useMemo(() => {
    if (!stats) return null;
    const keys = Object.keys(stats).sort();
    if (keys.length === 0) return null;
    const end = monthKey(new Date()) > keys[keys.length - 1] ? monthKey(new Date()) : keys[keys.length - 1];
    const months = Array.from({ length: CHART_MONTHS }, (_, i) => addMonths(end, i - (CHART_MONTHS - 1)));
    const rows = months.map(m => ({ month: m, revenue: stats[m]?.revenue ?? 0, deals: stats[m]?.deals ?? 0, paid: client.monthlyPaid?.[m] ?? 0 }));
    return { rows, max: Math.max(1, ...rows.map(r => r.revenue)), totalMonths: keys.length, first: keys[0] };
  }, [stats, client.monthlyPaid]);

  const paidTotal = useMemo(
    () => (client.monthlyPaid ? Object.values(client.monthlyPaid).reduce((s, v) => s + (v || 0), 0) : null),
    [client.monthlyPaid],
  );

  const kpis: { label: string; value: string; hint?: string }[] = [
    { label: 'Дохід за весь час', value: uah(client.revenue) },
    { label: 'Угод за весь час', value: fmt(client.agreementsCount) },
    { label: 'Середній чек', value: client.agreementsCount > 0 ? uah(client.revenue / client.agreementsCount) : '—', hint: 'за весь час' },
    {
      label: 'Остання покупка',
      value: client.recencyDays !== null ? `${client.recencyDays} ${pluralUk(client.recencyDays, 'день', 'дні', 'днів')} тому` : '—',
      hint: client.lastPurchaseDate ? new Date(client.lastPurchaseDate).toLocaleDateString('uk-UA') : undefined,
    },
    { label: 'Перша покупка', value: client.cohortMonth ? monthLabel(client.cohortMonth, true) : '—', hint: 'когорта' },
    ...(paidTotal !== null ? [{ label: 'Оплачено', value: uah(paidTotal), hint: 'касово' }] : []),
  ];

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Клієнт ${client.name}`}>
      <div className="absolute inset-0 bg-gray-900/40" onClick={onClose} />

      <aside className="absolute inset-y-0 right-0 w-full sm:w-[520px] max-w-full bg-white shadow-2xl flex flex-col animate-[sheet-up_.18s_ease-out] sm:animate-none">
        {/* Шапка */}
        <header className="shrink-0 px-5 pt-4 pb-4 border-b border-gray-100 pt-safe">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-black text-gray-900 leading-snug break-words">{client.name}</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">№ {client.id} в KeepInCRM</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Закрити"
              className="shrink-0 w-10 h-10 sm:w-9 sm:h-9 -mr-2 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded border ${client.rfm.color}`}>
              <span>{client.rfm.icon}</span> {client.rfm.label}
            </span>
            {powerTier && power && (
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${powerTier.badge}`}>
                Power {power.tier}{power.complete ? '' : ' · попередній'}
              </span>
            )}
            {tierMeta && (
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${tierMeta.badge}`} title="Тір за доходом">
                {tierMeta.label} · дохід
              </span>
            )}
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${kind.badge}`}>
              {CUSTOMER_KIND_LABELS[client.customerKind]}
            </span>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-safe">
          {/* Ключові числа */}
          <section className="px-5 py-4 grid grid-cols-2 gap-3">
            {kpis.map(k => (
              <div key={k.label} className="rounded-xl bg-gray-50 border border-gray-100 px-3.5 py-3 min-w-0">
                <p className="text-[11px] font-semibold text-gray-500">{k.label}</p>
                <p className="text-base sm:text-lg font-extrabold text-gray-900 tabular-nums truncate" title={k.value}>{k.value}</p>
                {k.hint && <p className="text-[10px] text-gray-400">{k.hint}</p>}
              </div>
            ))}
          </section>

          {/* У вибраному періоді */}
          {client.periodRevenue !== client.revenue && (
            <p className="mx-5 -mt-1 mb-3 text-xs text-gray-500 bg-purple-50/60 border border-purple-100 rounded-lg px-3 py-2">
              У вибраному періоді: <b className="text-gray-800">{uah(client.periodRevenue)}</b>, {fmt(client.periodDeals)}{' '}
              {pluralUk(client.periodDeals, 'угода', 'угоди', 'угод')}.
            </p>
          )}

          {/* Відповідальний і контакти: хто веде клієнта й хто в компанії за що відповідає */}
          <section className="px-5 pb-5" aria-labelledby="contacts-title">
            <h3 id="contacts-title" className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-3">
              <UserRound className="w-4 h-4 text-blue-600" /> Відповідальний і контакти
            </h3>

            {detailsLoading && !details && (
              <p className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Завантажуємо з KeepInCRM…</p>
            )}

            {detailsError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {detailsError}{' '}
                <button onClick={loadDetails} className="font-semibold underline underline-offset-2">Повторити</button>
              </div>
            )}

            {/* Відповідальний — наш власний запис поверх KeepInCRM: у CRM для цього поля немає,
                тож він редагується тут і не стирається синхронізацією. Стоїть поза блоком
                деталей CRM, щоб його можна було призначити, навіть якщо CRM не відповіла. */}
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 px-3.5 py-3 mb-3">
              <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">Відповідальний менеджер</p>

              <div className="mt-1.5 flex items-center gap-2">
                <select
                  value={resolved.source === 'local' ? (resolved.userId ?? '') : ''}
                  disabled={ownerBusy}
                  onChange={e => void changeOwner(e.target.value || null)}
                  aria-label="Відповідальний менеджер"
                  className="flex-1 min-w-0 h-11 sm:h-9 px-3 text-sm font-semibold text-gray-900 bg-white border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-60"
                >
                  <option value="">
                    {resolved.source === 'keepincrm' ? `Не призначено (у CRM: ${resolved.name})` : 'Не призначено'}
                  </option>
                  {team.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  {/* Призначену людину прибрали з команди: запис лишається видимим, а не зникає мовчки */}
                  {resolved.missing && resolved.userId && <option value={resolved.userId}>Колишній користувач ({resolved.userId})</option>}
                </select>
                {ownerBusy && <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />}
              </div>

              <p className="text-[11px] mt-1.5 text-blue-800/80">
                {resolved.source === 'local'
                  ? `Призначено у нас${ownerMeta?.updatedAt ? ` · ${new Date(ownerMeta.updatedAt).toLocaleDateString('uk-UA')}` : ''}${ownerMeta?.updatedBy ? `, ${ownerMeta.updatedBy}` : ''}. Синхронізація з KeepInCRM цього не змінює.`
                  : resolved.source === 'keepincrm'
                    ? `У нас не призначено — показуємо менеджера з KeepInCRM: ${resolved.name}. Оберіть людину, щоб призначити в себе.`
                    : 'Нікого не призначено. KeepInCRM теж не віддала менеджера: призначте людину з команди.'}
              </p>
              {resolved.source === 'local' && details?.responsible?.name && details.responsible.name !== resolved.name && (
                <p className="text-[11px] text-blue-800/70 mt-0.5">У KeepInCRM: {details.responsible.name}</p>
              )}
              {ownerError && <p className="text-xs text-red-600 mt-1">{ownerError}</p>}
            </div>

            {details && (
              <div className="space-y-3">

                {/* Загальні номери компанії */}
                {(details.companyPhones.length > 0 || details.companyEmails.length > 0) && (
                  <div className="rounded-xl border border-gray-100 px-3.5 py-3">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Компанія (загальні)</p>
                    <ContactLines phones={details.companyPhones} emails={details.companyEmails} />
                  </div>
                )}

                {/* Люди й ролі */}
                {details.contacts.length > 0 && (
                  <ul className="space-y-2">
                    {details.contacts.map((c, i) => (
                      <li key={i} className="rounded-xl border border-gray-100 px-3.5 py-3">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-sm font-bold text-gray-900">{c.name ?? 'Без імені'}</span>
                          {c.role && <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">{c.role}</span>}
                          {c.primary && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">основний</span>}
                        </div>
                        <div className="mt-1.5">
                          <ContactLines phones={c.phones} emails={c.emails} />
                          {c.phones.length === 0 && c.emails.length === 0 && <p className="text-xs text-gray-400">Контактних даних немає</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {!hasAnyDetails({ ...details, responsible: null }) && (
                  <div className="text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-3">
                    KeepInCRM не віддав контактів для цього клієнта: або їх не заповнено в CRM, або вони лежать у
                    полі, яке ми ще не розпізнаємо.
                    {details.shape != null && (
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer font-semibold text-gray-600">Структура відповіді CRM (без значень)</summary>
                        <div className="relative mt-2">
                          <pre className="max-h-56 overflow-auto rounded-lg bg-white border border-gray-200 p-3 text-[11px] leading-snug text-gray-700">
                            {JSON.stringify(details.shape, null, 2)}
                          </pre>
                          <button
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(JSON.stringify(details.shape, null, 2));
                                setCopied(true);
                                setTimeout(() => setCopied(false), 2000);
                              } catch { /* без дозволу буфер недоступний — текст можна виділити вручну */ }
                            }}
                            className="absolute top-2 right-2 inline-flex items-center gap-1 h-7 px-2 text-[11px] font-medium bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                          >
                            {copied ? <><Check className="w-3 h-3" /> Скопійовано</> : <><Copy className="w-3 h-3" /> Копіювати</>}
                          </button>
                        </div>
                      </details>
                    )}
                  </div>
                )}

                <p className="text-[10px] text-gray-400">
                  Дані з KeepInCRM{details.fetchedAt ? ` на ${new Date(details.fetchedAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}` : ''}
                  {details.cached ? ' (з кешу, до 10 хв)' : ''}. У нашій базі номери не зберігаються.
                </p>
              </div>
            )}
          </section>

          {/* Покупки по місяцях */}
          <section className="px-5 pb-5">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-purple-600" /> Покупки по місяцях
            </h3>
            {chart ? (
              <>
                <div className="flex items-end gap-[3px] h-28" role="img" aria-label="Дохід клієнта по місяцях">
                  {chart.rows.map(r => (
                    <div
                      key={r.month}
                      className="flex-1 min-w-0 flex flex-col justify-end h-full group relative"
                      title={`${monthLabel(r.month, true)}: ${uah(r.revenue)}${r.deals ? `, ${r.deals} ${pluralUk(r.deals, 'угода', 'угоди', 'угод')}` : ''}`}
                    >
                      <div
                        className={`w-full rounded-t ${r.revenue > 0 ? 'bg-purple-500 group-hover:bg-purple-600' : 'bg-gray-100'}`}
                        style={{ height: r.revenue > 0 ? `${Math.max(4, (r.revenue / chart.max) * 100)}%` : '2px' }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 mt-1.5 tabular-nums">
                  <span>{monthLabel(chart.rows[0].month, true)}</span>
                  <span>{monthLabel(chart.rows[chart.rows.length - 1].month, true)}</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Останні {CHART_MONTHS} міс. Місяців із покупками всього: {chart.totalMonths}. Наведіть на стовпчик, щоб побачити суму.
                </p>

                <details className="mt-3 group/d">
                  <summary className="cursor-pointer text-xs font-semibold text-purple-700 hover:text-purple-900">Таблиця по місяцях</summary>
                  <table className="w-full mt-2 text-xs">
                    <thead>
                      <tr className="text-left text-gray-400 border-b border-gray-100">
                        <th className="py-1.5 font-semibold">Місяць</th>
                        <th className="py-1.5 font-semibold text-right">Дохід</th>
                        <th className="py-1.5 font-semibold text-right">Угод</th>
                        {paidTotal !== null && <th className="py-1.5 font-semibold text-right">Оплачено</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {[...chart.rows].reverse().filter(r => r.revenue > 0 || r.deals > 0 || r.paid > 0).map(r => (
                        <tr key={r.month} className="border-b border-gray-50">
                          <td className="py-1.5 text-gray-700">{monthLabel(r.month, true)}</td>
                          <td className="py-1.5 text-right tabular-nums font-medium text-gray-800">{uah(r.revenue)}</td>
                          <td className="py-1.5 text-right tabular-nums text-gray-600">{r.deals}</td>
                          {paidTotal !== null && <td className="py-1.5 text-right tabular-nums text-gray-600">{r.paid ? uah(r.paid) : '—'}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </>
            ) : (
              <p className="text-sm text-gray-400">
                Помісячних даних немає — знімок старого формату. Перезапустіть синхронізацію LTV.
              </p>
            )}
          </section>

          {/* Pawell Power */}
          <section className="px-5 pb-5 border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <Gauge className="w-4 h-4 text-indigo-600" /> Pawell Power
              </h3>
              {power?.tier != null && (
                <span className="text-sm font-black text-gray-900 tabular-nums">
                  {power.score}<span className="text-xs font-semibold text-gray-400">/{MAX_SCORE}</span>
                </span>
              )}
            </div>

            {power && power.tier !== null ? (
              <>
                <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
                  {POWER_CRITERIA.map(k => {
                    const s = power.scores[k];
                    return (
                      <li key={k} className="flex items-center gap-3 px-3 py-2.5">
                        <span className={`w-7 h-7 rounded-lg text-sm font-black flex items-center justify-center shrink-0 ${s ? SCORE_STYLE[s] : 'bg-amber-50 text-amber-500'}`}>
                          {s ?? '?'}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium text-gray-800">
                            {POWER_CRITERION_LABELS[k]}
                            <span className="ml-1.5 text-[10px] font-semibold text-gray-400 uppercase">{MANUAL_CRITERIA.includes(k) ? 'вручну' : 'авто'}</span>
                          </span>
                          <span className="block text-xs text-gray-500">{power.notes[k]}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {powerTier && (
                  <p className="text-xs text-gray-500 mt-2.5">
                    {powerTier.label}. <b className="text-gray-700">Веде:</b> {powerTier.owner}. <b className="text-gray-700">На звʼязку:</b> {powerTier.cadence}.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400">Немає обороту — клієнт поза тіруванням.</p>
            )}

            {/* Довідкові поля з оцінки */}
            {(powerInput.contacts != null || powerInput.fullAccount || powerInput.framework) && (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {powerInput.contacts != null && (
                  <div><dt className="inline text-gray-500">Контактів: </dt><dd className="inline font-semibold text-gray-800">{powerInput.contacts}</dd></div>
                )}
                {powerInput.fullAccount && (
                  <div><dt className="inline text-gray-500">Акаунт: </dt><dd className="inline font-semibold text-gray-800">повний</dd></div>
                )}
                {powerInput.framework && (
                  <div><dt className="inline text-gray-500">Договір: </dt><dd className="inline font-semibold text-gray-800">рамковий</dd></div>
                )}
              </dl>
            )}

            <button
              onClick={onEditPower}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 h-11 sm:h-9 text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition"
            >
              <Pencil className="w-4 h-4" />
              {power && !power.complete ? 'Заповнити оцінку' : 'Змінити оцінку'}
            </button>
            {powerMeta?.updatedAt && (
              <p className="text-[11px] text-gray-400 mt-2 text-center">
                Оцінено {new Date(powerMeta.updatedAt).toLocaleDateString('uk-UA')}{powerMeta.updatedBy ? `, ${powerMeta.updatedBy}` : ''}
              </p>
            )}
          </section>

          {/* Теги */}
          <section className="px-5 pb-6 border-t border-gray-100 pt-4">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-2">
              <Tag className="w-4 h-4 text-gray-500" /> Теги
            </h3>
            {client.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {client.tags.map(t => (
                  <span key={t} className="px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">{t}</span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Тегів немає.</p>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
