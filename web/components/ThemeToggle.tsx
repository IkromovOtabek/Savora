'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
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
  const d = useDict();

  useEffect(() => {
    // Joriy holat <html class="dark"> dan olinadi — sukut qoidasi (panelda qorong'i) layout skriptida
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
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
      title={theme === 'dark' ? d.common.lightMode : d.common.darkMode}
      aria-label={theme === 'dark' ? d.common.toLightMode : d.common.toDarkMode}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
    </button>
  );
}
