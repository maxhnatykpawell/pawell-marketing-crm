import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useDragControls } from 'motion/react';
import { X } from 'lucide-react';
import { DUR, EASE, SPRING, shouldDismiss } from '../../lib/motion';

/**
 * Вікно, що на телефоні виїжджає знизу (як у месенджерах), а на комп'ютері стає звичайним
 * діалогом по центру. Один компонент для всіх діалогів: щоб пальцем скрізь було однаково
 * зручно: великі зони дотику, відступ під жестову смужку, закриття дотиком повз вікно.
 *
 * Рух (телефон):
 *  • виїжджає пружиною, підкладка проявляється;
 *  • закривається так само плавно: і кнопкою, і дотиком повз, і Esc, і свайпом вниз;
 *  • свайп вниз тягнеться за «ручку» й шапку (а не за вміст: вміст прокручується), і відпускання
 *    або повертає панель назад, або закриває її: залежить від відстані й швидкості жесту.
 * На комп'ютері замість виїзду м'яке проявлення з легким збільшенням.
 */
export default function Sheet({
  title, onClose, children, footer, size = 'md',
}: {
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md';
}) {
  // Екран ≥ 640 px — діалог по центру, інакше нижня панель
  const [wide] = useState(() => window.matchMedia('(min-width: 640px)').matches);
  const [closing, setClosing] = useState(false);
  const dragControls = useDragControls();
  const finished = useRef(false);

  /** Зачинити по-справжньому (прибрати з дерева) — рівно один раз */
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onClose();
  }, [onClose]);

  const requestClose = useCallback(() => setClosing(true), []);

  // Запасний вихід: якщо анімація з якоїсь причини не повідомила про завершення, діалог не повинен «зависнути»
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(finish, 450);
    return () => clearTimeout(t);
  }, [closing, finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [requestClose]);

  const hidden = wide ? { opacity: 0, y: 12, scale: 0.98 } : { y: '100%' };
  const shown = wide ? { opacity: 1, y: 0, scale: 1 } : { y: 0 };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      initial={{ backgroundColor: 'rgba(0,0,0,0)' }}
      animate={{ backgroundColor: closing ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.5)' }}
      transition={{ duration: closing ? DUR.exit : DUR.base, ease: EASE.out }}
      onClick={requestClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <motion.div
        onClick={e => e.stopPropagation()}
        className={`bg-white w-full ${size === 'sm' ? 'sm:max-w-sm' : 'sm:max-w-md'} rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[88dvh] sm:max-h-[85vh]`}
        initial={hidden}
        animate={closing ? hidden : shown}
        transition={closing ? { duration: DUR.exit, ease: EASE.in } : wide ? { duration: DUR.base, ease: EASE.out } : SPRING.sheet}
        onAnimationComplete={() => { if (closing) finish(); }}
        // Потягнути вниз: лише на телефоні й лише за ручку / шапку (див. нижче)
        drag={wide ? false : 'y'}
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={(_, info) => { if (shouldDismiss(info.offset.y, info.velocity.y)) requestClose(); }}
      >
        {/* «Ручка» і шапка — зона для жесту. touch-action: none, інакше браузер забере жест собі як прокрутку */}
        <div
          className="sm:hidden flex justify-center pt-2 pb-1 shrink-0 cursor-grab active:cursor-grabbing"
          style={{ touchAction: 'none' }}
          onPointerDown={e => dragControls.start(e)}
        >
          <span className="w-9 h-1 rounded-full bg-gray-300" />
        </div>
        {title && (
          <div
            className="flex items-center justify-between px-5 py-2 sm:py-4 border-b border-gray-100 shrink-0"
            style={wide ? undefined : { touchAction: 'none' }}
            onPointerDown={e => { if (!wide && !(e.target as HTMLElement).closest('button')) dragControls.start(e); }}
          >
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">{title}</h2>
            <button
              onClick={requestClose}
              aria-label="Закрити"
              className="p-2 -mr-2 text-gray-400 hover:bg-gray-100 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 sm:rounded-b-2xl shrink-0 pb-safe">
            {footer}
          </div>
        )}
        {!footer && <div className="pb-safe" />}
      </motion.div>
    </motion.div>
  );
}
