'use client';

import { useEffect, useState } from 'react';
import Icon, { type IconName } from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import '@/components/auth/auth.css';

/** Kun (yorug') → Tun (to'q ko'k) → Qora (OLED) — logoning 3 varianti */
type Theme = 'light' | 'dark' | 'black';
const ORDER: Theme[] = ['light', 'dark', 'black'];
const ICON: Record<Theme, IconName> = { light: 'sun', dark: 'moon', black: 'contrast' };

function applyTheme(t: Theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', t !== 'light');
  root.classList.toggle('qora', t === 'black');
  try { localStorage.setItem('theme', t); } catch {}
}

function currentTheme(): Theme {
  const c = document.documentElement.classList;
  return c.contains('qora') ? 'black' : c.contains('dark') ? 'dark' : 'light';
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);
  const d = useDict();

  useEffect(() => {
    // Joriy holat <html> klasslaridan — sukut qoidasi (panelda Tun) layout skriptida
    setTheme(currentTheme());
    setMounted(true);
  }, []);

  function toggle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    applyTheme(next);
  }

  // Hydration mosligi uchun mount bo'lguncha bo'sh joy
  if (!mounted) return <button type="button" className="theme-toggle au-round" aria-hidden tabIndex={-1} suppressHydrationWarning />;

  const name = { light: d.common.themeLight, dark: d.common.themeDark, black: d.common.themeBlack }[theme];
  return (
    <button
      type="button"
      className="theme-toggle au-round"
      onClick={toggle}
      title={`${d.common.switchTheme}: ${name}`}
      aria-label={`${d.common.switchTheme} (${name})`}
    >
      <Icon name={ICON[theme]} size={17} />
    </button>
  );
}
