import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { verifyMobileToken } from '@/lib/mobileAuth';
import { getTenantModels } from '@/lib/tenantDb';
import { generateTransferNo } from '@/lib/transfers';
import { parseQtyField, resolveStatusAfterSale } from '@/lib/productQuantity';

/** Mahsulotni boshqa filialga berish. transferProductAction mantiqini takrorlaydi. */
export async function POST(req: Request) {
  const user = await verifyMobileToken(req);
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });

  let body: { productId?: string; toBranchId?: string; qty?: number | string; notes?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Noto\'g\'ri so\'rov.' }, { status: 400 }); }

  const productId = String(body.productId || '');
  const branchId = String(body.toBranchId || '');
  const qty = parseQtyField(String(body.qty ?? '1'));
  if (!Types.ObjectId.isValid(productId) || !Types.ObjectId.isValid(branchId)) {
    return NextResponse.json({ error: 'Mahsulot va filial tanlanishi shart.' }, { status: 400 });
  }

  const { Product, Branch, Transfer } = await getTenantModels(user.dbName);
  const product = await Product.findById(productId);
  if (!product || product.status !== 'in_stock') {
    return NextResponse.json({ error: 'Faqat ombordagi mahsulot beriladi.' }, { status: 400 });
  }
  const branch = await Branch.findOne({ _id: branchId, active: true }).lean();
  if (!branch) return NextResponse.json({ error: 'Filial topilmadi.' }, { status: 404 });
  if (String(product.branchId) === branchId) {
    return NextResponse.json({ error: 'Mahsulot allaqachon shu filialda.' }, { status: 400 });
  }

  const fromBranchId = product.branchId;
  const fromBranch = await Branch.findById(fromBranchId).lean();
  const now = new Date();

  let transferQty = 1;
  if (product.trackQuantity) {
    const available = product.quantity - product.soldQuantity;
    if (available < 1) return NextResponse.json({ error: 'Omborda qoldiq yo\'q.' }, { status: 400 });
    transferQty = Math.min(qty, available);
    product.quantity -= transferQty;
    if (product.quantity - product.soldQuantity <= 0) {
      product.status = product.soldQuantity > 0
        ? resolveStatusAfterSale(product.trackQuantity, product.quantity, product.soldQuantity)
        : 'transferred';
    }
  } else {
    product.branchId = new Types.ObjectId(branchId);
    product.status = 'in_stock';
  }

  if (!Array.isArray(product.history)) product.history = [];
  product.history.push({ action: 'transferred', detail: `${transferQty} ta · ${branch.name}`, by: user.username, at: now });

  await product.save();
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
