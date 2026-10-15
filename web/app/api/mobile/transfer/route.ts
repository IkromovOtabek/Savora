import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { authenticateMobile } from '@/lib/mobileAuth';
import { getTenantModels } from '@/lib/tenantDb';
import { generateTransferNo } from '@/lib/transfers';
import { parseQtyField } from '@/lib/productQuantity';
import { branchFilter } from '@/lib/branchScope';
import { getMobileFeatures } from '@/lib/mobileOrg';
import { transferStock } from '@/lib/stock';

/** Mahsulotni boshqa filialga berish. transferProductAction mantiqini takrorlaydi. */
export async function POST(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });

  let body: { productId?: string; toBranchId?: string; qty?: number | string; notes?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Noto\'g\'ri so\'rov.' }, { status: 400 }); }

  const productId = String(body.productId || '');
  const branchId = String(body.toBranchId || '');
  const qty = parseQtyField(String(body.qty ?? '1'));
  if (!Types.ObjectId.isValid(productId) || !Types.ObjectId.isValid(branchId)) {
    return NextResponse.json({ error: 'Mahsulot va filial tanlanishi shart.' }, { status: 400 });
  }

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

  let transferQty = 1;
  if (product.trackQuantity) {
    const available = product.quantity - product.soldQuantity;
    if (available < 1) return NextResponse.json({ error: 'Omborda qoldiq yo\'q.' }, { status: 400 });
    transferQty = Math.min(qty, available);
  }

  // Atomik: qoldiq sharti + ayirish/ko'chirish bitta so'rovda
  const moved = await transferStock(Product, product._id, new Types.ObjectId(branchId), transferQty, {
    scope,
    trackQuantity: !!product.trackQuantity,
    history: { action: 'transferred', detail: `${transferQty} ta · ${branch.name}`, by: user.username, at: new Date() },
  });
  if (!moved) {
    return NextResponse.json({ error: 'Mahsulot holati o\'zgargan yoki qoldiq yetarli emas.' }, { status: 409 });
  }
  const fromBranchId = moved.fromBranchId;
  const fromBranch = await Branch.findById(fromBranchId).lean();

  const transferNo = await generateTransferNo(Transfer);
  await Transfer.create({
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

  return NextResponse.json({ ok: true, toBranch: branch.name, quantity: transferQty }, { status: 201 });
}
