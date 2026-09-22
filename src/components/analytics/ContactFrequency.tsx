/**
 * Частота контакту — вкладка «Активність сейлів» у розширеній аналітиці.
 *
 * Дані приходять з /api/keepincrm/activity, де вже злиті два джерела: дзвінки
 * (вебхук тригера KeepInCRM) і завдання-контакти (/tasks). Компонент тягне їх
 * сам і монтується лише на своїй вкладці: на великому періоді це кілька тисяч
 * подій, і платити за них при відкритті аналітики немає за що.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Phone, PhoneIncoming, PhoneOutgoing, Users, Clock, AlertTriangle, Loader2,
  ArrowUp, ArrowDown, ListChecks, CalendarClock,
} from 'lucide-react';
import { getKeepInCRMActivity } from '../../api';
import { ContactActivityResponse, ContactActivityUser } from '../../types';

/**
 * Дві серії — дзвінки й завдання. Порядок фіксований, кольори закріплені за
 * серією, а не за її місцем у сортуванні: інакше зміна періоду перефарбувала б
 * легенду. Пара перевірена на розрізнюваність при дальтонізмі.
 */
const SERIES = {
  calls: { label: 'Дзвінки', fill: 'bg-purple-600', dot: 'bg-purple-600' },
  tasks: { label: 'Завдання-контакти', fill: 'bg-amber-600', dot: 'bg-amber-600' },
} as const;

/** Скільки клієнтів показуємо в таблиці дотиків */
const CLIENT_ROWS = 25;

const nf = (n: number) => n.toLocaleString('uk-UA');

/** Тривалість у людському вигляді: 2 год 15 хв, 7 хв, 40 с */
function formatDuration(totalSec: number): string {
  if (!totalSec || totalSec < 1) return '—';
  const h = Math.floor(totalSec / 3600);
  const m = Math.round((totalSec % 3600) / 60);
  if (h > 0) return m > 0 ? `${h} год ${m} хв` : `${h} год`;
  if (totalSec >= 60) return `${Math.max(1, Math.round(totalSec / 60))} хв`;
  return `${Math.round(totalSec)} с`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })
    + ' ' + d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

/** Підпис дня для осі: 03.09 */
const dayLabel = (date: string) => date.slice(8, 10) + '.' + date.slice(5, 7);

/**
 * Плитка з числом.
 *
 * Зміна показана лише коли є з чим порівнювати: відсоток від нуля не визначений,
 * і сервер повертає для такого випадку null, а не «+100 %».
 */
function StatTile({
  icon, label, value, unit, hint, change, invertChange = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  change?: number | null;
  /** true — зростання показника є поганою новиною */
  invertChange?: boolean;
}) {
  const good = change != null && (invertChange ? change < 0 : change > 0);
  const bad  = change != null && (invertChange ? change > 0 : change < 0);

  return (
    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0 text-purple-600">
          {icon}
        </div>
        <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider leading-tight">
          {label}
        </p>
      </div>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <p className="text-3xl font-black text-gray-900 leading-none">{value}</p>
        {unit && <span className="text-xs font-semibold text-gray-400">{unit}</span>}
        {change != null && (
          <span
            title="Зміна відносно попереднього рівного періоду"
            className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded ${
              good ? 'text-emerald-700 bg-emerald-50'
                   : bad ? 'text-red-700 bg-red-50'
                         : 'text-gray-500 bg-gray-50'
            }`}
          >
            {change > 0 ? <ArrowUp className="w-3 h-3" /> : change < 0 ? <ArrowDown className="w-3 h-3" /> : null}
            {Math.abs(change)} %
          </span>
        )}
      </div>
      {hint && <p className="text-[11px] text-gray-400 leading-snug">{hint}</p>}
    </div>
  );
}

/** Легенда: ідентичність серії ніколи не тримається на одному кольорі */
function Legend() {
  return (
    <div className="flex items-center gap-4">
      {Object.values(SERIES).map(s => (
        <span key={s.label} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
          <span className={`w-2.5 h-2.5 rounded-sm ${s.dot}`} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Рядок сейла: смуга з двох сегментів у спільному масштабі з рештою рядків.
 *
 * Масштаб один на всю таблицю (максимум по команді), інакше смуги показували б
 * не «хто більше», а лише «з чого складається кожен» — а питання саме перше.
 */
const UserRow = React.memo(function UserRow({ user, max }: { user: ContactActivityUser; max: number }) {
  const width = (n: number) => (max > 0 ? (n / max) * 100 : 0);

  return (
    <tr className="hover:bg-gray-50/50 transition">
      <td className="py-3 px-4">
        <p className="text-sm font-semibold text-gray-800 truncate max-w-[160px]" title={user.userName}>
          {user.userName}
        </p>
        <p className="text-[10px] text-gray-400">
          останній — {formatDate(user.lastAt)}
        </p>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2 min-w-[180px]">
          {/* 2px проміжок між сегментами: без нього суміжні заливки читаються
              як одна смуга, і склад дотиків зникає. */}
          <div className="flex-1 flex items-center gap-[2px] h-5">
            {user.calls > 0 && (
              <div
                className={`${SERIES.calls.fill} h-2 rounded-sm`}
                style={{ width: `${width(user.calls)}%` }}
                title={`${nf(user.calls)} дзвінків`}
              />
            )}
            {user.tasks > 0 && (
              <div
                className={`${SERIES.tasks.fill} h-2 rounded-sm`}
                style={{ width: `${width(user.tasks)}%` }}
                title={`${nf(user.tasks)} завдань-контактів`}
              />
            )}
          </div>
          <span className="text-sm font-bold text-gray-900 w-10 text-right flex-shrink-0">
            {nf(user.contacts)}
          </span>
        </div>
      </td>
      <td className="py-3 px-4 text-right">
        <span className="text-sm font-bold text-gray-900">{user.perDay}</span>
        <span className="block text-[10px] text-gray-400" title="Лише по днях, коли був хоч один дотик">
          {user.perActiveDay} у робочий день
        </span>
      </td>
      <td className="py-3 px-4 text-right text-sm text-gray-700">
        {user.successRate} %
        <span className="block text-[10px] text-gray-400">{nf(user.successful)} із {nf(user.contacts)}</span>
      </td>
      <td className="py-3 px-4 text-right text-sm text-gray-700">{nf(user.clients)}</td>
      <td className="py-3 px-4 text-right text-sm text-gray-700 whitespace-nowrap">
        {formatDuration(user.durationSec)}
        {user.calls > 0 && user.durationSec > 0 && (
          <span className="block text-[10px] text-gray-400">
            ~{formatDuration(Math.round(user.durationSec / user.calls))} на дзвінок
          </span>
        )}
      </td>
      <td className="py-3 px-4 text-right text-sm text-gray-500">{user.activeDays}</td>
    </tr>
  );
});

type ClientSort = 'touches' | 'stale';

export default function ContactFrequency({
  from, to,
}: {
  /** Межі періоду; null = сервер візьме останні 30 днів */
  from: string | null;
  to: string | null;
}) {
  const [data, setData] = useState<ContactActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientSort, setClientSort] = useState<ClientSort>('touches');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await getKeepInCRMActivity(from, to, true);
        if (!cancelled) setData(res);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Не вдалось завантажити активність');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [from, to]);

  const maxUserContacts = useMemo(
    () => Math.max(0, ...(data?.byUser ?? []).map(u => u.contacts)),
    [data],
  );

  const maxDay = useMemo(
    () => Math.max(0, ...(data?.daily ?? []).map(d => d.calls + d.tasks)),
    [data],
  );

  const clients = useMemo(() => {
    const list = [...(data?.byClient ?? [])];
    if (clientSort === 'stale') list.sort((a, b) => b.daysSince - a.daysSince || b.touches - a.touches);
    return list.slice(0, CLIENT_ROWS);
  }, [data, clientSort]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Рахуємо дотики…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-red-700">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        {error}
      </div>
    );
  }

  if (!data) return null;

  const t = data.totals;
  const cmp = data.comparison;

  return (
    <div className="flex flex-col gap-6">

      {/* Без вебхука дзвінків не буде взагалі — це інша новина, ніж «за період
          дзвінків не було», і плутати їх не можна. */}
      {!data.webhookConfigured && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-start gap-2 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <strong className="font-bold">Дзвінки не підключені.</strong> Нижче — лише завдання-контакти
            з KeepInCRM. Щоб бачити справжні дзвінки: задайте <code className="font-mono">KEEPINCRM_WEBHOOK_SECRET</code> на
            сервері, а в KeepInCRM створіть тригер «Робота з дзвінками» з дією «Відправка Webhook»
            на <code className="font-mono">/api/keepincrm/call-webhook</code>.
          </div>
        </div>
      )}

      {data.truncated && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-2 flex items-center gap-2 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Період віддав більше подій, ніж влізає в один запит — числа неповні. Візьміть коротший період.
        </div>
      )}

      {/* Пікер угорі місячної точності й уміє «весь час», а дотики — це щоденні
          події: за весь час їх були б сотні тисяч. Тому «весь час» тут означає
          останні 30 днів, і про це треба сказати прямо, а не дати людині
          гадати, чому вибір і показані дати не збігаються. */}
      <div className="text-xs text-gray-500">
        Період: <strong className="text-gray-800">{data.period.from} — {data.period.to}</strong>
        {' '}({t.periodDays} дн.)
        {cmp && <> · порівняння з {cmp.period.from} — {cmp.period.to}</>}
        {from === null && to === null && (
          <span className="text-gray-400"> · для активності «весь час» — це останні 30 днів</span>
        )}
      </div>

      {/* Головні числа. Частота контакту — перша плитка: саме вона відповідає
          на питання «як часто сейл виходить на клієнта». */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatTile
          icon={<Phone className="w-4 h-4" />}
          label="Частота контакту"
          value={String(t.perRepPerDay)}
          unit="дотиків / сейл / день"
          hint={`${nf(t.reps)} сейлів у роботі за період`}
          change={cmp?.perRepPerDayChange}
        />
        <StatTile
          icon={<ListChecks className="w-4 h-4" />}
          label="Усього дотиків"
          value={nf(t.contacts)}
          hint={`${nf(t.calls)} дзвінків · ${nf(t.tasks)} завдань`}
          change={cmp?.contactsChange}
        />
        <StatTile
          icon={<PhoneOutgoing className="w-4 h-4" />}
          label="Результативних"
          value={`${t.successRate} %`}
          hint={`${nf(t.successful)} із ${nf(t.contacts)} — підняли або виконано`}
          change={cmp?.successRateChange}
        />
        <StatTile
          icon={<Users className="w-4 h-4" />}
          label="Дотиків на клієнта"
          value={String(t.touchesPerClient)}
          hint={`${nf(t.clients)} клієнтів отримали контакт`}
          change={cmp?.touchesPerClientChange}
        />
      </div>

      {t.contacts === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-12 text-center">
          <p className="text-sm font-semibold text-gray-700">За цей період дотиків не зафіксовано</p>
          <p className="text-xs text-gray-500 mt-1 max-w-lg mx-auto">
            Дзвінки з'являються тут у момент розмови — через тригер KeepInCRM. Завдання-контакти
            підтягуються щогодини: враховуються ті, у яких категорія схожа на «Дзвінок» або «Зустріч».
          </p>
        </div>
      ) : (
        <>
          {/* Хто скільки — впорядковано за кількістю дотиків */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-black text-gray-800">Активність по сейлах</h3>
              <Legend />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Сейл</th>
                    <th className="py-3 px-4">Дотики</th>
                    <th className="py-3 px-4 text-right">На день</th>
                    <th className="py-3 px-4 text-right">Результативність</th>
                    <th className="py-3 px-4 text-right">Клієнтів</th>
                    <th className="py-3 px-4 text-right">У розмовах</th>
                    <th className="py-3 px-4 text-right">Активних днів</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.byUser.map(u => (
                    <UserRow key={u.userName} user={u} max={maxUserContacts} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Динаміка по днях */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <h3 className="text-base font-black text-gray-800">Дотики по днях</h3>
              <Legend />
            </div>
            <div className="flex items-end gap-[3px] h-[180px] overflow-x-auto pb-1">
              {data.daily.map(d => {
                const total = d.calls + d.tasks;
                const h = maxDay > 0 ? (total / maxDay) * 100 : 0;
                return (
                  <div
                    key={d.date}
                    className="group relative flex-1 min-w-[10px] h-full flex flex-col justify-end items-center"
                    title={`${dayLabel(d.date)} — ${nf(total)} дотиків (${nf(d.calls)} дзвінків, ${nf(d.tasks)} завдань)`}
                  >
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-10">
                      {dayLabel(d.date)}: {nf(total)}
                    </div>
                    <div
                      className="w-full flex flex-col justify-end gap-[2px]"
                      style={{ height: `${Math.max(total > 0 ? 3 : 0, h)}%` }}
                    >
                      {/* Скруглюємо лише верхівку стовпця, низ лишається
                          приклеєним до базової лінії — інакше стовпець
                          «висить» і висоту стає важче порівнювати. */}
                      {d.tasks > 0 && (
                        <div
                          className={`${SERIES.tasks.fill} w-full rounded-t`}
                          style={{ flexGrow: d.tasks }}
                        />
                      )}
                      {d.calls > 0 && (
                        <div
                          className={`${SERIES.calls.fill} w-full ${d.tasks > 0 ? '' : 'rounded-t'}`}
                          style={{ flexGrow: d.calls }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Підписуємо лише краї та середину: підпис на кожному дні за 30+ днів
                перетворюється на сірий шум. */}
            <div className="flex justify-between text-[10px] font-semibold text-gray-400 mt-2">
              <span>{dayLabel(data.daily[0]?.date ?? '')}</span>
              {data.daily.length > 2 && (
                <span>{dayLabel(data.daily[Math.floor(data.daily.length / 2)].date)}</span>
              )}
              <span>{dayLabel(data.daily[data.daily.length - 1]?.date ?? '')}</span>
            </div>
          </div>

          {/* Дотики на клієнта */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-gray-800">Дотики на клієнта</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Показані клієнти, які отримали хоч один контакт за період — топ {CLIENT_ROWS} із {nf(t.clients)}
                </p>
              </div>
              <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-1">
                {([
                  ['touches', 'Найчастіші'],
                  ['stale', 'Найдавніші'],
                ] as [ClientSort, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setClientSort(key)}
                    className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition ${
                      clientSort === key
                        ? 'bg-white text-purple-700 shadow-sm'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Клієнт</th>
                    <th className="py-3 px-4 text-right">Дотиків</th>
                    <th className="py-3 px-4 text-right">З них дзвінків</th>
                    <th className="py-3 px-4 text-right">Останній контакт</th>
                    <th className="py-3 px-4">Хто контактував</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {clients.map((c, i) => (
                    <tr key={`${c.clientId ?? c.clientName}-${i}`} className="hover:bg-gray-50/50 transition">
                      <td className="py-3 px-4">
                        <p className="text-sm font-semibold text-gray-800 truncate max-w-[220px]" title={c.clientName}>
                          {c.clientName}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-right text-sm font-bold text-gray-900">{nf(c.touches)}</td>
                      <td className="py-3 px-4 text-right text-sm text-gray-600">{nf(c.calls)}</td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span className={`text-sm font-semibold ${c.daysSince >= 30 ? 'text-red-600' : c.daysSince >= 14 ? 'text-amber-700' : 'text-gray-700'}`}>
                          {c.daysSince === 0 ? 'сьогодні' : `${c.daysSince} дн. тому`}
                        </span>
                        <span className="block text-[10px] text-gray-400">{formatDate(c.lastAt)}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs text-gray-500 truncate block max-w-[200px]" title={c.reps.join(', ')}>
                          {c.reps.join(', ') || '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-3 border-t border-gray-100 flex items-start gap-2 text-[11px] text-gray-400">
              <CalendarClock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              «Днів тому» рахується від останнього дотику всередині періоду. Клієнтів, до яких за цей
              період не торкались узагалі, у таблиці немає — розширте період, щоб їх побачити.
            </div>
          </div>

          {/* Напрямок дзвінків: вхідні проти вихідних. Окремим блоком, бо в
              завданнях напрямку немає й мішати їх у ті самі числа не можна. */}
          {t.calls > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatTile
                icon={<PhoneOutgoing className="w-4 h-4" />}
                label="Вихідні дзвінки"
                value={nf(t.outgoing)}
                hint="Ініціатива сейла"
              />
              <StatTile
                icon={<PhoneIncoming className="w-4 h-4" />}
                label="Вхідні дзвінки"
                value={nf(t.incoming)}
                hint="Клієнт подзвонив сам"
              />
              <StatTile
                icon={<Clock className="w-4 h-4" />}
                label="У розмовах"
                value={formatDuration(t.durationSec)}
                hint={t.calls > 0 ? `~${formatDuration(Math.round(t.durationSec / t.calls))} на дзвінок` : undefined}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
