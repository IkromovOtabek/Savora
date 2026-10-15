'use client';

import { useEffect, useState } from 'react';

/** Matnni buferga nusxalash tugmasi (havolalar uchun). Tekis, iOS uslubi. */
export default function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => setDone(false), 1600);
    return () => window.clearTimeout(t);
  }, [done]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Eski brauzer / ruxsat yo'q — vaqtinchalik maydon orqali
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* e'tiborsiz */ }
      ta.remove();
    }
    setDone(true);
  }

  return (
    <button
      type="button"
      className={`sa-copy${done ? ' sa-copy--done' : ''}`}
      onClick={copy}
      aria-label={done ? 'Nusxalandi' : `${label} havolasini nusxalash`}
      title={done ? 'Nusxalandi' : 'Nusxalash'}
    >
      {done ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      )}
      <span aria-live="polite">{done ? 'Nusxalandi' : 'Nusxa'}</span>
    </button>
  );
}
