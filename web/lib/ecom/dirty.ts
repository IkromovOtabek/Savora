/**
 * E-commerce katalogi «iflos» belgisi: mahsulot sxemasi ilgaklari (models/tenant/Product.ts) shu yerni chaqiradi.
 *
 * Model fayli sinxronlash moduliga to'g'ridan-to'g'ri bog'lanmaydi (aylanma import: Product → sync → tenantDb →
 * Product) — sync faqat kerak bo'lganda dinamik yuklanadi. Bir do'konning ketma-ket yozuvlari bitta qayta
 * yig'ishga birlashadi (DEBOUNCE_MS). Xato bo'lsa jim: katalog o'z-o'zini davriy to'liq yig'ish bilan tiklaydi.
 */
const DEBOUNCE_MS = 2500;
/**
 * Kechiktirishning yuqori chegarasi: kassa ketma-ket sotsa (har sotuv Product'ga yozadi) taymer har safar qayta
 * boshlanib, katalog umuman yangilanmay qolardi — birinchi belgidan ko'pi bilan shuncha vaqtda yig'iladi.
 */
const MAX_WAIT_MS = 15_000;
const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; since: number }>();

/** Testlarda (vitest) va build paytida o'chiq — fon taymerlari ochiq qolmasin */
function disabled(): boolean {
  return process.env.NODE_ENV === 'test' || !!process.env.VITEST || process.env.NEXT_PHASE === 'phase-production-build';
}

/**
 * Keyingi yig'ishgacha kutish (sof — testlanadi): null — mavjud taymer o'z vaqtida ishlaydi (qayta boshlanmaydi).
 * since — shu to'plamdagi birinchi belgi vaqti (yo'q bo'lsa — hozir).
 */
export function dirtyDelay(since: number | undefined, now: number): number | null {
  if (since === undefined) return DEBOUNCE_MS;
  const left = since + MAX_WAIT_MS - now;
  if (left <= DEBOUNCE_MS) return null;
  return DEBOUNCE_MS;
}

export function markEcomDirty(dbName: string | undefined | null): void {
  if (!dbName || disabled()) return;
  const now = Date.now();
  const prev = pending.get(dbName);
  const delay = dirtyDelay(prev?.since, now);
  if (delay === null) return;
  if (prev) clearTimeout(prev.timer);
  const t = setTimeout(() => {
    pending.delete(dbName);
    void import('./sync')
      .then((m) => m.syncListingsForDb(dbName))
      .catch(() => { /* sync o'zi logError qiladi */ });
  }, delay);
  // Jarayonni faqat shu taymer uchun tirik ushlab turmaydi
  if (typeof t === 'object' && t && 'unref' in t) t.unref();
  pending.set(dbName, { timer: t, since: prev?.since ?? now });
}
