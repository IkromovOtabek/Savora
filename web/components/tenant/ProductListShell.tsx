'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';

export type ToggleCol = 'branch' | 'status' | 'price';

const STORAGE_KEY = 'savora_stock_cols';

function readHidden(): ToggleCol[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is ToggleCol => x === 'branch' || x === 'status' || x === 'price') : [];
  } catch {
    return [];
  }
}

/**
 * Ombor ro'yxati qobig'i (BILLZ): ustunlarni yoqib-o'chirish (brauzerda eslab qolinadi),
 * qatorlarni belgilash va belgilanganlarni qayta baholash / hisobdan chiqarishga yuborish.
 * Qatorlar serverda chiziladi — bu yerda faqat belgilash holati DOM'dan o'qiladi.
 */
export default function ProductListShell({ columns, canBulk, exportHref, children }: {
  columns: { key: ToggleCol; label: string }[];
  canBulk: boolean;
  exportHref?: string;
  children: ReactNode;
}) {
  const d = useDict();
  const t = d.stock.list;
  const rootRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState<ToggleCol[]>([]);
  const [sel, setSel] = useState<string[]>([]);

  useEffect(() => setHidden(readHidden()), []);
  // Ustunlar menyusi tashqariga bosilganda yopiladi
  useEffect(() => {
    function onDown(e: PointerEvent) {
      const menu = rootRef.current?.querySelector<HTMLDetailsElement>('details.st-cols');
      if (menu?.open && !menu.contains(e.target as Node)) menu.open = false;
    }
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  function toggleCol(key: ToggleCol) {
    setHidden((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* xususiy rejim */ }
      return next;
    });
  }

  function boxes() {
    return Array.from(rootRef.current?.querySelectorAll<HTMLInputElement>('input.st-check') ?? []);
  }
  function sync() {
    const all = boxes();
    const ids = all.filter((b) => b.checked).map((b) => b.value);
    setSel(ids);
    const head = rootRef.current?.querySelector<HTMLInputElement>('input.st-check-all');
    if (head) {
      head.checked = all.length > 0 && ids.length === all.length;
      head.indeterminate = ids.length > 0 && ids.length < all.length;
    }
  }
  function onChange(e: React.ChangeEvent<HTMLDivElement>) {
    const el = e.target as unknown as HTMLInputElement;
    if (el.classList?.contains('st-check-all')) boxes().forEach((b) => { b.checked = el.checked; });
    if (el.classList?.contains('st-check') || el.classList?.contains('st-check-all')) sync();
  }
  function clear() {
    boxes().forEach((b) => { b.checked = false; });
    sync();
  }

  const ids = sel.join(',');

  return (
    <div
      ref={rootRef}
      className="st-group st-list-wrap"
      data-hide={hidden.join(' ') || undefined}
      data-bulk={canBulk ? '' : undefined}
      onChange={onChange}
    >
      <div className="st-tools">
        {canBulk && sel.length > 0 ? (
          <div className="st-bulk" role="status">
            <b>{tr(t.selected, { n: sel.length })}</b>
            <Link href={`/app/revaluation?ids=${ids}`} className="btn btn-sm btn-tinted">{t.bulkReval}</Link>
            <Link href={`/app/write-off?ids=${ids}`} className="btn btn-sm btn-tinted">{t.bulkWriteOff}</Link>
            <button type="button" className="btn btn-sm btn-ghost" onClick={clear}>{t.clearSel}</button>
          </div>
        ) : <span />}
        <div className="st-tools-r">
          {columns.length > 0 && (
            <details className="st-cols">
              <summary className="btn btn-sm btn-ghost btn-with-icon"><Icon name="settings" size={16} /> {t.columns}</summary>
              <div className="st-cols-pop">
                {columns.map((c) => (
                  <label key={c.key}>
                    <input type="checkbox" checked={!hidden.includes(c.key)} onChange={() => toggleCol(c.key)} />
                    {c.label}
                  </label>
                ))}
              </div>
            </details>
          )}
          {exportHref && (
            <a href={exportHref} className="btn btn-sm btn-ghost btn-with-icon"><Icon name="download" size={16} /> {t.download}</a>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
