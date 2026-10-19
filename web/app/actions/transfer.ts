'use server';

import { revalidatePath } from 'next/cache';
import { Types } from 'mongoose';
import { getTenantSession } from '@/lib/tenantSession';
import { generateTransferNo } from '@/lib/transfers';
import { clampQtyToStock } from '@/lib/productQuantity';
import { parseQty, qtyLabel } from '@/lib/qty';
import { checkPermission } from '@/lib/permissionGuard';
import { branchFilter } from '@/lib/branchScope';
import { transferStock } from '@/lib/stock';
import { getDict } from '@/lib/i18n/server';
import { qtyWithUnit, tr } from '@/lib/i18n/fmt';

type State = { error?: string; success?: string } | null;

export async function transferProductAction(_prev: State, formData: FormData): Promise<State> {
  const { user, Product, Branch, Transfer } = await getTenantSession();
  { const denied = await checkPermission(user, 'transfer.create'); if (denied) return denied; }
  const dict = await getDict();
  const m = dict.stock.msg;

  const productId = String(formData.get('productId') || '');
  const branchId = String(formData.get('branchId') || '');
  const qtyRaw = String(formData.get('qty') || '1');

  if (!Types.ObjectId.isValid(productId) || !Types.ObjectId.isValid(branchId)) {
    return { error: m.selectRequired };
  }

  // Filial login faqat o'z filiali mahsulotini beradi (IDOR himoyasi)
  const scope = branchFilter(user);
  const found = await Product.findOne({ _id: productId, ...scope }).lean();
  if (!found || found.status !== 'in_stock') {
    return { error: m.onlyInStock };
  }

  const branch = await Branch.findOne({ _id: branchId, active: true }).lean();
  if (!branch) return { error: m.branchNotFound };
  if (String(found.branchId) === branchId) {
    return { error: m.sameBranch };
  }

  // dona — butun, kg/m… — ≤3 xona kasr; qoldiqdan oshsa qoldiqqacha qisqaradi
  const picked = clampQtyToStock(found, parseQty(qtyRaw, found.unit));
  if (!picked.ok) return { error: picked.reason === 'noStock' ? m.noStock : m.transferQtyInvalid };
  const transferQty = picked.qty;

  // Atomik: qoldiq sharti + ayirish/ko'chirish bitta so'rovda
  const moved = await transferStock(Product, found._id, new Types.ObjectId(branchId), transferQty, {
    scope,
    trackQuantity: !!found.trackQuantity,
    history: { action: 'transferred', detail: `${qtyLabel(transferQty, found.unit)} · ${branch.name}`, by: user.username, at: new Date() },
  });
  if (!moved) return { error: m.stateChanged };
  const product = moved.product;
  const fromBranchId = moved.fromBranchId;
  const fromBranch = await Branch.findById(fromBranchId).lean();

  try {
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
    return { success: tr(m.transferredN, { n: qtyWithUnit(transferQty, found.unit, dict.stock.fields.units), branch: branch.name }) };
  } catch {
    return { error: m.saveFailed };
  }
}

export async function bulkImeiLookup(imeiList: string[]) {
  const { user, Product, Branch } = await getTenantSession();
  const normalized = [...new Set(imeiList.map((i) => i.trim().replace(/\s/g, '').toUpperCase()).filter(Boolean))].slice(0, 500);
  if (normalized.length === 0) return { found: [], missing: [] };

  const products = await Product.find({ imei: { $in: normalized }, ...branchFilter(user) }).lean();
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
