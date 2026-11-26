import React, { useEffect, useState } from 'react';
import { PawellLogoAnimated } from './PawellLogo';
import { decideSplash, SPLASH_STORAGE_KEY, SPLASH_TIMING } from '../../lib/splash';

/**
 * Заставка при запуску: логотип PAWELL «малюється» на темному тлі.
 *
 * Накривається поверх застосунку, який у цей час уже вантажиться: заставка нічого не
 * чекає й нічого не затримує. Якщо дані ще не прийшли, коли вона зникла, людина побачить
 * екран завантаження з тим самим логотипом на тому самому фоні (див. LoadingScreen), тож
 * перехід без стрибка.
 *
 * Пропускається дотиком чи будь-якою клавішею. Показується раз за сеанс (див. lib/splash).
 */
export default function StartupSplash() {
  const [mode] = useState(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(SPLASH_STORAGE_KEY) === '1'; } catch { /* приватний режим */ }
    return decideSplash({
      search: window.location.search,
      seen,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    });
  });
  const [phase, setPhase] = useState<'show' | 'exit' | 'gone'>(mode === 'none' ? 'gone' : 'show');

  useEffect(() => {
    if (mode === 'none') return;
    try { sessionStorage.setItem(SPLASH_STORAGE_KEY, '1'); } catch { /* не критично */ }

    const showFor = mode === 'full' ? SPLASH_TIMING.fullMs : SPLASH_TIMING.shortMs;
    const toExit = setTimeout(() => setPhase('exit'), showFor);
    return () => clearTimeout(toExit);
  }, [mode]);

  useEffect(() => {
    if (phase !== 'exit') return;
    const t = setTimeout(() => setPhase('gone'), SPLASH_TIMING.exitMs);
    return () => clearTimeout(t);
  }, [phase]);

  // Пропуск: дотик чи клавіша
  useEffect(() => {
    if (phase !== 'show') return;
    const skip = () => setPhase('exit');
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  }, [phase]);

  if (phase === 'gone') return null;

  return (
    <div
      className={`pw-splash fixed inset-0 z-[300] flex flex-col items-center justify-center overflow-hidden select-none ${phase === 'exit' ? 'pw-splash-exit' : ''}`}
      onClick={() => setPhase('exit')}
      role="presentation"
    >
      {/* М'яке жовте сяйво за логотипом */}
      <div className="pw-splash-glow absolute w-[140vmin] h-[140vmin] max-w-[1100px] max-h-[1100px] pointer-events-none" aria-hidden />

      <div className="relative flex flex-col items-center px-6">
        <PawellLogoAnimated className="w-[min(72vw,440px)] h-auto" />
        <p className="pw-splash-tagline mt-6 text-[11px] sm:text-xs font-semibold tracking-[0.42em] uppercase text-[color:var(--brand-yellow)]/70">
          Innovation Department Hub
        </p>
      </div>
    </div>
  );
}
