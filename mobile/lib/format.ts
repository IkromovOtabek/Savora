/** Formatlash yordamchilari — muhitdan mustaqil (Intl'siz). Tilga bog'liq matn lug'atdan (lib/i18n). */
import { getDict, tr, type Locale } from './i18n';

export type PayType = 'cash' | 'debt' | 'installment' | 'bank_credit';

/** To'lov turlari — butun ilovada yagona nomlar (joriy til). */
export const payLabels = (locale?: Locale): Record<PayType, string> => getDict(locale).format.pay;
export const payLabel = (t: string, locale?: Locale) => payLabels(locale)[t as PayType] ?? t;

/** To'lov usuli — pul qanday kelgani (web lib/payMethods bilan bir xil) */
export const PAY_METHODS = ['cash', 'uzcard', 'humo', 'click', 'payme'] as const;
export type PayMethod = (typeof PAY_METHODS)[number];
export const payMethodLabel = (m: string | null | undefined, locale?: Locale) =>
  getDict(locale).format.payMethod[(m as PayMethod) || 'cash'] ?? getDict(locale).format.payMethod.cash;

const group3 = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** 1234567 → "1 234 567" (suffix: true → "1 234 567 so'm"). */
export function fmtMoney(n: number | null | undefined, opts: { suffix?: boolean | string; locale?: Locale } = {}): string {
  const v = Math.round(Number(n) || 0);
  const s = (v < 0 ? '−' : '') + group3(String(Math.abs(v)));
  if (!opts.suffix) return s;
  return `${s} ${typeof opts.suffix === 'string' ? opts.suffix : getDict(opts.locale).format.currency}`;
}

/** Ixcham: 6 400 000 → "6,4 mln", 1 250 000 000 → "1,3 mlrd". */
export function fmtCompact(n: number | null | undefined, locale?: Locale): string {
  const v = Math.round(Number(n) || 0);
  const a = Math.abs(v);
  const f = getDict(locale).format;
  const one = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',');
  if (a >= 1e9) return `${one(v / 1e9)} ${f.mlrd}`;
  if (a >= 1e6) return `${one(v / 1e6)} ${f.mln}`;
  return fmtMoney(v);
}

/** Faqat raqamlar. */
export const digits = (v: string) => v.replace(/\D/g, '');
/** Kiritish maydoni uchun: "1234567" → "1 234 567". */
export const grouped = (v: string) => group3(digits(v));

/** Sana: DD.MM.YYYY */
export function fmtDate(d?: string | Date | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(dt.getDate())}.${p(dt.getMonth() + 1)}.${dt.getFullYear()}`;
}

/** "18.10.2026, 14:05" — oflayn sotuv vaqti, katalog sanasi */
export function fmtDateTime(d?: string | Date | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  const p = (x: number) => String(x).padStart(2, '0');
  return `${fmtDate(dt)}, ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

/** "15-oktabr" (ru: "15 октября") */
export function fmtDayMonth(d?: string | Date | null, locale?: Locale): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  const f = getDict(locale).format;
  return tr(f.dayMonth, { d: dt.getDate(), m: f.months[dt.getMonth()] });
}

/** "PAYSHANBA, 15-OKTABR" */
export function fmtEyebrow(d: Date = new Date(), locale?: Locale): string {
  return `${getDict(locale).format.weekdays[d.getDay()]}, ${fmtDayMonth(d, locale)}`.toUpperCase();
}

export function greeting(d: Date = new Date(), locale?: Locale): string {
  const h = d.getHours();
  const f = getDict(locale).format;
  if (h < 11) return f.greetingMorning;
  if (h < 18) return f.greetingDay;
  return f.greetingEvening;
}

export function startOfToday(): number {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
}
export function isToday(d?: string | Date | null): boolean {
  if (!d) return false;
  const t = new Date(d).getTime();
  const s = startOfToday();
  return t >= s && t < s + 86400000;
}
export function isOverdue(d?: string | Date | null): boolean {
  if (!d) return false;
  return new Date(d).getTime() < startOfToday();
}

/** Telefon: 9 ta raqam (operator + raqam). "+998 " prefiksi alohida ko'rsatiladi. */
export function phoneLocal(v: string): string {
  let d = digits(v);
  if (d.startsWith('998') && d.length > 9) d = d.slice(3);
  return d.slice(0, 9);
}
/** "901234567" → "90 123 45 67" */
export function fmtPhoneLocal(local: string): string {
  const d = phoneLocal(local);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  return parts.join(' ');
}
/** Server uchun: "+998901234567" */
export const phoneE164 = (local: string) => `+998${phoneLocal(local)}`;

/** Ism-familiyadan bosh harflar: "Nodira Alimova" → "NA". */
export function initials(name?: string | null): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}
