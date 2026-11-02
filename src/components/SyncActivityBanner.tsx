import React, { useEffect, useState } from 'react';
import { Loader2, Clock, AlertCircle, CheckCircle2, Gem, RefreshCw, History } from 'lucide-react';
import { KeepInCRMSyncStatus } from '../api';
import { describeRange, describeTrigger, formatElapsed, isSyncBusy } from '../lib/syncActivity';

/**
 * Що зараз синхронізується — одним поглядом.
 *
 * Показує всі фонові роботи з KeepInCRM незалежно від того, хто їх запустив:
 * кнопка в цій вкладці, кнопка в іншій, нічний cron чи старт сервера. Раніше
 * видно було лише історію, що її запустили тут, а про все інше говорила лише
 * відмова «вже виконується» — без пояснення, що саме і як довго.
 *
 * У спокої лишається один тихий рядок: це теж відповідь на питання «чи йде зараз
 * щось?». Мовчання не відрізняє «нічого не йде» від «індикатор зламався».
 */
interface Props {
  status: KeepInCRMSyncStatus | null;
  /** Коли востаннє успішно порахували LTV (ISO) — для рядка у спокої */
  lastLtvAt?: string | null;
  /** Історія, запущена в цій вкладці, вже має власну смугу — другий раз її не малюємо */
  historyShownElsewhere?: boolean;
}

function Bar({ pct, tone }: { pct: number | null; tone: 'purple' | 'orange' }) {
  const fill = tone === 'purple' ? 'from-purple-500 to-violet-500' : 'from-orange-400 to-amber-500';
  const track = tone === 'purple' ? 'bg-purple-100' : 'bg-orange-100';
  return (
    <div
      className={`w-full ${track} rounded-full h-1.5 overflow-hidden`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct ?? undefined}
    >
      {pct === null
        // Відсотка немає (збереження) — бігунок, а не застигла смуга
        ? <div className={`h-1.5 w-1/3 rounded-full bg-gradient-to-r ${fill} animate-pulse`} />
        : <div className={`bg-gradient-to-r ${fill} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${Math.max(2, pct)}%` }} />}
    </div>
  );
}

export default function SyncActivityBanner({ status, lastLtvAt, historyShownElsewhere }: Props) {
  // Секундний годинник лише поки щось іде чи діє пауза: у спокої не перемальовуємо
  const [now, setNow] = useState(() => Date.now());
  const ticking = isSyncBusy(status) || !!status?.rateLimitedUntil;
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  if (!status) return null;

  const { ltv } = status;
  const showHistory = status.running && !historyShownElsewhere;
  const rateWaitSec = status.rateLimitedUntil ? Math.max(0, Math.ceil((status.rateLimitedUntil - now) / 1000)) : 0;
  const busy = isSyncBusy(status);

  // ── Спокій ────────────────────────────────────────────────────────────────
  if (!busy) {
    return (
      <div className="px-6 py-2 border-b border-gray-100 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden />
          Синхронізація зараз не виконується
        </span>
        {lastLtvAt && (
          <span>
            Останній розрахунок LTV: {new Date(lastLtvAt).toLocaleString('uk-UA', {
              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
            })}
          </span>
        )}
        {ltv.error && (
          <span className="inline-flex items-center gap-1 text-red-600">
            <AlertCircle className="w-3 h-3" />
            Останній розрахунок LTV завершився помилкою: {ltv.error}
          </span>
        )}
        {/* Що сервер вирішив на старті: це і є відповідь на «а раптом він знову вантажить усе?» */}
        {status.startupLtv && (
          <span title={`Рішення ухвалено ${new Date(status.startupLtv.at).toLocaleString('uk-UA')}`}>
            Старт сервера: LTV {status.startupLtv.run ? 'перераховано' : 'не перераховувався'} — {status.startupLtv.reason}
          </span>
        )}
      </div>
    );
  }

  // ── Щось іде ──────────────────────────────────────────────────────────────
  return (
    <div className="px-6 py-3 border-b border-gray-100 bg-gray-50/60 space-y-3" role="status" aria-live="polite">

      {ltv.running && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 mb-1.5">
            <span className="text-xs font-semibold text-purple-700 flex items-center gap-1.5">
              <Gem className="w-3.5 h-3.5" />
              Рахуємо LTV · {describeRange(ltv.range)}
              <Loader2 className="w-3 h-3 animate-spin" />
            </span>
            <span className="text-[11px] text-gray-500">
              {describeTrigger(ltv.trigger)}
              {ltv.startedAt && <> · минуло {formatElapsed(now - new Date(ltv.startedAt).getTime())}</>}
            </span>
          </div>
          <div className="flex items-center justify-between mb-1 text-[11px] text-purple-700">
            <span>
              {ltv.phase}
              {ltv.pct !== null && ltv.total > 0 && <> · сторінка {ltv.done} з {ltv.total}</>}
            </span>
            {ltv.pct !== null && <span className="font-bold">{ltv.pct}%</span>}
          </div>
          <Bar pct={ltv.pct} tone="purple" />
        </div>
      )}

      {showHistory && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-orange-700 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              {status.type === 'cohort' ? 'Нічний перерахунок когорт' : 'Синхронізація історії'}:
              {' '}{status.done} з {status.total} днів
              {status.currentDate && <span className="text-orange-400 font-normal">· {status.currentDate}</span>}
              <Loader2 className="w-3 h-3 animate-spin" />
            </span>
            <span className="text-[11px] font-bold text-orange-600">{status.pct}%</span>
          </div>
          <Bar pct={status.pct} tone="orange" />
        </div>
      )}

      {status.today && (
        <p className="text-xs font-semibold text-violet-700 flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          Оновлюємо дані за сьогодні
        </p>
      )}

      {/* Пауза через ліміт — окремо: без пояснення вона виглядає як зависання */}
      {rateWaitSec > 0 && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 flex-shrink-0" />
          KeepInCRM попросила зачекати (ліміт запитів) — продовжимо через {rateWaitSec} с. Це нормально, зависання немає.
        </p>
      )}

      {!ltv.running && ltv.error && (
        <p className="text-[11px] text-red-600 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          Останній розрахунок LTV завершився помилкою: {ltv.error}
        </p>
      )}

      {/* Зелена позначка — лише як підказка, що решта не виконується */}
      {!ltv.running && !showHistory && !status.today && rateWaitSec === 0 && (
        <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          Інші синхронізації не виконуються
        </p>
      )}
    </div>
  );
}
