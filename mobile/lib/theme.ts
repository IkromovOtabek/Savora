import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Yorqin palitra (BILLZ uslubi) — tiniq ko'k urg'u, oltin faqat nasiya/pul urg'ulari uchun,
 * yashil/qizil faqat holat uchun. Ikki rejimda ham ranglar to'yingan va yorqin.
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
  /** Hero karta gradienti (yuqori → past) */
  hero: string; hero2: string;
  /** Ikonka ranglari: b ko'k, a oltin, o yashil, r qizil, g kulrang, p binafsha, t moviy */
  sq: { b: string; a: string; o: string; r: string; g: string; p: string; t: string };
  shadow: string;
}

const SQ = { b: '#2F6BFF', a: '#FFA800', o: '#12B76A', r: '#F04438', g: '#8E99AE', p: '#7A5AF8', t: '#0BA5EC' };

export const light: Palette = {
  bg: '#F2F4F8', cell: '#FFFFFF', fill: 'rgba(120,130,160,0.12)', fill2: 'rgba(120,130,160,0.07)', fill3: 'rgba(120,130,160,0.2)',
  sep: 'rgba(60,70,100,0.12)', bar: '#FFFFFF',
  ink: '#0B1220', ink2: 'rgba(30,40,65,0.78)', ink3: 'rgba(60,70,95,0.6)',
  tint: '#2F6BFF', tintSoft: 'rgba(47,107,255,0.12)', tintFill: '#2F6BFF',
  gold: '#E59700', goldSoft: 'rgba(255,176,32,0.16)',
  ok: '#0FA968', okSoft: 'rgba(18,183,106,0.13)',
  bad: '#F04438', badSoft: 'rgba(240,68,56,0.12)',
  warn: '#E08A00', warnSoft: 'rgba(247,144,9,0.16)',
  onTint: '#FFFFFF',
  hero: '#4F8BFF', hero2: '#2257F0',
  sq: SQ,
  shadow: '#0B1220',
};

/** Qorong'i — neytral ko'mir-kulrang sirtlar, urg'ular o'sha yorqin ranglar */
export const dark: Palette = {
  bg: '#1C1D20', cell: '#2A2B2F', fill: 'rgba(255,255,255,0.08)', fill2: 'rgba(255,255,255,0.05)', fill3: 'rgba(255,255,255,0.13)',
  sep: 'rgba(255,255,255,0.08)', bar: '#26272B',
  ink: '#F5F6F8', ink2: 'rgba(245,246,248,0.8)', ink3: '#A3A7B0',
  tint: '#6E9BFF', tintSoft: 'rgba(92,141,255,0.18)', tintFill: '#2F6BFF',
  gold: '#FFC24D', goldSoft: 'rgba(255,194,77,0.18)',
  ok: '#32D583', okSoft: 'rgba(50,213,131,0.16)',
  bad: '#FF6B5F', badSoft: 'rgba(255,107,95,0.16)',
  warn: '#FDB022', warnSoft: 'rgba(253,176,34,0.18)',
  onTint: '#FFFFFF',
  hero: '#4F8BFF', hero2: '#2257F0',
  sq: { ...SQ, g: '#667085' },
  shadow: '#000000',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
export const radius = { sm: 10, md: 14, lg: 18, xl: 22, xxl: 26, pill: 999 } as const;

/** Tipografiya — Onest (components/ui/Text), BILLZ'dagidek yirikroq shkala. */
export const type = {
  largeTitle: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -0.9, lineHeight: 40 },
  title2: { fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.6, lineHeight: 32 },
  title3: { fontSize: 21, fontWeight: '700' as const, letterSpacing: -0.3 },
  headline: { fontSize: 18, fontWeight: '700' as const, letterSpacing: -0.2 },
  body: { fontSize: 16, fontWeight: '400' as const, letterSpacing: -0.1 },
  bodyStrong: { fontSize: 16, fontWeight: '600' as const, letterSpacing: -0.1 },
  callout: { fontSize: 15, fontWeight: '600' as const },
  footnote: { fontSize: 14, fontWeight: '500' as const },
  caption: { fontSize: 13, fontWeight: '600' as const },
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
  // Sukut — yorug' (asosiy mavzu); foydalanuvchi tanlovi AsyncStorage'dan tiklanadi
  const [mode, setModeState] = useState<ThemeMode>('light');

  useEffect(() => {
    AsyncStorage.getItem(MODE_KEY)
      .then((v) => { if (v === 'light' || v === 'dark' || v === 'system') setModeState(v); })
      .catch(() => { /* saqlangan tanlov o'qilmasa — yorug' */ });
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(MODE_KEY, m).catch(() => { /* keyingi ochilishda sukut (yorug') */ });
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
