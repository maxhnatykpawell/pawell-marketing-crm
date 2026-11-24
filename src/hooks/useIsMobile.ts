import { useEffect, useState } from 'react';

/** Ширина, до якої показуємо мобільну версію (нижче планшетного «md») */
const MOBILE_QUERY = '(max-width: 767px)';
const STORAGE_KEY = 'pawell_ui_mode';

/**
 * Ручне перемикання: у мобільній версії є посилання «Повна версія», а в повній
 * (на вузькому екрані) — «Мобільна версія». Вибір пам'ятаємо в браузері.
 * Також працює ?ui=mobile / ?ui=desktop в адресі — зручно для перевірки.
 */
export type UiMode = 'auto' | 'mobile' | 'desktop';

function readOverride(): UiMode {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('ui');
    if (fromUrl === 'mobile' || fromUrl === 'desktop') {
      localStorage.setItem(STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'mobile' || saved === 'desktop') return saved;
  } catch { /* приватний режим тощо — лишаємо авто */ }
  return 'auto';
}

export function setUiMode(mode: UiMode): void {
  try {
    if (mode === 'auto') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, mode);
  } catch { /* ігноруємо */ }
  window.dispatchEvent(new Event('pawell-ui-mode'));
}

/** Чи показувати мобільну версію: за шириною екрана, якщо не обрано вручну */
export function useIsMobile(): boolean {
  const compute = () => {
    const mode = readOverride();
    if (mode === 'mobile') return true;
    if (mode === 'desktop') return false;
    return window.matchMedia(MOBILE_QUERY).matches;
  };

  const [isMobile, setIsMobile] = useState(compute);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(compute());
    mq.addEventListener('change', update);
    window.addEventListener('pawell-ui-mode', update);
    return () => {
      mq.removeEventListener('change', update);
      window.removeEventListener('pawell-ui-mode', update);
    };
  }, []);

  return isMobile;
}
