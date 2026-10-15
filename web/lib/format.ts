// Deterministik formatlar — server (Node ICU) va brauzer ICU bir xil natija berishi uchun.
// Intl.NumberFormat('uz-UZ') ikki muhitda har xil ajratuvchi berib, client komponentlarda
// hydration xatosini keltirib chiqarardi ("2 916 666" vs "2,916,666").

const NBSP = ' '; // uzluksiz bo'shliq — raqam qatorga bo'linmaydi

/** Minglik ajratuvchi doim uzluksiz-bo'shliq. Masalan: 2916666 -> "2 916 666". */
export function fmtMoney(n: number): string {
  const neg = n < 0;
  const digits = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return neg ? `-${digits}` : digits;
}

const pad = (x: number) => String(x).padStart(2, '0');

/** DD.MM.YYYY — muhitdan mustaqil. */
export function fmtDate(d: Date | string): string {
  const dt = new Date(d);
  return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()}`;
}

/** DD.MM.YYYY, HH:MM — muhitdan mustaqil. */
export function fmtDateTime(d: Date | string): string {
  const dt = new Date(d);
  return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()}, ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

/** Pul summasi — faqat butun so'm (kasr, manfiy, noto'g'ri qiymat → null) */
export function parsePrice(v: string): number | null {
  const n = Number(String(v).replace(/\s/g, ''));
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
}
