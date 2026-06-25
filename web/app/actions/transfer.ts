'use server';

import { revalidatePath } from 'next/cache';
import { Types } from 'mongoose';
import { getTenantSession } from '@/lib/tenantSession';
import { generateTransferNo } from '@/lib/transfers';
import { parseQtyField, resolveStatusAfterSale } from '@/lib/productQuantity';

type State = { error?: string; success?: string } | null;

export async function transferProductAction(_prev: State, formData: FormData): Promise<State> {
  const { user, Product, Branch, Transfer } = await getTenantSession();

  const productId = String(formData.get('productId') || '');
  const branchId = String(formData.get('branchId') || '');
  const qty = parseQtyField(String(formData.get('qty') || '1'));

  if (!productId || !Types.ObjectId.isValid(branchId)) {
    return { error: 'Mahsulot va filial tanlanishi shart.' };
  }

  const product = await Product.findById(productId);
  if (!product || product.status !== 'in_stock') {
    return { error: 'Faqat ombordagi mahsulot beriladi.' };
  }

  const branch = await Branch.findOne({ _id: branchId, active: true }).lean();
  if (!branch) return { error: 'Filial topilmadi.' };
  if (String(product.branchId) === branchId) {
    return { error: 'Mahsulot allaqachon shu filialda.' };
  }

  const fromBranchId = product.branchId;
  const fromBranch = await Branch.findById(fromBranchId).lean();
  const now = new Date();

  let transferQty = 1;
  if (product.trackQuantity) {
    const available = product.quantity - product.soldQuantity;
    if (available < 1) return { error: 'Omborda qoldiq yo\'q.' };
    transferQty = Math.min(qty, available);
    if (transferQty < 1) return { error: 'Beriladigan son noto\'g\'ri.' };
    // Ombordan kamayadi
    product.quantity -= transferQty;
    // Hammasi berilsa — status transferred
    if (product.quantity - product.soldQuantity <= 0) {
      product.status = product.soldQuantity > 0
        ? resolveStatusAfterSale(product.trackQuantity, product.quantity, product.soldQuantity)
        : 'transferred';
    }
  } else {
    transferQty = 1;
    // Yagona mahsulot — butunlay maqsad filialga o'tadi
    product.branchId = new Types.ObjectId(branchId);
    product.status = 'in_stock';
  }

  if (!Array.isArray(product.history)) product.history = [];
  product.history.push({
    action: 'transferred',
    detail: `${transferQty} ta · ${branch.name}`,
    by: user.username,
    at: now,
  });

  try {
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
    revalidatePath('/app');
    revalidatePath('/app/products');
    revalidatePath('/app/transferred');
    revalidatePath(`/app/products/${productId}`);
    return { success: `${transferQty} ta ${branch.name} filialiga berildi.` };
  } catch {
    return { error: 'Saqlashda xatolik.' };
  }
}

export async function bulkImeiLookup(imeiList: string[]) {
  const { Product, Branch } = await getTenantSession();
  const normalized = [...new Set(imeiList.map((i) => i.trim().replace(/\s/g, '').toUpperCase()).filter(Boolean))];
  if (normalized.length === 0) return { found: [], missing: [] };

  const products = await Product.find({ imei: { $in: normalized } }).lean();
  const branches = await Branch.find().lean();
  const branchMap = Object.fromEntries(branches.map((b) => [String(b._id), b.name]));

  const found = new Set(products.map((p) => p.imei));
  const missing = normalized.filter((i) => !found.has(i));

  return {
    found: products.map((p) => ({
      imei: p.imei,
      name: p.name,
      status: p.status,
      branch: branchMap[String(p.branchId)] ?? '—',
      salePrice: p.salePrice,
      id: String(p._id),
    })),
    missing,
  };
}
