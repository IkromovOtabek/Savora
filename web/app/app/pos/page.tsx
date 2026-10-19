import { getTenantSession } from '@/lib/tenantSession';
import { requireFeature } from '@/lib/auth';
import { requirePermission, userCan } from '@/lib/permissionGuard';
import { branchFilter, isBranchScoped } from '@/lib/branchScope';
import { getStockQty } from '@/lib/productQuantity';
import PosScreen, { type PosProduct } from '@/components/tenant/PosScreen';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.sales.pos.metaTitle };
}

/** Kassada bir vaqtda yuklanadigan mahsulotlar soni (qidiruv brauzerda, skaner darhol) */
const POS_PRODUCT_LIMIT = 3000;

export default async function PosPage() {
  await requireFeature('sales');
  await requirePermission('sale.create');
  const { user, org, features, Product, CashShift } = await getTenantSession();

  const [products, canDiscount, canEditPrice, openShift] = await Promise.all([
    Product.find({ ...branchFilter(user), status: 'in_stock' })
      .select('name imei barcode productId salePrice wholesalePrice trackQuantity quantity soldQuantity status unit')
      .sort({ name: 1 })
      .limit(POS_PRODUCT_LIMIT)
      .lean(),
    userCan(user, 'sale.discount'),
    userCan(user, 'sale.editPrice'),
    // Filial xodimi — o'z filiali smenasi; egasi — istalgan ochiq smena
    features.kassa
      ? CashShift.exists(isBranchScoped(user) ? { status: 'open', branchId: user.branchId } : { status: 'open' })
      : Promise.resolve(true),
  ]);

  const list: PosProduct[] = products.map((p) => ({
    id: String(p._id),
    name: p.name,
    codes: [p.imei, p.barcode, p.productId].filter((c): c is string => !!c),
    salePrice: p.salePrice ?? 0,
    wholesalePrice: p.wholesalePrice && p.wholesalePrice > 0 ? p.wholesalePrice : undefined,
    tracked: p.trackQuantity ?? false,
    available: getStockQty(p),
    unit: p.unit ?? null,
  }));

  return (
    <PosScreen
      products={list}
      canDiscount={canDiscount}
      canEditPrice={canEditPrice}
      noShift={features.kassa && !openShift}
      storageKey={`savora_pos_parked:${org._id}:${user.username}`}
    />
  );
}
