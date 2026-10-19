import type { Model } from 'mongoose';
import type { IShopSettings } from './models/tenant/ShopSettings';
import { getShopSettings, saveShopSettingsPart, type ShopSettings } from './shopSettings';
import { logError } from './logger';
import { usdToSom } from './currencyMath';

export { usdToSom };

/** Markaziy bank (cbu.uz) — ochiq API, kalit talab qilinmaydi */
export const CBU_USD_URL = 'https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/';
/** CBU kursi shu muddatdan eski bo'lsa — qayta so'raladi (bank kuniga bir marta e'lon qiladi) */
export const CBU_TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
const RETRY_AFTER_FAIL_MS = 10 * 60 * 1000;
const lastFailAt = new Map<string, number>();

export interface CbuRate { rate: number; date: string }

/** CBU javobidan USD kursi: [{ Ccy: 'USD', Rate: '12055.90', Date: '17.10.2026' }] → { rate, date: '2026-10-17' } */
export function parseCbuResponse(json: unknown): CbuRate | null {
  const row = Array.isArray(json) ? json.find((x) => x && (x as { Ccy?: string }).Ccy === 'USD') : null;
  if (!row) return null;
  const rate = Number(String((row as { Rate?: unknown }).Rate ?? '').replace(',', '.'));
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String((row as { Date?: unknown }).Date ?? ''));
  if (!Number.isFinite(rate) || rate <= 0 || !m) return null;
  return { rate, date: `${m[3]}-${m[2]}-${m[1]}` };
}

export async function fetchCbuUsd(fetchImpl: typeof fetch = fetch): Promise<CbuRate | null> {
  try {
    const res = await fetchImpl(CBU_USD_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: 'no-store' });
    if (!res.ok) return null;
    return parseCbuResponse(await res.json());
  } catch {
    return null;
  }
}

/** Amaldagi kurs: qo'lda rejimda egasi kiritgani, aks holda CBU */
export function effectiveUsdRate(cur: ShopSettings['currency']): number | null {
  if (cur.rateMode === 'manual' && cur.manualRate && cur.manualRate > 0) return cur.manualRate;
  return cur.cbuRate && cur.cbuRate > 0 ? cur.cbuRate : null;
}

export interface UsdRateInfo {
  rate: number | null;
  source: 'cbu' | 'manual';
  cbuRate?: number;
  cbuDate?: string;
}

/**
 * Do'kon uchun dollar kursi. CBU kursi eskirgan bo'lsa — so'rab, saqlab qo'yadi
 * (cron shart emas; tarmoq xatosida eski kurs bilan davom etadi).
 */
export async function getUsdRate(M: Model<IShopSettings>, opts: { force?: boolean } = {}): Promise<UsdRateInfo> {
  const s = await getShopSettings(M);
  let cur = s.currency;
  const stale = !cur.cbuFetchedAt || Date.now() - new Date(cur.cbuFetchedAt).getTime() > CBU_TTL_MS;
  // cbu.uz ishlamasa — har sahifada 5 soniya kutmaslik uchun 10 daqiqa qayta urinilmaydi
  const key = M.db?.name ?? '';
  const triedRecently = Date.now() - (lastFailAt.get(key) ?? 0) < RETRY_AFTER_FAIL_MS;
  if (opts.force || (stale && !triedRecently)) {
    const fresh = await fetchCbuUsd();
    if (!fresh) lastFailAt.set(key, Date.now());
    if (fresh) {
      const patch = { cbuRate: fresh.rate, cbuDate: fresh.date, cbuFetchedAt: new Date() };
      try {
        await saveShopSettingsPart(M, 'currency', patch, '');
      } catch (e) {
        logError('getUsdRate: kursni saqlab bo\'lmadi', e);
      }
      cur = { ...cur, ...patch };
    }
  }
  return { rate: effectiveUsdRate(cur), source: cur.rateMode, cbuRate: cur.cbuRate, cbuDate: cur.cbuDate };
}
