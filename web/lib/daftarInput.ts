import { normalizePhone, isValidUzPhone } from '@/lib/sms';
import type { LedgerType } from '@/lib/models/tenant/LedgerEntry';

/** Daftar yozuvi — mobil API kiritmasini tekshirish (web forma bilan bir xil qoidalar: actions/daftar.ts) */
export interface LedgerInput {
  type: LedgerType;
  personName: string;
  personPhone: string;
  amount: number;
  dueDate: Date;
  note?: string;
}

export function parseLedgerInput(raw: unknown, now = new Date()): { ok: true; data: LedgerInput } | { ok: false; error: string } {
  const o = (raw ?? {}) as Record<string, unknown>;
  const type: LedgerType = o.type === 'taken' ? 'taken' : 'given';
  const personName = String(o.personName ?? '').trim().replace(/\s+/g, ' ');
  if (!personName) return { ok: false, error: 'Ismni kiriting.' };
  if (personName.length > 80) return { ok: false, error: 'Ism juda uzun (80 belgigacha).' };
  // Bu raqamga eslatma yuboriladi — faqat O'zbekiston mobil raqami
  const personPhone = normalizePhone(String(o.personPhone ?? ''));
  if (!isValidUzPhone(personPhone)) return { ok: false, error: 'Telefon raqam noto\'g\'ri.' };
  const amount = Number(o.amount);
  if (!Number.isInteger(amount) || amount < 1 || amount > 1e12) return { ok: false, error: 'Summa noto\'g\'ri.' };
  const due = new Date(String(o.dueDate ?? ''));
  if (Number.isNaN(due.getTime())) return { ok: false, error: 'Qaytarish sanasini kiriting.' };
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  if (due < todayStart) return { ok: false, error: 'Qaytarish sanasi o\'tib ketgan.' };
  const note = String(o.note ?? '').trim();
  if (note.length > 300) return { ok: false, error: 'Izoh juda uzun (300 belgigacha).' };
  return { ok: true, data: { type, personName, personPhone, amount, dueDate: due, note: note || undefined } };
}
