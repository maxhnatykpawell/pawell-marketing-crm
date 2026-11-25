import React, { useEffect, useRef } from 'react';

/**
 * Банер із сіткою крапок: порядок (рівна сітка) і потік (хвиля, що плавно йде крізь неї).
 * Курсор м'яко розсуває крапки й підсвічує їх, а коли відходить, вони повертаються на місце.
 *
 * Правила спокою:
 *  - хвиля повільна й малоамплітудна; якщо в системі ввімкнено «зменшити рух»,
 *    вона вимкнена, а реакція на курсор лишається (її викликає сама людина);
 *  - малюється тільки поки банер видно на екрані й вкладка активна;
 *  - на дотикових екранах курсора немає, лишається тиха хвиля.
 */

const SPACING = 15;          // крок сітки, px
const BASE_R = 1.15;         // радіус крапки в спокої
const REACH = 96;            // радіус впливу курсора
const PUSH = 11;             // наскільки курсор відсуває найближчі крапки
const EASE = 0.14;           // «пружність» повернення: менше = плавніше
const WAVE_SPEED = 0.00042;  // швидкість потоку
const WAVE_AMP = 1.6;        // на скільки px хвиля зміщує крапки

export default function DotFlowBanner({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduce = reduceMq.matches;
    const onReduce = () => { reduce = reduceMq.matches; schedule(); };
    reduceMq.addEventListener('change', onReduce);

    let w = 0, h = 0, cols = 0, rows = 0;
    let ox: Float32Array, oy: Float32Array;   // поточні зсуви від курсора
    let pointer: { x: number; y: number } | null = null;
    let raf = 0;
    let visible = true;
    let running = false;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width; h = rect.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.floor(w / SPACING) + 2;
      rows = Math.floor(h / SPACING) + 2;
      ox = new Float32Array(cols * rows);
      oy = new Float32Array(cols * rows);
      schedule();
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      // Сітку центруємо, щоб поля зліва й справа були однакові
      const padX = (w - (cols - 2) * SPACING) / 2;
      const padY = (h - (rows - 2) * SPACING) / 2;
      let moving = false;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const bx = padX + c * SPACING;
          const by = padY + r * SPACING;

          // Потік: діагональна хвиля, що йде зліва направо
          let flow = 0.5;
          let wy = 0;
          if (!reduce) {
            const phase = bx * 0.011 - by * 0.006 - t * WAVE_SPEED * 6;
            flow = 0.5 + 0.5 * Math.sin(phase);
            wy = Math.sin(phase) * WAVE_AMP;
          }

          // Курсор: відштовхує й підсвічує
          let tx = 0, ty = 0, near = 0;
          if (pointer) {
            const dx = bx - pointer.x, dy = by - pointer.y;
            const d = Math.hypot(dx, dy);
            if (d < REACH) {
              near = 1 - d / REACH;
              const k = near * near * PUSH / (d || 1);
              tx = dx * k; ty = dy * k;
            }
          }
          ox[i] += (tx - ox[i]) * EASE;
          oy[i] += (ty - oy[i]) * EASE;
          if (Math.abs(tx - ox[i]) > 0.02 || Math.abs(ty - oy[i]) > 0.02) moving = true;

          const x = bx + ox[i];
          const y = by + oy[i] + wy;
          const glow = Math.max(near, ox[i] === 0 ? 0 : Math.min(1, Math.hypot(ox[i], oy[i]) / PUSH));
          const radius = BASE_R + flow * 0.45 + glow * 1.6;
          const alpha = 0.22 + flow * 0.26 + glow * 0.5;

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${Math.min(0.95, alpha).toFixed(3)})`;
          ctx.fill();
        }
      }
      return moving;
    };

    const frame = (t: number) => {
      raf = 0;
      const moving = draw(t);
      // Є що анімувати: хвиля, або крапки ще повертаються на місце
      if (visible && !document.hidden && (!reduce || moving || pointer)) {
        raf = requestAnimationFrame(frame);
      } else {
        running = false;
      }
    };

    function schedule() {
      if (running || !visible || document.hidden) {
        if (!running) draw(performance.now());
        return;
      }
      running = true;
      raf = requestAnimationFrame(frame);
    }

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const margin = REACH * 0.6;
      const inside = x > -margin && x < rect.width + margin && y > -margin && y < rect.height + margin;
      pointer = inside ? { x, y } : null;
      if (inside) schedule();
    };
    const onLeave = () => { pointer = null; schedule(); };
    const onVisibility = () => schedule();

    const io = new IntersectionObserver(entries => {
      visible = entries[0]?.isIntersecting ?? true;
      if (visible) schedule();
    });
    io.observe(canvas);

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    document.addEventListener('visibilitychange', onVisibility);
    resize();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      reduceMq.removeEventListener('change', onReduce);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className={`absolute inset-0 w-full h-full ${className}`} />;
}
