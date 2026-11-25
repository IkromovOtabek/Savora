import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { authenticateMobile } from '@/lib/mobileAuth';
import { mobilePermissionDenied } from '@/lib/permissionGuard';
import { getTenantModels } from '@/lib/tenantDb';
import { readJsonInput, zOptQty, zText } from '@/lib/validation';
import { returnSaleItems, saleUndoErrorText } from '@/lib/sales/undoSale';
import { getDictionary } from '@/lib/i18n/dict';

/**
 * Qisman qaytarish (mobil) — web bilan bir yadro (lib/sales/undoSale): qty dona/kg omborga qaytadi,
 * avval qarz kamayadi, ortig'i mijozga naqd qaytariladi. Huquq: sale.return.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  { const denied = await mobilePermissionDenied(user, 'sale.return'); if (denied) return denied; }
  const { id } = await params;
  const d = getDictionary('uz');
  const m = d.sales.actions;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: m.saleNotFound }, { status: 404 });

  const input = await readJsonInput(req, z.object({
    qty: zOptQty(m.returnBadQty),
    reason: zText(300, d.common.tooLong),
  }), { badJson: d.common.invalidInput, fallback: m.returnBadQty });
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
  if (input.data.qty === undefined) return NextResponse.json({ error: m.returnBadQty }, { status: 400 });

  const { Product, Sale } = await getTenantModels(user.dbName);
  const r = await returnSaleItems({ Product, Sale }, user, { saleId: id, qty: input.data.qty, reason: input.data.reason });
  if (!r.ok) return NextResponse.json({ error: saleUndoErrorText(r.error, d) }, { status: r.error === 'saleNotFound' ? 404 : r.error === 'returnConflict' ? 409 : 400 });
  return NextResponse.json({ ok: true, saleNo: r.saleNo, qty: r.qty, refundAmount: r.refundAmount });
}
