import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { authenticateMobile } from '@/lib/mobileAuth';
import { mobilePermissionDenied } from '@/lib/permissionGuard';
import { recordAudit } from '@/lib/audit';
import { getTenantModels } from '@/lib/tenantDb';
import { generateTransferNo } from '@/lib/transfers';
import { branchFilter } from '@/lib/branchScope';
import { getMobileFeatures } from '@/lib/mobileOrg';
import { transferStock } from '@/lib/stock';
import { z } from 'zod';
import { readJsonInput, zId, zOptQty, zText } from '@/lib/validation';
import { clampQtyToStock } from '@/lib/productQuantity';
import { qtyLabel } from '@/lib/qty';

/** Mahsulotni boshqa filialga berish. transferProductAction mantiqini takrorlaydi. */
export async function POST(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  { const denied = await mobilePermissionDenied(user, 'transfer.create'); if (denied) return denied; }

  const input = await readJsonInput(req, z.object({
    productId: zId('Mahsulot va filial tanlanishi shart.'),
    toBranchId: zId('Mahsulot va filial tanlanishi shart.'),
    qty: zOptQty('Son noto\'g\'ri.'),
    notes: zText(500, 'Izoh juda uzun.'),
  }), { badJson: 'Noto\'g\'ri so\'rov.', fallback: 'Noto\'g\'ri so\'rov.' });
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
  const { productId, toBranchId: branchId } = input.data;
  const qty = input.data.qty ?? 1;

  const features = await getMobileFeatures(user.organizationId);
  if (!features?.transferred) {
    return NextResponse.json({ error: 'Filialga berish moduli yoqilmagan.' }, { status: 403 });
  }

  const { Product, Branch, Transfer } = await getTenantModels(user.dbName);
  // Filial login faqat o'z filiali mahsulotini beradi (IDOR himoyasi)
  const scope = branchFilter(user);
  const product = await Product.findOne({ _id: productId, ...scope }).lean();
  if (!product || product.status !== 'in_stock') {
    return NextResponse.json({ error: 'Faqat ombordagi mahsulot beriladi.' }, { status: 400 });
  }
  const branch = await Branch.findOne({ _id: branchId, active: true }).lean();
  if (!branch) return NextResponse.json({ error: 'Filial topilmadi.' }, { status: 404 });
  if (String(product.branchId) === branchId) {
    return NextResponse.json({ error: 'Mahsulot allaqachon shu filialda.' }, { status: 400 });
  }

  // dona — butun, kg/m… — ≤3 xona kasr; qoldiqdan oshsa qoldiqqacha qisqaradi
  const picked = clampQtyToStock(product, qty);
  if (!picked.ok) {
    return NextResponse.json({ error: picked.reason === 'noStock' ? 'Omborda qoldiq yo\'q.' : 'Son noto\'g\'ri.' }, { status: 400 });
  }
  const transferQty = picked.qty;

  // Atomik: qoldiq sharti + ayirish/ko'chirish bitta so'rovda
  const moved = await transferStock(Product, product._id, new Types.ObjectId(branchId), transferQty, {
    scope,
    trackQuantity: !!product.trackQuantity,
    history: { action: 'transferred', detail: `${qtyLabel(transferQty, product.unit)} · ${branch.name}`, by: user.username, at: new Date() },
  });
  if (!moved) {
    return NextResponse.json({ error: 'Mahsulot holati o\'zgargan yoki qoldiq yetarli emas.' }, { status: 409 });
  }
  const fromBranchId = moved.fromBranchId;
  const fromBranch = await Branch.findById(fromBranchId).lean();

  const transferNo = await generateTransferNo(Transfer);
  const transfer = await Transfer.create({
    transferNo,
    productId: product._id,
    productSnapshot: { name: product.name, imei: product.imei },
    quantity: transferQty,
    fromBranchId,
    fromBranchName: fromBranch?.name,
    toBranchId: new Types.ObjectId(branchId),
    toBranchName: branch.name,
    transferredBy: user.username,
  });
  await recordAudit(user, {
    action: 'transfer.create',
    entity: 'transfer',
    entityId: String(transfer._id),
    summary: `Filialga berildi ${transferNo}: ${product.name} · ${qtyLabel(transferQty, product.unit)} → ${branch.name} (mobil)`,
    meta: { quantity: transferQty, toBranchId: branchId },
  });

  return NextResponse.json({ ok: true, toBranch: branch.name, quantity: transferQty }, { status: 201 });
}
