import { getMasterModels } from './masterDb';
import { BlacklistReason, BLACKLIST_REASON_LABELS } from './models/master/ImeiBlacklist';

export interface BlacklistHit {
  imei: string;
  reason: BlacklistReason;
  reasonLabel: string;
  orgName: string;
  customerName?: string;
  customerPhone?: string;
  note?: string;
  createdAt: string;
}

function normImei(s: string): string {
  return s.trim().toUpperCase().replace(/\s/g, '');
}

/** Berilgan IMEI'lar ichidan qora ro'yxatdagilarni qaytaradi (hal qilinmaganlar) */
export async function checkImeiBlacklist(imeis: string[]): Promise<Map<string, BlacklistHit>> {
  const result = new Map<string, BlacklistHit>();
  const clean = [...new Set(imeis.map(normImei).filter(Boolean))];
  if (clean.length === 0) return result;
  try {
    const { ImeiBlacklist } = await getMasterModels();
    const docs = await ImeiBlacklist.find({ imei: { $in: clean }, resolved: false })
      .sort({ createdAt: -1 })
      .lean();
    for (const d of docs) {
      if (result.has(d.imei)) continue; // eng yangisi (sort -1)
      result.set(d.imei, {
        imei: d.imei,
        reason: d.reason,
        reasonLabel: BLACKLIST_REASON_LABELS[d.reason],
        orgName: d.orgName,
        customerName: d.customerName,
        customerPhone: d.customerPhone,
        note: d.note,
        createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : '',
      });
    }
  } catch {
    /* xatoda bo'sh — qidiruvni bloklamaymiz */
  }
  return result;
}

/** Bitta IMEI qora ro'yxatdami? */
export async function isImeiBlacklisted(imei: string): Promise<BlacklistHit | null> {
  const map = await checkImeiBlacklist([imei]);
  return map.get(normImei(imei)) ?? null;
}

export { normImei };
