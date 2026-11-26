import { useEffect, useState } from 'react';

export interface ViewportBox {
  top: number;
  height: number;
}

/**
 * Видима частина екрана — з урахуванням екранної клавіатури.
 *
 * `position: fixed; inset: 0` на iOS Safari рахується від повного екрана, а не від
 * того, що лишилось над клавіатурою: поле вводу опиняється під нею, а сторінка
 * «їздить». visualViewport віддає справжню висоту й зсув, тож екран розмови можна
 * притиснути рівно до видимої області.
 *
 * Без підтримки API (старі браузери) повертає null — тоді лишається звичайний inset-0.
 */
export function useVisualViewport(enabled = true): ViewportBox | null {
  const [box, setBox] = useState<ViewportBox | null>(null);

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!enabled || !vv) return;

    const update = () => {
      setBox({ top: vv.offsetTop, height: vv.height });
      // Поки клавіатура відкрита, iOS може прокрутити саму сторінку — повертаємо
      if (vv.offsetTop > 0) window.scrollTo(0, 0);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [enabled]);

  return box;
}
