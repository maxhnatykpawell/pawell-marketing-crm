import React, { useEffect, useRef, useState } from 'react';
import { onCelebrate } from '../lib/celebrate';

/**
 * Скільки триває спалах. Свідомо коротко: анімація має відзначити подію
 * і зникнути, а не забирати екран у людини, яка вже взялась за наступний таск.
 */
const DURATION_MS = 1600;

/** Коли починати згасання — останні 500 мс, щоб конфеті не зникали ривком */
const FADE_FROM_MS = DURATION_MS - 500;

const COLORS = ['#2563eb', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#0ea5e9'];

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  color: string;
  /** Кут і швидкість обертання — без них стрічки виглядають як падаючі крихти */
  angle: number;
  spin: number;
  /** Прямокутник чи кружечок — суміш форм читається живіше за один вид */
  round: boolean;
}

const GRAVITY = 0.00075;   // px/мс²
const DRAG = 0.9985;       // гасіння горизонтальної швидкості за мс

/**
 * Святкове конфеті на закриття таска.
 *
 * Canvas, а не DOM і не motion: сотня вузлів, які щокадру рухаються й
 * обертаються, змушує браузер перераховувати верстку всієї сторінки — на дошці
 * з десятками карток це помітно смикає. На canvas та ж сотня частинок коштує
 * один прохід малювання й нічого не чіпає в DOM.
 *
 * Полотно існує лише під час спалаху: увесь інший час компонент не малює нічого
 * і не тримає жодного кадру анімації.
 */
export default function Celebration() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [active, setActive] = useState(false);
  /** Лічильник спалахів: рестартує ефект, навіть якщо попередній ще не догорів */
  const [burst, setBurst] = useState(0);

  useEffect(() => onCelebrate(() => {
    // Ті, хто просив менше руху, отримують тиху підсвітку картки — і на цьому все
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    setBurst(b => b + 1);
    setActive(true);
  }), []);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Ретіна: без множника на DPR стрічки виходять мильними
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    /**
     * Дві «гармати» з нижніх кутів, спрямовані досередини.
     *
     * Салют із центру засипав би конфеті саме ту картку, яку щойно закрили —
     * тобто заховав би те, заради чого все й затівалось.
     */
    const particles: Particle[] = [];
    const perCannon = 55;
    for (const side of [0, 1]) {
      const originX = side === 0 ? w * 0.08 : w * 0.92;
      const aim = side === 0 ? 1 : -1;
      for (let i = 0; i < perCannon; i++) {
        const spread = (Math.random() * 0.5 + 0.15) * aim;
        const power = 0.55 + Math.random() * 0.55;
        particles.push({
          x: originX,
          y: h * 1.02,
          vx: spread * power * 1.6,
          // Швидкість підібрана під DURATION_MS: сильніший поштовх виглядає
          // ефектніше лише перші півсекунди, а далі третина стрічок іде за
          // верхній край і не встигає повернутись до згасання.
          vy: -(0.85 + Math.random() * 0.4) * power,
          size: 5 + Math.random() * 6,
          color: COLORS[(Math.random() * COLORS.length) | 0],
          angle: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 0.02,
          round: Math.random() < 0.3,
        });
      }
    }

    let raf = 0;
    let last = performance.now();
    const started = last;

    const frame = (now: number) => {
      // Рух рахуємо від реального часу кадру, а не від «одного тіку»: інакше
      // на слабкій машині салют летить повільно, а на 120 Гц — удвічі швидше.
      const dt = Math.min(now - last, 50);
      last = now;
      const elapsed = now - started;

      if (elapsed >= DURATION_MS) {
        setActive(false);
        return;
      }

      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = elapsed > FADE_FROM_MS
        ? 1 - (elapsed - FADE_FROM_MS) / (DURATION_MS - FADE_FROM_MS)
        : 1;

      for (const p of particles) {
        p.vy += GRAVITY * dt;
        p.vx *= Math.pow(DRAG, dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.angle += p.spin * dt;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Сплюснутий прямокутник — так стрічка «крутиться», а не мерехтить
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }
        ctx.restore();
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active, burst]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 z-[200] pointer-events-none"
      style={{ width: '100vw', height: '100vh' }}
    />
  );
}
