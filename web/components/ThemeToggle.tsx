'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/icons/Icon';
import '@/components/auth/auth.css';

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
  if (!mounted) return <button type="button" className="theme-toggle au-round" aria-hidden tabIndex={-1} suppressHydrationWarning />;

  return (
    <button
      type="button"
      className="theme-toggle au-round"
      onClick={toggle}
      title={theme === 'dark' ? 'Yorug‘ rejim' : 'Qorong‘i rejim'}
      aria-label={theme === 'dark' ? 'Yorug‘ rejimga o‘tish' : 'Qorong‘i rejimga o‘tish'}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
    </button>
  );
}
