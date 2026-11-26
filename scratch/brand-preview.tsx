/**
 * Пісочниця бренду: логотип у всіх тонах і анімація запуску з перемотуванням.
 * Запуск: npx vite --port 5199 → http://localhost:5199/scratch/brand-preview.html
 * Анімацію можна гортати повзунком (час у мс) — зручно розглядати окремі кадри.
 */
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import PawellLogo, { PawellBadge, PawellLogoAnimated } from '../src/components/brand/PawellLogo';

function Preview() {
  const [run, setRun] = useState(0);
  const [t, setT] = useState<number | null>(null);

  // Перемотування: ставимо всім анімаціям однаковий час і зупиняємо
  useEffect(() => {
    if (t === null) return;
    document.getAnimations().forEach(a => { a.pause(); a.currentTime = t; });
  }, [t, run]);
  (window as any).__seek = (ms: number | null) => setT(ms);

  return (
    <div className="min-h-screen bg-slate-100 p-6 space-y-6 font-sans">
      <div className="pw-splash rounded-3xl relative overflow-hidden flex flex-col items-center justify-center py-16">
        <div className="pw-splash-glow absolute w-[700px] h-[700px] pointer-events-none" />
        <div className="relative flex flex-col items-center">
          <PawellLogoAnimated key={run} className="w-[420px] h-auto" />
          <p className="pw-splash-tagline mt-6 text-xs font-semibold tracking-[0.42em] uppercase text-[color:var(--brand-yellow)]/70">Innovation Department Hub</p>
        </div>
        <div className="relative mt-8 flex items-center gap-3 text-white text-xs">
          <button className="px-3 py-1.5 rounded bg-white/10" onClick={() => { setT(null); setRun(r => r + 1); }}>▶ Повторити</button>
          <input type="range" min={0} max={3200} step={50} defaultValue={0} onChange={e => setT(Number(e.target.value))} />
          <span>{t ?? 'live'} мс</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-2xl p-8 flex items-center justify-center" style={{ background: 'var(--brand-ink)' }}><PawellLogo height={48} tone="yellow" /></div>
        <div className="rounded-2xl p-8 flex items-center justify-center bg-white border"><PawellLogo height={48} tone="ink" /></div>
        <div className="rounded-2xl p-8 flex items-center justify-center bg-white border gap-6"><PawellBadge size="sm" /><PawellBadge size="md" /></div>
        <div className="rounded-2xl p-8 flex items-center justify-center bg-purple-600"><PawellLogo height={48} tone="white" /></div>
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Preview />);
