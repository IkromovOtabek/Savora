'use client';

import { useEffect, useRef, type ReactNode, type CSSProperties } from 'react';

/**
 * 3D karta: sichqoncha ustida engil egiladi va yorug'lik aksi yuradi.
 * Faqat sichqonchali qurilmada va "harakatni kamaytirish" o'chiq bo'lsa ishlaydi.
 * Ko'rinish: components/ui/ux.css (.ux-d3). Tugmalarda ishlatilmaydi.
 */
export default function Tilt({
  children, className = '', stack = false, max = 6, style, as: Tag = 'div',
}: { children: ReactNode; className?: string; stack?: boolean; max?: number; style?: CSSProperties; as?: 'div' | 'section' | 'article' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--ux-ry', `${((x - 0.5) * max).toFixed(2)}deg`);
        el.style.setProperty('--ux-rx', `${((0.5 - y) * max).toFixed(2)}deg`);
        el.style.setProperty('--ux-gx', `${(x * 100).toFixed(0)}%`);
        el.style.setProperty('--ux-gy', `${(y * 100).toFixed(0)}%`);
        el.dataset.tilting = '1';
      });
    };
    const leave = () => {
      cancelAnimationFrame(raf);
      el.style.setProperty('--ux-rx', '0deg');
      el.style.setProperty('--ux-ry', '0deg');
      el.dataset.tilting = '0';
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); cancelAnimationFrame(raf); };
  }, [max]);
  const Comp = Tag as 'div';
  return (
    <Comp ref={ref} className={`ux-d3${stack ? ' ux-d3--stack' : ''}${className ? ` ${className}` : ''}`} style={style}>
      {children}
      <span className="ux-glare" aria-hidden="true" />
    </Comp>
  );
}
