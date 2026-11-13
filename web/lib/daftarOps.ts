import { Types } from 'mongoose';
import { recordAudit } from './audit';
import { branchFilter } from './branchScope';
import { shiftTotalsNow } from './cashShiftOps';
import { softDeleteOne } from './softDelete';
import { fmtMoney } from './format';
import { tr } from './i18n/fmt';
import type { Dict } from './i18n/dict';
import type { SessionUser } from './session';
import type { getTenantModels } from './tenantDb';
import type { LedgerInput } from './daftarInput';
import { ledgerRemaining, type LedgerType } from './models/tenant/LedgerEntry';

/**
 * Daftar amallari — web server action'lari va mobil API uchun umumiy.
 * Kirish (zod/parseLedgerInput), modul va huquq tekshiruvi — chaqiruvchida; bu yerda biznes mantiq,
 * kassa (CashFlow) bilan bog'lash va audit.
 *
 * Kassa: foydalanuvchi har safar «kassaga qo'shilsinmi?» deb so'raladi (toKassa). Ha bo'lsa:
 *   - berdim → kassadan chiqim, qaytganda → kirim;
 *   - oldim  → kassaga kirim,  qaytarganda → chiqim.
 * Yozuvlar `DAFTAR_CASH_CATEGORY` toifasida — u FinanceCategory ro'yxatida yo'q, shuning uchun sof foydaga
 * kirmaydi (qarz — xarajat ham, daromad ham emas). Smena va «Hisoblar holati» ularni filial kassasida hisoblaydi.
 */

type Models = Pick<Awaited<ReturnType<typeof getTenantModels>>, 'LedgerEntry' | 'CashFlow' | 'CashShift' | 'Sale' | 'Branch' | 'Customer'>;
type DaftarDict = Dict['sales']['daftar'];
type Actor = Pick<SessionUser, 'id' | 'username' | 'role' | 'branchId' | 'dbName'>;
export type DaftarOpResult = { ok: true; id: string } | { ok: false; error: string };

/** Daftar orqali o'tgan kassa yozuvlari toifasi (sof foydaga kirmaydi — yuqoridagi izoh) */
export const DAFTAR_CASH_CATEGORY = 'Qarz daftari';

/** Yozuv ochilganda kassa harakati: berdim — pul chiqdi, oldim — pul kirdi */
export function openingFlowType(type: LedgerType): 'income' | 'expense' {
  return type === 'given' ? 'expense' : 'income';
}

/** Qaytarishda kassa harakati — ochilishning teskarisi */
export function paymentFlowType(type: LedgerType): 'income' | 'expense' {
  return type === 'given' ? 'income' : 'expense';
}

/** Telefon raqami regex'i: oxirgi 9 raqam, oralarida har qanday ajratgich (mijoz raqami erkin formatda saqlanadi) */
export function phoneTailPattern(normalizedPhone: string): RegExp | null {
  const digits = normalizedPhone.replace(/\D/g, '');
  if (digits.length < 9) return null;
  return new RegExp(`${digits.slice(-9).split('').join('\\D*')}\\D*$`);
}

/** Telefon bo'yicha mijozni topish — faqat bitta aniq moslik bo'lsa (ikki mijozda bir raqam — bog'lanmaydi) */
export async function findCustomerIdByPhone(m: Pick<Models, 'Customer'>, normalizedPhone: string): Promise<Types.ObjectId | undefined> {
  const re = phoneTailPattern(normalizedPhone);
  if (!re) return undefined;
  const found = await m.Customer.find({ phone: re }).select('_id').limit(2).lean();
  return found.length === 1 ? (found[0]._id as Types.ObjectId) : undefined;
}

/** Qaysi filial kassasi: filial xodimi — o'zi; admin — tanlagan filial yoki yagona faol filial */
async function resolveKassaBranch(user: Actor, m: Pick<Models, 'Branch'>, k: DaftarDict, requested?: string): Promise<{ id: string } | { error: string }> {
  if (user.role === 'user') return user.branchId ? { id: user.branchId } : { error: k.kassaPickBranch };
  if (requested) {
    if (!Types.ObjectId.isValid(requested)) return { error: k.kassaPickBranch };
    return (await m.Branch.exists({ _id: requested, active: true })) ? { id: requested } : { error: k.kassaPickBranch };
  }
  const list = await m.Branch.find({ active: true }).select('_id').limit(2).lean();
  return list.length === 1 ? { id: String(list[0]._id) } : { error: k.kassaPickBranch };
}

type KassaTarget = { branchId: string; shiftId?: Types.ObjectId };

/** Kassani tayyorlash: filial + ochiq smena; chiqimda ochiq smenadagi naqddan oshmasin */
async function prepareKassa(
  user: Actor, m: Models, k: DaftarDict,
  { requestedBranch, flowType, amount }: { requestedBranch?: string; flowType: 'income' | 'expense'; amount: number },
): Promise<KassaTarget | { error: string }> {
  const b = await resolveKassaBranch(user, m, k, requestedBranch);
  if ('error' in b) return b;
  const shift = await m.CashShift.findOne({ branchId: b.id, status: 'open' }).lean();
  if (shift && flowType === 'expense') {
    const { current } = await shiftTotalsNow(m, shift);
    if (amount > current) return { error: tr(k.kassaTooMuch, { v: fmtMoney(current) }) };
  }
  return { branchId: b.id, shiftId: shift?._id as Types.ObjectId | undefined };
}

export async function createLedgerEntry(
  user: Actor, m: Models, k: DaftarDict,
  input: LedgerInput & { toKassa: boolean; kassaBranchId?: string; via?: string },
): Promise<DaftarOpResult> {
  const { type, personName, personPhone, amount, dueDate, note, via = '' } = input;
  const flowType = openingFlowType(type);

  let kassa: KassaTarget | null = null;
  if (input.toKassa) {
    const r = await prepareKassa(user, m, k, { requestedBranch: input.kassaBranchId, flowType, amount });
    if ('error' in r) return { ok: false, error: r.error };
    kassa = r;
  }

  const customerId = await findCustomerIdByPhone(m, personPhone).catch(() => undefined);
  let id: string;
  try {
    const entry = await m.LedgerEntry.create({
      type, personName, personPhone, amount, dueDate,
      note: note || undefined,
      status: 'open',
      paidAmount: 0,
      payments: [],
      customerId,
      kassaBranchId: kassa?.branchId,
      branchId: user.branchId || undefined,
      createdBy: user.username,
      createdByUserId: user.id,
    });
    id = String(entry._id);
  } catch {
    return { ok: false, error: k.saveFailed };
  }

  if (kassa) {
    try {
      await m.CashFlow.create({
        type: flowType,
        amount,
        description: tr(type === 'given' ? k.flowGiven : k.flowTaken, { name: personName }),
        category: DAFTAR_CASH_CATEGORY,
        branchId: kassa.branchId,
        shiftId: kassa.shiftId,
        recordedBy: user.username,
        ledgerEntryId: id,
      });
    } catch {
      // Kassa yozilmadi — daftar yozuvi ham qolmasin (yarim holat bo'lmasin)
      await m.LedgerEntry.deleteOne({ _id: id }).catch(() => {});
      return { ok: false, error: k.saveFailed };
    }
  }

  await recordAudit(user, {
    action: 'daftar.create',
    entity: 'finance',
    entityId: id,
    summary: `Daftar: ${type === 'given' ? 'qarz berildi' : 'qarz olindi'} — ${personName}, ${fmtMoney(amount)} so'm${kassa ? ' (kassa orqali)' : ''}${via}`,
    meta: { type, amount, toKassa: !!kassa, kassaBranchId: kassa?.branchId },
  });
  return { ok: true, id };
}

/**
 * Qaytarish — to'liq (`amount` berilmasa — butun qoldiq) yoki qisman. Qoldiq 0 bo'lsa yozuv yopiladi.
 * `paidAmount` sharti bilan atomik: ikki marta bosish yoki parallel so'rov qoldiqdan ortiq yozmaydi.
 */
export async function addLedgerPayment(
  user: Actor, m: Models, k: DaftarDict,
  { id, amount, toKassa, kassaBranchId, via = '' }: { id: string; amount?: number; toKassa: boolean; kassaBranchId?: string; via?: string },
): Promise<DaftarOpResult> {
  const entry = await m.LedgerEntry.findOne({ _id: id, ...branchFilter(user), status: 'open' }).lean();
  if (!entry) return { ok: false, error: k.notFound };
  const remaining = ledgerRemaining(entry);
  const pay = amount ?? remaining;
  if (!Number.isSafeInteger(pay) || pay < 1) return { ok: false, error: k.payBad };
  if (pay > remaining) return { ok: false, error: tr(k.payTooMuch, { v: fmtMoney(remaining) }) };

  const flowType = paymentFlowType(entry.type);
  let kassa: KassaTarget | null = null;
  if (toKassa) {
    const r = await prepareKassa(user, m, k, {
      requestedBranch: kassaBranchId ?? (entry.kassaBranchId ? String(entry.kassaBranchId) : undefined),
      flowType,
      amount: pay,
    });
    if ('error' in r) return { ok: false, error: r.error };
    kassa = r;
  }

  const now = new Date();
  const full = pay >= remaining;
  const prevPaid = entry.paidAmount || 0;
  const updated = await m.LedgerEntry.findOneAndUpdate(
    // Eski yozuvlarda paidAmount yo'q — null ham 0 deb olinadi
    { _id: entry._id, status: 'open', paidAmount: prevPaid ? prevPaid : { $in: [0, null] } },
    {
      $push: { payments: { amount: pay, at: now, by: user.username, toKassa: !!kassa } },
      $set: { paidAmount: prevPaid + pay, ...(full ? { status: 'returned', returnedAt: now } : {}) },
    },
    { new: true },
  ).lean();
  if (!updated) return { ok: false, error: k.notFound };

  if (kassa) {
    try {
      await m.CashFlow.create({
        type: flowType,
        amount: pay,
        description: tr(entry.type === 'given' ? k.flowBack : k.flowPaid, { name: entry.personName }),
        category: DAFTAR_CASH_CATEGORY,
        branchId: kassa.branchId,
        shiftId: kassa.shiftId,
        recordedBy: user.username,
        ledgerEntryId: entry._id,
      });
    } catch {
      // Kassa yozilmadi — qaytarishni ham bekor qilamiz
      await m.LedgerEntry.updateOne(
        { _id: entry._id },
        { $pull: { payments: { at: now, by: user.username } }, $set: { paidAmount: prevPaid, status: 'open' }, $unset: { returnedAt: '' } },
      ).catch(() => {});
      return { ok: false, error: k.saveFailed };
    }
  }

  await recordAudit(user, {
    action: 'daftar.payment',
    entity: 'finance',
    entityId: id,
    summary: `Daftar: ${entry.personName} — ${fmtMoney(pay)} so'm qaytdi${full ? ' (yopildi)' : `, qoldiq ${fmtMoney(remaining - pay)}`}${kassa ? ' (kassa orqali)' : ''}${via}`,
    meta: { amount: pay, full, toKassa: !!kassa, kassaBranchId: kassa?.branchId },
  });
  return { ok: true, id };
}

/**
 * Oxirgi qaytarishni bekor qilish (xato «qaytdi» belgisi) — yozuv qayta ochiladi.
 * Qaytarish kassa orqali bo'lgan bo'lsa, o'sha kassa yozuvi ham o'chiriladi.
 */
export async function undoLastLedgerPayment(user: Actor, m: Models, k: DaftarDict, { id, via = '' }: { id: string; via?: string }): Promise<DaftarOpResult> {
  const entry = await m.LedgerEntry.findOne({ _id: id, ...branchFilter(user) }).lean();
  if (!entry) return { ok: false, error: k.notFound };
  const last = entry.payments?.[entry.payments.length - 1];

  if (!last) {
    // Eski yozuv (to'lovlar tarixisiz) — faqat holat
    await m.LedgerEntry.updateOne({ _id: entry._id }, { $set: { status: 'open' }, $unset: { returnedAt: '' } });
  } else {
    const res = await m.LedgerEntry.updateOne(
      { _id: entry._id, paidAmount: entry.paidAmount },
      { $pop: { payments: 1 }, $set: { paidAmount: Math.max(0, (entry.paidAmount || 0) - last.amount), status: 'open' }, $unset: { returnedAt: '' } },
    );
    if (res.modifiedCount === 0) return { ok: false, error: k.notFound };
    if (last.toKassa) {
      const flow = await m.CashFlow.findOne({ ledgerEntryId: entry._id, type: paymentFlowType(entry.type), amount: last.amount })
        .sort({ createdAt: -1 }).select('_id').lean();
      if (flow) await m.CashFlow.updateOne({ _id: flow._id }, { $set: { deletedAt: new Date(), deletedBy: user.username } });
    }
  }

  await recordAudit(user, {
    action: 'daftar.reopen',
    entity: 'finance',
    entityId: id,
    summary: `Daftar: ${entry.personName} — oxirgi qaytarish bekor qilindi${last ? ` (${fmtMoney(last.amount)} so'm${last.toKassa ? ', kassadan ham' : ''})` : ''}${via}`,
  });
  return { ok: true, id };
}

/** Yozuvni o'chirish (soft-delete) — unga bog'langan kassa yozuvlari ham o'chadi, kassa avvalgi holiga qaytadi */
export async function deleteLedgerEntry(user: Actor, m: Models, k: DaftarDict, { id, via = '' }: { id: string; via?: string }): Promise<DaftarOpResult> {
  const removed = await softDeleteOne(m.LedgerEntry, { _id: id, ...branchFilter(user) }, user.username);
  if (!removed) return { ok: false, error: k.notFound };
  const flows = await m.CashFlow.updateMany(
    { ledgerEntryId: removed._id, deletedAt: null },
    { $set: { deletedAt: new Date(), deletedBy: user.username } },
  );
  await recordAudit(user, {
    action: 'daftar.delete',
    entity: 'finance',
    entityId: id,
    summary: `Daftar yozuvi o'chirildi — ${removed.personName}, ${fmtMoney(removed.amount)} so'm${flows.modifiedCount ? ` (kassa yozuvlari: ${flows.modifiedCount})` : ''}${via}`,
  });
  return { ok: true, id };
}
