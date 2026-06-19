export function fmtMoney(n: number): string {
  return new Intl.NumberFormat('uz-UZ').format(n);
}

export function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtDateTime(d: Date | string): string {
  return new Date(d).toLocaleString('uz-UZ', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function parsePrice(v: string): number | null {
  const n = Number(String(v).replace(/\s/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}
