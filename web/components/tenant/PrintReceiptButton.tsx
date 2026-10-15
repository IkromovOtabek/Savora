'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/icons/Icon';

type Width = 58 | 80;
const KEY = 'sl-receipt-width';

/** Chop etish + termal rulon kengligi (58/80 mm) tanlovi. Tanlov brauzerda eslab qolinadi. */
export default function PrintReceiptButton() {
  const [width, setWidth] = useState<Width>(80);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY);
      if (saved === '58' || saved === '80') setWidth(Number(saved) as Width);
    } catch { /* localStorage yopiq bo'lishi mumkin */ }
  }, []);

  function pick(w: Width) {
    setWidth(w);
    try { window.localStorage.setItem(KEY, String(w)); } catch { /* e'tiborsiz */ }
  }

  return (
    <div className="sl-receipt-tools">
      {/* Ekrandagi kenglik va chop etish sahifa o'lchami (globals'dagi 80mm ni ustidan yozadi) */}
      <style>{`.sl-receipt-wrap{--sl-rw:${width}mm}@media print{@page{size:${width}mm auto;margin:${width === 58 ? 2 : 4}mm}}`}</style>
      <div className="sl-seg" role="group" aria-label="Chek kengligi">
        {([58, 80] as Width[]).map((w) => (
          <button
            key={w}
            type="button"
            className={`sl-seg-btn${width === w ? ' is-on' : ''}`}
            aria-pressed={width === w}
            onClick={() => pick(w)}
          >
            {w} mm
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-primary btn-with-icon" onClick={() => window.print()}>
        <Icon name="clipboard" size={16} />
        Chop etish
      </button>
    </div>
  );
}
