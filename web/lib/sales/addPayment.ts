/**
 * Sotuvga to'lov qabul qilish — YAGONA yo'l (web sotuv sahifasi, mobil ilova, ommaviy qarz to'lovi).
 * Avval web va mobil har biri o'z nusxasini yuritardi: mobilda parallel to'lovdan himoya (`expectPaid`),
 * nasiya oylari va to'lovdan keyingi qoldiq yo'q edi — endi hammasi bir xil.
 *
 * Nasiya: to'lov doim eng erta to'lanmagan oyga tushadi; izoh haqiqiy taqsimotdan ("2-oy (qisman)").
 * Qisman to'lovda `spread` bo'lsa — oy shu summa bilan yopiladi, yetmagani keyingi oylarga teng bo'linadi.
 */
import type { Model } from 'mongoose';
import type { ISale } from '../models/tenant/Sale';
import type { SessionUser } from '../session';
import type { Dict } from '../i18n/dict';
import type { PayMethod } from '../payMethods';
import { tr } from '../i18n/fmt';
import { branchFilter } from '../branchScope';
import { applySalePayment } from '../salePayment';
import { computeInstallmentPlan, installmentPaymentMonths, installmentPaymentNote, spreadShortfall } from '../installment';
import { recordAudit } from '../audit';

export type SalePaymentError =
  | { code: 'saleNotFound' | 'cancelledNoPayment' | 'alreadyPaid' | 'bankSalePayment' | 'paymentConflict' }
  | { code: 'remainingIs'; remaining: number };

export interface SalePaymentDone {
  paymentId: string;
  saleNo: string;
  paidAmount: number;
  remainingAmount: number;
  status: ISale['status'];
}

export async function addSalePayment(
  m: { Sale: Model<ISale> },
  user: SessionUser,
  input: {
    saleId: string;
    amount: number;
    method: PayMethod;
    /** Foydalanuvchi izohi (bo'sh — nasiyada avtomatik izoh) */
    note?: string;
    /** Nasiya qisman to'lovi: yetmagani keyingi oylarga bo'linsinmi */
    spread?: boolean;
    /** Ilovaning standart izohi — nasiyada haqiqiy taqsimot izohi bilan almashtiriladi */
    defaultNote?: string;
    source: 'web' | 'mobile' | 'bulk';
    /** Ommaviy to'lovda audit bitta umumiy yozuv bilan — har sotuvga alohida yozilmaydi */
    skipAudit?: boolean;
  },
): Promise<{ ok: true; done: SalePaymentDone } | { ok: false; error: SalePaymentError }> {
  const { saleId, amount, method } = input;
  // Filial login faqat o'z filiali sotuviga to'lov qo'shadi
  const sale = await m.Sale.findOne({ _id: saleId, ...branchFilter(user) }).lean();
  if (!sale) return { ok: false, error: { code: 'saleNotFound' } };
  if (sale.status === 'cancelled') return { ok: false, error: { code: 'cancelledNoPayment' } };
  if (sale.status === 'paid') return { ok: false, error: { code: 'alreadyPaid' } };
  // Bank krediti: pulni bank o'tkazadi — Kredit kassada bank bo'yicha yoziladi (ikki marta hisoblanmasin)
  if (sale.paymentType === 'bank_credit') return { ok: false, error: { code: 'bankSalePayment' } };
  if (amount > sale.remainingAmount) return { ok: false, error: { code: 'remainingIs', remaining: sale.remainingAmount } };

  const schedule = sale.paymentType === 'installment' ? computeInstallmentPlan(sale)?.schedule ?? [] : [];
  const spread = schedule.length > 0 && input.spread ? spreadShortfall(schedule, amount) : null;
  const months = schedule.length > 0 ? installmentPaymentMonths(schedule, amount) : undefined;
  const note = input.note?.trim();
  const plainNote = !note || note === input.defaultNote;
  const autoNote = plainNote && schedule.length > 0 ? installmentPaymentNote(schedule, amount, spread) : undefined;

  // Atomik: qoldiq sharti bilan bitta yozuv. expectPaid: jadval/izoh/qoldiq shu holatdan hisoblandi —
  // orada boshqa to'lov tushsa, yozilmaydi (qayta urinish)
  const res = await applySalePayment(m.Sale, saleId, amount, {
    scope: branchFilter(user),
    note: autoNote || note || undefined,
    recordedBy: user.username,
    method,
    expectPaid: sale.paidAmount,
    extra: {
      balanceAfter: Math.max(0, sale.remainingAmount - amount),
      ...(months ? { months } : {}),
      ...(spread ? { carry: { amount: spread.carry, from: spread.from, to: spread.to } } : {}),
    },
    set: spread ? { installmentAmounts: spread.amounts } : undefined,
  });
  if (!res) return { ok: false, error: { code: 'paymentConflict' } };

  if (!input.skipAudit) {
    await recordAudit(user, {
      action: 'sale.payment',
      entity: 'sale',
      entityId: saleId,
      summary: `To'lov qabul qilindi: ${sale.saleNo} · ${amount.toLocaleString('uz-UZ')} so'm, ${method} (qoldiq ${res.remainingAmount.toLocaleString('uz-UZ')} so'm)`
        + (spread ? ` · ${spread.month}-oydan ${spread.carry.toLocaleString('uz-UZ')} so'm ${spread.from}–${spread.to}-oylarga bo'lindi` : '')
        + ` [${input.source}]`,
      meta: { amount, method, remaining: res.remainingAmount, status: res.status, source: input.source, ...(spread ? { carry: spread.carry, carryFrom: spread.from, carryTo: spread.to } : {}) },
    });
  }
  return { ok: true, done: { paymentId: res.paymentId, saleNo: sale.saleNo, paidAmount: res.paidAmount, remainingAmount: res.remainingAmount, status: res.status } };
}

export function salePaymentErrorText(e: SalePaymentError, d: Dict): string {
  const m = d.sales.actions;
  if (e.code === 'remainingIs') return tr(m.remainingIs, { sum: e.remaining.toLocaleString('uz-UZ') });
  return m[e.code];
}
