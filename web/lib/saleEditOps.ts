import type { Types } from 'mongoose';
import type { getTenantModels } from './tenantDb';
import type { SessionUser } from './session';
import type { ISaleEditChange, ISaleReturn } from './models/tenant/Sale';
import { branchFilter } from './branchScope';
import { recordAudit } from './audit';
import { computeInstallmentPlan } from './installment';
import { resolveSaleCustomer, type SaleCustomerError } from './saleCustomer';
import { computePriceEdit, respreadInstallmentAmounts, type PriceEditCalc, type PriceEditError } from './saleEdit';

/**
 * Sotuvni tahrirlash — web (editSaleAction) va mobil (PATCH /api/mobile/sales/[id]) uchun umumiy.
 * Huquq chaqiruvchida: «sale.edit»; narx uchun qo'shimcha «sale.editPrice» (`canEditPrice`).
 *
 * Maydonlar (undefined — o'zgarmaydi):
 *  - customer: mijoz (ro'yxatdan tanlangan id yoki ism + telefon); null — olib tashlash (faqat qoldiqsiz naqd sotuvda).
 *    Bitta xariddagi (checkoutId) barcha tovarlarga qo'llanadi — xarid bir mijozniki bo'lib qoladi.
 *  - notes: izoh ('' — o'chirish)
 *  - dueDate: qarz muddati (null — olib tashlash) — faqat qarz / qoldiqli naqd sotuvda (nasiyada jadval bo'yicha)
 *  - totalAmount: narx — pul qoidasi lib/saleEdit (oshsa — qoldiqqa, kamaysa — avval qarzdan, ortig'i naqd qaytariladi)
 */
type Models = Pick<Awaited<ReturnType<typeof getTenantModels>>, 'Sale' | 'Customer'>;

export interface SaleEditInput {
  customer?: { id?: string; name: string; phone: string } | null;
  notes?: string;
  dueDate?: Date | null;
  totalAmount?: number;
}

export type SaleEditError =
  | 'notFound' | 'noChanges' | 'conflict' | 'pricePerm' | 'customerRequired' | 'dueNotAllowed' | 'badDate'
  | Exclude<PriceEditError, 'same'> | SaleCustomerError;

export type SaleEditResult =
  | { ok: true; saleNo: string; changes: ISaleEditChange[]; price: PriceEditCalc | null; siblings: number }
  | { ok: false; error: SaleEditError };

export const SALE_NOTES_MAX = 500;
const SNAP_MAX = 300;

const dayKey = (d?: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const custLabel = (c?: { fullName?: string; phone?: string } | null) =>
  c?.fullName || c?.phone ? [c.fullName, c.phone].filter(Boolean).join(' · ') : '';
const snap = (s: string) => s.slice(0, SNAP_MAX);
const sum = (n: number) => n.toLocaleString('uz-UZ');

export async function editSale(
  m: Models,
  user: SessionUser,
  saleId: string,
  input: SaleEditInput,
  opts: { canEditPrice: boolean },
): Promise<SaleEditResult> {
  const scope = branchFilter(user);
  const sale = await m.Sale.findOne({ _id: saleId, ...scope }).lean();
  if (!sale) return { ok: false, error: 'notFound' };
  if (sale.status === 'cancelled') return { ok: false, error: 'cancelled' };

  const changes: ISaleEditChange[] = [];
  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};
  let price: PriceEditCalc | null = null;

  // 1) Narx
  if (input.totalAmount !== undefined && input.totalAmount !== sale.totalAmount) {
    if (!opts.canEditPrice) return { ok: false, error: 'pricePerm' };
    const plan = sale.paymentType === 'installment' ? computeInstallmentPlan(sale) : null;
    const r = computePriceEdit({
      totalAmount: sale.totalAmount,
      paidAmount: sale.paidAmount,
      remainingAmount: sale.remainingAmount,
      paymentType: sale.paymentType,
      status: sale.status,
      bankParts: sale.bankParts,
      downPayment: plan?.down ?? 0,
    }, input.totalAmount);
    if (!r.ok) {
      if (r.error !== 'same') return { ok: false, error: r.error };
    } else {
      price = r.calc;
      set.totalAmount = price.newTotal;
      set.paidAmount = price.newPaid;
      set.remainingAmount = price.newRemaining;
      set.status = price.newStatus;
      if (plan) {
        // Nasiya: to'langan oylar o'zgarmaydi, farq to'lanmagan oylarga (bo'lolmasa — jadval teng bo'linadi)
        const amounts = respreadInstallmentAmounts(plan.schedule, price.newTotal - plan.down);
        if (amounts) set.installmentAmounts = amounts;
        else unset.installmentAmounts = '';
      }
      changes.push({ field: 'totalAmount', from: String(sale.totalAmount), to: String(price.newTotal) });
    }
  }
  const remainingAfter = price ? price.newRemaining : sale.remainingAmount;

  // 2) Mijoz
  let customerSet: { customerId: Types.ObjectId; customerSnapshot: { fullName: string; phone: string } } | null = null;
  let customerCleared = false;
  if (input.customer !== undefined) {
    const before = custLabel(sale.customerSnapshot);
    if (input.customer === null) {
      if (sale.customerId || before) {
        // Qarz/nasiya yoki qoldiq bor — mijozsiz qolmaydi
        if (sale.paymentType !== 'cash' || remainingAfter > 0) return { ok: false, error: 'customerRequired' };
        customerCleared = true;
        changes.push({ field: 'customer', from: snap(before), to: '' });
      }
    } else {
      const res = await resolveSaleCustomer(m, input.customer);
      if (!res.ok) return { ok: false, error: res.error };
      const c = res.customer;
      // Ism va telefon (raqamlari) bir xil — o'zgarish emas: telefon formati farqi ham, eski (mijozga
      // bog'lanmagan) sotuv ham shunday qoladi
      const digitsOf = (v?: string) => (v ?? '').replace(/\D/g, '').slice(-9);
      const same = (sale.customerSnapshot?.fullName ?? '').trim() === c.fullName.trim()
        && digitsOf(sale.customerSnapshot?.phone) === digitsOf(c.phone)
        && (!sale.customerId || String(sale.customerId) === String(c._id));
      if (!same) {
        customerSet = { customerId: c._id, customerSnapshot: { fullName: c.fullName, phone: c.phone } };
        changes.push({ field: 'customer', from: snap(before), to: snap(custLabel(c)) });
      }
    }
  }
  if (customerSet) Object.assign(set, customerSet);
  if (customerCleared) { unset.customerId = ''; unset.customerSnapshot = ''; }

  // 3) Izoh
  if (input.notes !== undefined) {
    const next = input.notes.trim().slice(0, SALE_NOTES_MAX);
    const prev = sale.notes ?? '';
    if (next !== prev) {
      if (next) set.notes = next;
      else unset.notes = '';
      changes.push({ field: 'notes', from: snap(prev), to: snap(next) });
    }
  }

  // 4) Qarz muddati
  if (input.dueDate !== undefined) {
    const next = input.dueDate;
    if (next && (Number.isNaN(next.getTime()) || next.getUTCFullYear() < 2000 || next.getUTCFullYear() > 2100)) {
      return { ok: false, error: 'badDate' };
    }
    if (dayKey(next) !== dayKey(sale.dueDate)) {
      // Nasiyada muddat — oylik jadvaldan; bank kreditida — bank bilan; to'langan sotuvda muddat yo'q (olib tashlash mumkin)
      const allowed = (sale.paymentType === 'debt' || sale.paymentType === 'cash') && (remainingAfter > 0 || !next);
      if (!allowed) return { ok: false, error: 'dueNotAllowed' };
      if (next) set.dueDate = next;
      else unset.dueDate = '';
      changes.push({ field: 'dueDate', from: dayKey(sale.dueDate), to: dayKey(next) });
    }
  }

  if (changes.length === 0) return { ok: false, error: 'noChanges' };

  const now = new Date();
  const edit = { at: now, by: user.username, changes };
  const push: Record<string, unknown> = { edits: edit };
  if (price && price.refundAmount > 0) {
    // Ortiqcha to'langan pul mijozga naqd — kassa/kirim-chiqim/foyda buni qaytarish kabi hisoblaydi (lib/kassa)
    const ret: ISaleReturn = {
      kind: 'price',
      qty: 0,
      amount: -price.delta,
      debtReduced: price.debtReduced,
      refundAmount: price.refundAmount,
      reason: `Narx o'zgartirildi: ${sum(sale.totalAmount)} → ${sum(price.newTotal)} so'm`,
      returnedAt: now,
      by: user.username,
    };
    push.returns = ret;
  }

  // Optimistik qulf: o'qilgandan beri to'lov/qaytarish bo'lmagan bo'lsagina yoziladi
  const updated = await m.Sale.findOneAndUpdate(
    {
      _id: sale._id,
      ...scope,
      status: { $ne: 'cancelled' },
      totalAmount: sale.totalAmount,
      paidAmount: sale.paidAmount,
      remainingAmount: sale.remainingAmount,
    },
    {
      ...(Object.keys(set).length ? { $set: set } : {}),
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
      $push: push,
    },
    { new: true, projection: { _id: 1 } },
  ).lean();
  if (!updated) return { ok: false, error: 'conflict' };

  // Bitta xarid — bitta mijoz: qolgan tovarlarga ham (tarixda shu o'zgarish bilan)
  let siblings = 0;
  if ((customerSet || customerCleared) && sale.checkoutId) {
    const custChange = changes.filter((c) => c.field === 'customer');
    const r = await m.Sale.updateMany(
      { checkoutId: sale.checkoutId, _id: { $ne: sale._id }, ...scope },
      {
        ...(customerSet ? { $set: customerSet } : { $unset: { customerId: '', customerSnapshot: '' } }),
        $push: { edits: { at: now, by: user.username, changes: custChange } },
      },
    );
    siblings = r.modifiedCount ?? 0;
  }

  const parts = changes.map((c) => {
    if (c.field === 'totalAmount') {
      const extra = price && price.refundAmount > 0 ? ` (mijozga qaytarildi ${sum(price.refundAmount)} so'm)` : '';
      return `narx ${sum(Number(c.from))} → ${sum(Number(c.to))} so'm${extra}`;
    }
    if (c.field === 'customer') return `mijoz: ${c.from || '—'} → ${c.to || '—'}${siblings ? ` (xariddagi yana ${siblings} ta tovar)` : ''}`;
    if (c.field === 'dueDate') return `muddat: ${c.from || '—'} → ${c.to || '—'}`;
    return 'izoh';
  });
  await recordAudit(user, {
    action: 'sale.edit',
    entity: 'sale',
    entityId: String(sale._id),
    summary: `Sotuv tahrirlandi: ${sale.saleNo} · ${parts.join(' · ')}`,
    meta: {
      changes,
      ...(price ? { delta: price.delta, refundAmount: price.refundAmount, debtReduced: price.debtReduced, remaining: price.newRemaining } : {}),
      ...(siblings ? { siblings } : {}),
    },
  });

  return { ok: true, saleNo: sale.saleNo, changes, price, siblings };
}
