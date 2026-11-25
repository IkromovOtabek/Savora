import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { authenticateMobile } from '@/lib/mobileAuth';
import { mobilePermissionDenied } from '@/lib/permissionGuard';
import { getTenantModels } from '@/lib/tenantDb';
import { cancelSale, saleUndoErrorText } from '@/lib/sales/undoSale';
import { getDictionary } from '@/lib/i18n/dict';

/**
 * Sotuvni bekor qilish (mobil) — web sotuv sahifasidagi «Bekor qilish» bilan bir yadro (lib/sales/undoSale):
 * tovar omborga qaytadi, to'langan pul mijozga naqd qaytariladi (kassadan chiqim). Huquq: sale.cancel.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  { const denied = await mobilePermissionDenied(user, 'sale.cancel'); if (denied) return denied; }
  const { id } = await params;
  const d = getDictionary('uz');
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: d.sales.actions.saleNotFound }, { status: 404 });

  const { Product, Sale, CashFlow, CashShift, FinanceCategory } = await getTenantModels(user.dbName);
  const r = await cancelSale({ Product, Sale, CashFlow, CashShift, FinanceCategory }, user, id);
  if (!r.ok) return NextResponse.json({ error: saleUndoErrorText(r.error, d) }, { status: r.error === 'saleNotFound' ? 404 : 409 });
  return NextResponse.json({ ok: true, saleNo: r.saleNo, refund: r.refund });
}
