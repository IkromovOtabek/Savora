import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateMobile } from '@/lib/mobileAuth';
import { mobilePermissionDenied } from '@/lib/permissionGuard';
import { getTenantModels } from '@/lib/tenantDb';
import { isBranchScoped } from '@/lib/branchScope';
import { addBranchExpense } from '@/lib/branchExpense';
import { shiftTotalsNow } from '@/lib/cashShiftOps';
import { loadExpenseCategories } from '@/lib/financeCategories';
import { getDictionary } from '@/lib/i18n/dict';
import { readJsonInput, zMoney, zReqText, zText } from '@/lib/validation';
import type { SessionUser } from '@/lib/session';

/** Mobil xatolar — boshqa mobil API'lar kabi o'zbekcha */
const d = getDictionary('uz');
const DICT = { fin: d.sales.fin, shifts: d.sales.shifts };
const VIA = ' (mobil)';

/**
 * Filial xodimining xarajati — web kassa/bosh sahifadagi «Xarajat qo'shish» (filial rejimi) bilan bir mantiq
 * (lib/branchExpense). Ruxsat: filial login + «Xarajat yozish» (kassa.expense; Kirim-chiqim moduli o'chiq bo'lsa — 403).
 * Do'kon egasi mobil'da «Kirim-chiqim» ekranidan yozadi.
 */
async function authorize(req: Request): Promise<NextResponse | SessionUser> {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth || !auth.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  if (!isBranchScoped(auth)) return NextResponse.json({ error: 'Faqat filial xodimi uchun.' }, { status: 403 });
  const noPerm = await mobilePermissionDenied(auth, 'kassa.expense');
  return noPerm ?? auth;
}

/** Forma uchun: xarajat toifalari va filialdagi ochiq smena (kassadagi pul — chegara) */
export async function GET(req: Request) {
  const user = await authorize(req);
  if (user instanceof NextResponse) return user;
  const m = await getTenantModels(user.dbName!);
  const [categories, shift] = await Promise.all([
    loadExpenseCategories(m.FinanceCategory),
    m.CashShift.findOne({ branchId: user.branchId, status: 'open' }).lean(),
  ]);
  const current = shift ? (await shiftTotalsNow(m, shift)).current : null;
  return NextResponse.json({
    categories,
    shift: shift ? { shiftNo: shift.shiftNo, current } : null,
  });
}

const BAD = { badJson: "Noto'g'ri so'rov.", fallback: d.sales.shifts.badAmount };

export async function POST(req: Request) {
  const user = await authorize(req);
  if (user instanceof NextResponse) return user;
  const input = await readJsonInput(req, z.object({
    amount: zMoney(d.sales.shifts.badAmount, { min: 1 }),
    category: zReqText(60, d.sales.fin.badCategory, d.common.tooLong),
    note: zText(300, d.common.tooLong),
  }), BAD);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  const m = await getTenantModels(user.dbName!);
  const res = await addBranchExpense(user, m, DICT, { ...input.data, via: VIA });
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true, message: res.success });
}
