import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * "Samarqand" palitrasi — iOS Human Interface uslubi.
 * Kobalt urg'u (tint), oltin (gold) faqat nasiya/pul urg'ulari uchun.
 */
export interface Palette {
  bg: string; cell: string; fill: string; fill2: string; fill3: string; sep: string; bar: string;
  ink: string; ink2: string; ink3: string;
  /** tint — matn/ikonka urg'usi; tintFill — oq matnli to'ldirilgan fon (kontrast ≥ 4.5:1) */
  tint: string; tintSoft: string; tintFill: string;
  gold: string; goldSoft: string;
  ok: string; okSoft: string;
  bad: string; badSoft: string;
  warn: string; warnSoft: string;
  onTint: string;
  /** Hero karta (ko'k) */
  hero: string;
  /** Ikon kvadratlari — har ikki rejimda bir xil to'q ranglar */
  sq: { b: string; a: string; o: string; r: string; g: string };
  shadow: string;
}

export const light: Palette = {
  bg: '#F1F2F5', cell: '#FFFFFF', fill: 'rgba(118,128,160,0.14)', fill2: 'rgba(118,128,160,0.08)', fill3: 'rgba(118,128,160,0.22)',
  sep: 'rgba(60,70,100,0.14)', bar: '#FFFFFF',
  ink: '#0D1526', ink2: 'rgba(40,50,75,0.75)', ink3: 'rgba(55,65,95,0.62)',
  tint: '#1F4FA8', tintSoft: 'rgba(31,79,168,0.12)', tintFill: '#1F4FA8',
  gold: '#B98410', goldSoft: 'rgba(224,165,38,0.16)',
  ok: '#17804C', okSoft: 'rgba(26,138,82,0.13)',
  bad: '#C7332A', badSoft: 'rgba(208,54,43,0.12)',
  warn: '#A0650A', warnSoft: 'rgba(224,165,38,0.2)',
  onTint: '#FFFFFF',
  hero: '#2A5BB8',
  sq: { b: '#1F4FA8', a: '#D69A17', o: '#1A8A52', r: '#D0362B', g: '#8A93A8' },
  shadow: '#0D1526',
};

/** Qorong'i — asosiy mavzu: neytral ko'mir-kulrang sirtlar (web panel bilan bir xil) */
export const dark: Palette = {
  bg: '#202123', cell: '#2C2D30', fill: 'rgba(255,255,255,0.08)', fill2: 'rgba(255,255,255,0.05)', fill3: 'rgba(255,255,255,0.13)',
  sep: 'rgba(255,255,255,0.08)', bar: '#2A2B2E',
  ink: '#F4F5F7', ink2: 'rgba(244,245,247,0.8)', ink3: '#A3A6AD',
  tint: '#6B9BFF', tintSoft: 'rgba(91,142,255,0.16)', tintFill: '#2F6BE6',
  gold: '#F0BF4C', goldSoft: 'rgba(240,191,76,0.18)',
  ok: '#3FD38A', okSoft: 'rgba(63,211,138,0.16)',
  bad: '#FF6B5F', badSoft: 'rgba(255,107,95,0.16)',
  warn: '#F5B955', warnSoft: 'rgba(245,185,85,0.18)',
  onTint: '#FFFFFF',
  hero: '#2A5BB8',
  sq: { b: '#2F62C4', a: '#D69A17', o: '#1A8A52', r: '#D0362B', g: '#5E6780' },
  shadow: '#000000',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
export const radius = { sm: 10, md: 12, lg: 16, xl: 20, xxl: 24, pill: 999 } as const;

/** Tipografiya — tizim shrifti (iOS'da SF Pro). */
export const type = {
  largeTitle: { fontSize: 32, fontWeight: '700' as const, letterSpacing: -0.8, lineHeight: 38 },
  title2: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.5, lineHeight: 30 },
  title3: { fontSize: 20, fontWeight: '600' as const, letterSpacing: -0.3 },
  headline: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '400' as const, letterSpacing: -0.1 },
  bodyStrong: { fontSize: 15, fontWeight: '500' as const, letterSpacing: -0.1 },
  callout: { fontSize: 14, fontWeight: '500' as const },
  footnote: { fontSize: 13, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
};

/** Raqamlar bir xil kenglikda turishi uchun. */
export const tabular = { fontVariant: ['tabular-nums' as const] };

/** iOS'da "monospace" yo'q — Menlo ishlatamiz. */
export const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export const HAIRLINE = StyleSheet.hairlineWidth;

/** Planshetda kontent kengligi chegarasi. */
export const MAX_CONTENT = 600;

export type ThemeMode = 'system' | 'light' | 'dark';
const MODE_KEY = 'savora_theme_mode';

export interface Theme {
  c: Palette;
  dark: boolean;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  // Sukut — qorong'i (asosiy mavzu); foydalanuvchi tanlovi AsyncStorage'dan tiklanadi
  const [mode, setModeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    AsyncStorage.getItem(MODE_KEY)
      .then((v) => { if (v === 'light' || v === 'dark' || v === 'system') setModeState(v); })
      .catch(() => { /* saqlangan tanlov o'qilmasa — qorong'i */ });
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(MODE_KEY, m).catch(() => { /* keyingi ochilishda sukut (qorong'i) */ });
  }, []);

  const isDark = mode === 'system' ? scheme === 'dark' : mode === 'dark';
  const value = useMemo<Theme>(() => ({ c: isDark ? dark : light, dark: isDark, mode, setMode }), [isDark, mode, setMode]);

  return React.createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme ThemeProvider ichida bo\'lishi kerak');
  return ctx;
}

/** Mavzuga bog'liq StyleSheet — palitra o'zgarganda qayta yaratiladi. */
export function useStyles<T>(factory: (c: Palette) => T): T {
  const { c } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => factory(c), [c]);
}
