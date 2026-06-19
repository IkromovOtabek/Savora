'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/icons/Icon';

type Theme = 'light' | 'dark';

function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  try { localStorage.setItem('theme', t); } catch {}
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = (typeof localStorage !== 'undefined' && localStorage.getItem('theme')) as Theme | null;
    const initial: Theme = stored ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(initial);
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  }

  // Hydration mosligi uchun mount bo'lguncha bo'sh joy
  if (!mounted) return <button className="theme-toggle" aria-hidden suppressHydrationWarning />;

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      title={theme === 'dark' ? 'Yorug‘ rejim' : 'Qorong‘i rejim'}
      aria-label="Temani almashtirish"
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
    </button>
  );
}
