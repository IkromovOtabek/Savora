/**
 * E-commerce katalogi «iflos» belgisi: mahsulot sxemasi ilgaklari (models/tenant/Product.ts) shu yerni chaqiradi.
 *
 * Model fayli sinxronlash moduliga to'g'ridan-to'g'ri bog'lanmaydi (aylanma import: Product → sync → tenantDb →
 * Product) — sync faqat kerak bo'lganda dinamik yuklanadi. Bir do'konning ketma-ket yozuvlari bitta qayta
 * yig'ishga birlashadi (DEBOUNCE_MS). Xato bo'lsa jim: katalog o'z-o'zini davriy to'liq yig'ish bilan tiklaydi.
 */
const DEBOUNCE_MS = 2500;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Testlarda (vitest) va build paytida o'chiq — fon taymerlari ochiq qolmasin */
function disabled(): boolean {
  return process.env.NODE_ENV === 'test' || !!process.env.VITEST || process.env.NEXT_PHASE === 'phase-production-build';
}

export function markEcomDirty(dbName: string | undefined | null): void {
  if (!dbName || disabled()) return;
  const prev = timers.get(dbName);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => {
    timers.delete(dbName);
    void import('./sync')
      .then((m) => m.syncListingsForDb(dbName))
      .catch(() => { /* sync o'zi logError qiladi */ });
  }, DEBOUNCE_MS);
  // Jarayonni faqat shu taymer uchun tirik ushlab turmaydi
  if (typeof t === 'object' && t && 'unref' in t) t.unref();
  timers.set(dbName, t);
}
