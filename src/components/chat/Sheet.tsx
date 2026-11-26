import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Вікно, що на телефоні виїжджає знизу (як у месенджерах), а на комп'ютері
 * стає звичайним діалогом по центру. Один компонент для всіх діалогів чату —
 * щоб пальцем скрізь було однаково зручно: великі зони дотику, відступ під
 * жестову смужку, закриття дотиком повз вікно.
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`bg-white w-full ${size === 'sm' ? 'sm:max-w-sm' : 'sm:max-w-md'} rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[88dvh] sm:max-h-[85vh] animate-[sheet-up_.18s_ease-out]`}
      >
        {/* «Ручка» — підказує, що вікно можна закрити; лише на телефоні */}
        <div className="sm:hidden flex justify-center pt-2">
          <span className="w-9 h-1 rounded-full bg-gray-300" />
        </div>
        {title && (
          <div className="flex items-center justify-between px-5 py-3 sm:py-4 border-b border-gray-100 shrink-0">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
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
      </div>
    </div>
  );
}
