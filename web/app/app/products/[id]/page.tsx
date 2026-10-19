import { notFound } from 'next/navigation';
import { fmtQty } from '@/lib/qty';
import { getStockQty } from '@/lib/productQuantity';
import { Types } from 'mongoose';
import { getTenantSession } from '@/lib/tenantSession';
import { isImeiEnabled } from '@/lib/features';
import { ProductStatus } from '@/lib/models/tenant/Product';
import ProductForm from '@/components/tenant/ProductForm';
import { getUsdRate } from '@/lib/currency';
import DeleteProductButton from '@/components/tenant/DeleteProductButton';
import ProductHistory from '@/components/tenant/ProductHistory';
import { loadUserPermissions } from '@/lib/permissionGuard';
import ProductRowActions from '@/components/tenant/ProductRowActions';
import BackLink from '@/components/ui/BackLink';
import Icon from '@/components/icons/Icon';
import Tilt from '@/components/ui/Tilt';
import MoreMenu from '@/components/ui/MoreMenu';
import { getDict } from '@/lib/i18n/server';
import { tr, qtyWithUnit } from '@/lib/i18n/fmt';
import { productFieldsFor } from '@/lib/businessTypes';
import { loadCategories, toDateInputValue } from '@/lib/productFields';

function fmtMoney(n: number) {
  return new Intl.NumberFormat('uz-UZ').format(n);
}

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.stock.detail.metaTitle };
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; deleteBlocked?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const d = await getDict();
  const t = d.stock.detail;
  const { user, Product, Branch, CreditBank, org, features, Supplier, ShopSettings } = await getTenantSession();
  const usd = await getUsdRate(ShopSettings);
  const isAdmin = user.role === 'admin';

  if (!Types.ObjectId.isValid(id)) notFound();
  const product = await Product.findById(id).lean();
  if (!product) notFound();
  // Filial-login faqat o'z filiali mahsulotini ko'radi/tahrirlaydi
  if (!isAdmin && user.branchId && String(product.branchId) !== user.branchId) notFound();

  const perms = await loadUserPermissions(user);
  const canViewCost = perms.has('product.viewCost');
  const suppliers = perms.has('suppliers.manage')
    ? await Supplier.find({}, { name: 1 }).sort({ name: 1 }).limit(500).lean()
    : undefined;

  const branches = await Branch.find({ active: true }).sort({ name: 1 }).lean();
  const creditBanks = features.creditKassa
    ? await CreditBank.find({ active: true }).sort({ name: 1 }).lean()
    : [];

  // Ko'rinish uchun hisoblar (mavjud ma'lumotdan)
  const branchName = branches.find((b) => String(b._id) === String(product.branchId))?.name ?? '—';
  const filialBranches = branches.filter((b) => !b.isMain).map((b) => ({ id: String(b._id), name: b.name }));
  const trackQuantity = product.trackQuantity ?? false;
  const available = trackQuantity ? getStockQty(product) : 1;
  const unitSuffix = product.unit && product.unit !== 'dona' ? ` ${d.stock.fields.units[product.unit]}` : '';
  const salePrice = product.salePrice ?? 0;
  const profit = salePrice - (product.purchasePrice ?? 0);
  const showImei = isImeiEnabled(org);
  const canSell = features.sales && perms.has('sale.create');
  const canTransfer = perms.has('transfer.create');
  const canDelete = perms.has('product.delete');
  const status = product.status as ProductStatus;
  const initialLetter = (product.name ?? '').trim().charAt(0).toUpperCase() || '?';
  const productFields = productFieldsFor(org.businessType);
  const categories = await loadCategories(Product);
  const tf = d.stock.fields;
  // Saqlangan yo'nalish maydonlari (boshqa yo'nalishdan qolganlari ham ko'rsatiladi)
  const expiry = product.expiryDate ? new Date(product.expiryDate) : null;
  const expired = !!expiry && expiry.getTime() < Date.now();
  const extraFacts: { key: string; label: string; value: string; bad?: boolean }[] = [
    product.category ? { key: 'category', label: tf.labels.category, value: product.category } : null,
    product.unit ? { key: 'unit', label: tf.labels.unit, value: tf.units[product.unit] ?? product.unit } : null,
    product.size ? { key: 'size', label: tf.labels.size, value: product.size } : null,
    product.warrantyMonths ? { key: 'warrantyMonths', label: tf.labels.warrantyMonths, value: String(product.warrantyMonths) } : null,
    product.batchNumber ? { key: 'batchNumber', label: tf.labels.batchNumber, value: product.batchNumber } : null,
    expiry
      ? {
          key: 'expiryDate',
          label: tf.labels.expiryDate,
          value: expiry.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }) + (expired ? ` · ${tf.expired}` : ''),
          bad: expired,
        }
      : null,
    product.oemCode ? { key: 'oemCode', label: tf.labels.oemCode, value: product.oemCode } : null,
  ].filter((x): x is NonNullable<typeof x> => !!x);

  return (
    <div className="st-detail">
      <div className="st-back">
        <BackLink href="/app/products" className="btn btn-plain btn-sm">{d.stock.form.back}</BackLink>
      </div>

      {sp?.created === '1' && (
        <div className="auth-alert auth-alert--info" role="status">{t.createdOk}</div>
      )}
      {sp?.deleteBlocked === '1' && (
        <div className="auth-alert auth-alert--error" role="alert">
          {t.deleteBlocked}
        </div>
      )}

      {/* Sahifaning asosiy "ob'ekti" — mahsulot kartasi (3D to'plam), narx oldinga chiqadi */}
      <Tilt as="section" stack max={4} className="st-hero">
        <div className="st-hero-photo">
          {product.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.photoUrl} alt={product.name} />
          ) : (
            <span className="st-thumb-letter" aria-hidden="true">{initialLetter}</span>
          )}
        </div>
        <div className="st-hero-body">
          <div className="st-hero-top">
            <span className={`st-pill st-pill--${status}`}>{d.stock.status[status] ?? status}</span>
            {trackQuantity && (
              <span className={`st-qty${available === 0 ? ' st-qty--zero' : available <= 2 ? ' st-qty--low' : ''}`}>
                {fmtQty(available)}<small>/{fmtQty(product.quantity ?? 0)}{unitSuffix} {t.left}</small>
              </span>
            )}
          </div>
          <h1 className="st-hero-name" id="st-hero-name">{product.name}</h1>
          <div className="st-hero-codes">
            {product.productId && <span>ID <code className="st-mono">{product.productId}</code></span>}
            {showImei && product.imei && <span>IMEI <code className="st-mono">{product.imei}</code></span>}
            {!showImei && product.barcode && <span>{t.code} <code className="st-mono">{product.barcode}</code></span>}
          </div>
          <div className="st-hero-price ux-z">
            {salePrice > 0 ? (
              <><b>{fmtMoney(salePrice)}</b><span>{t.salePriceSuffix}</span></>
            ) : (
              <span>{t.noSalePrice}</span>
            )}
          </div>
        </div>

        <dl className="st-facts" style={{ margin: 0 }}>
          <div className="st-fact">
            <dt className="st-fact-l">{d.common.branch}</dt>
            <dd className="st-fact-v" style={{ margin: 0 }}>{branchName}</dd>
          </div>
          {trackQuantity && (
            <div className="st-fact">
              <dt className="st-fact-l">{t.sold}</dt>
              <dd className="st-fact-v" style={{ margin: 0 }}>{qtyWithUnit(product.soldQuantity ?? 0, product.unit, tf.units)}</dd>
            </div>
          )}
          {canViewCost && (
            <div className="st-fact">
              <dt className="st-fact-l">{t.purchasePrice}</dt>
              <dd className="st-fact-v" style={{ margin: 0 }}>{fmtMoney(product.purchasePrice ?? 0)}</dd>
            </div>
          )}
          {canViewCost && salePrice > 0 && (
            <div className="st-fact">
              <dt className="st-fact-l">{t.profitUnit}</dt>
              <dd className={`st-fact-v ${profit >= 0 ? 'st-fact-v--ok' : 'st-fact-v--bad'}`} style={{ margin: 0 }}>
                {profit > 0 ? '+' : ''}{fmtMoney(profit)}
              </dd>
            </div>
          )}
          {product.color && (
            <div className="st-fact">
              <dt className="st-fact-l">{t.color}</dt>
              <dd className="st-fact-v" style={{ margin: 0 }}>{product.color}</dd>
            </div>
          )}
          {extraFacts.map((f) => (
            <div className="st-fact" key={f.key}>
              <dt className="st-fact-l">{f.label}</dt>
              <dd className={`st-fact-v${f.bad ? ' st-fact-v--bad' : ''}`} style={{ margin: 0 }}>{f.value}</dd>
            </div>
          ))}
          {product.createdAt && (
            <div className="st-fact">
              <dt className="st-fact-l">{t.addedAt}</dt>
              <dd className="st-fact-v" style={{ margin: 0 }}>
                {new Date(product.createdAt).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </dd>
            </div>
          )}
        </dl>
      </Tilt>

      <div className="st-actionbar" role="toolbar" aria-label={t.toolbarLabel}>
        {status === 'in_stock' && (canSell || canTransfer) && (
          <ProductRowActions
            variant="bar"
            productId={String(product._id)}
            productName={product.name}
            status={product.status}
            currentBranchId={String(product.branchId)}
            trackQuantity={trackQuantity}
            available={available}
            unit={product.unit ?? null}
            salePrice={salePrice}
            canInstallment={!!(features.variant || features.nasiya)}
            canCredit={!!features.creditKassa}
            canSell={canSell}
            canTransfer={canTransfer}
            branches={filialBranches}
          />
        )}
        <a href="#st-edit" className="btn btn-tinted btn-with-icon">
          <Icon name="edit" size={17} /> {d.common.edit}
        </a>
        {/* O'chirish — xavfli amal: asosiy panelda emas, ⋯ ichida "Xavfli zona"ga olib boradi */}
        {canDelete && (
          <MoreMenu label={t.moreLabel}>
            <a href="#st-danger" className="ux-danger"><Icon name="trash" size={18} /> {d.common.delete}</a>
          </MoreMenu>
        )}
      </div>

      <div className="st-detail-grid">
        <ProductForm
          mode="edit"
          showImei={showImei}
          mediaEnabled={features.mediaUpload}
          creditKassaEnabled={features.creditKassa}
          creditBanks={creditBanks.map((b) => ({ id: String(b._id), name: b.name }))}
          isAdmin={isAdmin}
          canViewCost={canViewCost}
          suppliers={suppliers?.map((x) => ({ id: String(x._id), name: x.name }))}
          usdRate={usd.rate}
          productFields={productFields}
          categories={categories}
          currentBranchId={user.branchId}
          branches={branches.map((b) => ({ id: String(b._id), name: b.name }))}
          initial={{
            id: String(product._id),
            name: product.name,
            imei: product.imei,
            barcode: product.barcode ?? '',
            color: product.color ?? '',
            branchId: String(product.branchId),
            notes: product.notes ?? '',
            photoUrl: product.photoUrl,
            status: product.status as ProductStatus,
            soldPaymentType: product.soldPaymentType,
            soldBankName: product.soldBankName,
            // Huquqsiz xodimga kelish narxi umuman yuborilmaydi (RSC payload'da ham)
            purchasePrice: canViewCost ? product.purchasePrice : 0,
            salePrice: product.salePrice,
            wholesalePrice: product.wholesalePrice,
            productId: product.productId,
            supplierId: product.supplierId ? String(product.supplierId) : undefined,
            trackQuantity: product.trackQuantity ?? false,
            quantity: product.quantity ?? 1,
            soldQuantity: product.soldQuantity ?? 0,
            extra: {
              category: product.category ?? '',
              unit: product.unit ?? '',
              size: product.size ?? '',
              warrantyMonths: product.warrantyMonths !== undefined ? String(product.warrantyMonths) : '',
              batchNumber: product.batchNumber ?? '',
              expiryDate: toDateInputValue(product.expiryDate),
              oemCode: product.oemCode ?? '',
            },
          }}
        />
        <aside className="st-detail-aside">
          <ProductHistory history={product.history ?? []} />
          {canDelete && (
            <div id="st-danger">
              <DeleteProductButton productId={String(product._id)} productName={product.name} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
