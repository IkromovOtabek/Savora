/**
 * Bildirishnomalar — SOF yordamchilar (React / React Native importsiz, `node --test` bilan tekshiriladi):
 * web yo'li → ilova ekrani, «5 daqiqa oldin», tur bo'yicha ikonka/rang kaliti.
 * Server: web/lib/notify.ts (GET/POST /api/mobile/notifications). Ekran — app/notifications.tsx,
 * push bosilganda — lib/push.ts → pushUrlOf.
 * Faqat o'chiriladigan TS sintaksisi (enum/namespace yo'q) — Node type stripping bilan to'g'ridan-to'g'ri ishlaydi.
 */

export type NotifyKind = 'lowStock' | 'dishLow' | 'waiterCall' | 'billCall' | 'reservationSoon';

/** Server javobi (web/lib/notifyView.ts → NotificationView) */
export interface NotificationItem {
  id: string;
  kind: NotifyKind | string;
  params: Record<string, string | number | null>;
  url: string | null;
  createdAt: string;
  read: boolean;
  handled: boolean;
  title: string;
  body: string;
}

export interface NotificationList {
  serverTime: string;
  unread: number;
  items: NotificationItem[];
}

/** Ilovadagi ekranlar (expo-router yo'llari) */
export type NotifyRoute = '/tables' | '/reservations' | '/(tabs)/products' | '/notifications';

/**
 * Server web yo'lini yuboradi ('/app/...') — ilovadagi mos ekran. Mos ekran yo'q — null
 * (ro'yxatda faqat o'qildi bo'ladi; push bosilganda — bildirishnomalar ro'yxati).
 */
export function notifyRouteOf(url: string | null | undefined): NotifyRoute | null {
  if (typeof url !== 'string') return null;
  const path = url.split('?')[0].replace(/\/+$/, '');
  if (path === '/app/tables' || path.startsWith('/app/tables/')) return '/tables';
  // Bron eslatmasi (reservationSoon) — bronlar ekrani (mobile/app/reservations.tsx)
  if (path === '/app/restaurant/reservations') return '/reservations';
  // Ombor (kam qoldiq) va menyu (taomga oz porsiya) — ilovada «Ombor» tabi (xom ashyo qoldig'i)
  if (path === '/app/products' || path.startsWith('/app/products/') || path === '/app/menu' || path.startsWith('/app/menu/')) return '/(tabs)/products';
  return null;
}

/** Push bosilganda: ilova ichidagi yo'l ('/app/...') — mos ekran, bo'lmasa bildirishnomalar ro'yxati; boshqa — null */
export function pushTargetOf(url: string | null | undefined): NotifyRoute | null {
  if (typeof url !== 'string' || !(url === '/app' || url.startsWith('/app/'))) return null;
  return notifyRouteOf(url) ?? '/notifications';
}

/** Ohang: chaqiruv (shoshilinch), ombor, boshqa — ikonka va rang shundan */
export type NotifyTone = 'call' | 'stock' | 'info';

export function notifyToneOf(kind: string): NotifyTone {
  if (kind === 'waiterCall' || kind === 'billCall') return 'call';
  if (kind === 'lowStock' || kind === 'dishLow') return 'stock';
  return 'info';
}

/** Ionicons nomi (tur bo'yicha) */
export function notifyIconOf(kind: string): string {
  switch (kind) {
    case 'waiterCall': return 'person';
    case 'billCall': return 'receipt';
    case 'lowStock': return 'cube';
    case 'dishLow': return 'restaurant';
    case 'reservationSoon': return 'calendar';
    default: return 'notifications';
  }
}

export interface AgoDict { justNow: string; minutesAgo: string; hoursAgo: string; daysAgo: string }

const MIN = 60_000;
const HOUR = 60 * MIN;

/** «Hozirgina» / «5 daqiqa oldin» / «2 soat oldin» / «3 kun oldin» (`now` — server soatiga moslangan) */
export function agoText(t: AgoDict, iso: string, now: number): string {
  const ms = Math.max(0, now - new Date(iso).getTime());
  const fill = (s: string, n: number) => s.replace('{n}', String(n));
  if (!Number.isFinite(ms) || ms < MIN) return t.justNow;
  if (ms < HOUR) return fill(t.minutesAgo, Math.floor(ms / MIN));
  if (ms < 24 * HOUR) return fill(t.hoursAgo, Math.floor(ms / HOUR));
  return fill(t.daysAgo, Math.floor(ms / (24 * HOUR)));
}

/** Badge matni: 0 — yo'q, 99 dan ko'p — «99+» */
export function badgeText(n: number): string | null {
  if (!(n > 0)) return null;
  return n > 99 ? '99+' : String(Math.floor(n));
}
