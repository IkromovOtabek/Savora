import { notFound } from 'next/navigation';
import { Types } from 'mongoose';
import { getTenantSession } from '@/lib/tenantSession';
import { isImeiEnabled } from '@/lib/features';
import { PRODUCT_STATUS_LABELS, ProductStatus } from '@/lib/models/tenant/Product';
import ProductForm from '@/components/tenant/ProductForm';
import DeleteProductButton from '@/components/tenant/DeleteProductButton';
import ProductHistory from '@/components/tenant/ProductHistory';
import { loadUserPermissions } from '@/lib/permissionGuard';
import ProductRowActions from '@/components/tenant/ProductRowActions';
import BackLink from '@/components/ui/BackLink';
import Icon from '@/components/icons/Icon';

function fmtMoney(n: number) {
  return new Intl.NumberFormat('uz-UZ').format(n);
}

export const metadata = { title: 'Mahsulot — Savora' };

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; deleteBlocked?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { user, Product, Branch, CreditBank, org, features } = await getTenantSession();
  const isAdmin = user.role === 'admin';

  if (!Types.ObjectId.isValid(id)) notFound();
  const product = await Product.findById(id).lean();
  if (!product) notFound();
  // Filial-login faqat o'z filiali mahsulotini ko'radi/tahrirlaydi
  if (!isAdmin && user.branchId && String(product.branchId) !== user.branchId) notFound();

  const perms = await loadUserPermissions(user);
  const canViewCost = perms.has('product.viewCost');

  const branches = await Branch.find({ active: true }).sort({ name: 1 }).lean();
  const creditBanks = features.creditKassa
    ? await CreditBank.find({ active: true }).sort({ name: 1 }).lean()
    : [];

  // Ko'rinish uchun hisoblar (mavjud ma'lumotdan)
  const branchName = branches.find((b) => String(b._id) === String(product.branchId))?.name ?? '—';
  const filialBranches = branches.filter((b) => !b.isMain).map((b) => ({ id: String(b._id), name: b.name }));
  const trackQuantity = product.trackQuantity ?? false;
  const available = trackQuantity ? Math.max(0, (product.quantity ?? 0) - (product.soldQuantity ?? 0)) : 1;
  const salePrice = product.salePrice ?? 0;
  const profit = salePrice - (product.purchasePrice ?? 0);
  const showImei = isImeiEnabled(org);
  const canSell = features.sales && perms.has('sale.create');
  const canTransfer = perms.has('transfer.create');
  const canDelete = perms.has('product.delete');
  const status = product.status as ProductStatus;
  const initialLetter = (product.name ?? '').trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="st-detail">
      <div className="st-back">
        <BackLink href="/app/products" className="btn btn-plain btn-sm">Ombor</BackLink>
      </div>

      {sp?.created === '1' && (
        <div className="auth-alert auth-alert--info" role="status">Mahsulot muvaffaqiyatli qo&apos;shildi.</div>
      )}
      {sp?.deleteBlocked === '1' && (
        <div className="auth-alert auth-alert--error" role="alert">
          Bu mahsulotning sotuv tarixi bor — o&apos;chirib bo&apos;lmaydi. Kerak bo&apos;lsa, sotuvni bekor qiling yoki mahsulotni tahrirlang.
        </div>
      )}

      <section className="st-hero" aria-labelledby="st-hero-name">
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
            <span className={`st-pill st-pill--${status}`}>{PRODUCT_STATUS_LABELS[status] ?? status}</span>
            {trackQuantity && (
              <span className={`st-qty${available === 0 ? ' st-qty--zero' : available <= 2 ? ' st-qty--low' : ''}`}>
                {available}<small>/{product.quantity ?? 0} qoldi</small>
              </span>
            )}
          </div>
          <h1 className="st-hero-name" id="st-hero-name">{product.name}</h1>
          <div className="st-hero-codes">
            {product.productId && <span>ID <code className="st-mono">{product.productId}</code></span>}
            {showImei && product.imei && <span>IMEI <code className="st-mono">{product.imei}</code></span>}
            {!showImei && product.barcode && <span>Kod <code className="st-mono">{product.barcode}</code></span>}
          </div>
          <div className="st-hero-price">
            {salePrice > 0 ? (
              <><b>{fmtMoney(salePrice)}</b><span>so&apos;m · sotuv narxi</span></>
            ) : (
              <span>Sotuv narxi kiritilmagan</span>
            )}
          </div>
        </div>

        <dl className="st-facts" style={{ margin: 0 }}>
          <div className="st-fact">
            <dt className="st-fact-l">Filial</dt>
            <dd className="st-fact-v" style={{ margin: 0 }}>{branchName}</dd>
          </div>
          {trackQuantity && (
            <div className="st-fact">
              <dt className="st-fact-l">Sotilgan</dt>
              <dd className="st-fact-v" style={{ margin: 0 }}>{product.soldQuantity ?? 0} ta</dd>
            </div>
          )}
          {canViewCost && (
            <div className="st-fact">
              <dt className="st-fact-l">Kelish narxi</dt>
              <dd className="st-fact-v" style={{ margin: 0 }}>{fmtMoney(product.purchasePrice ?? 0)}</dd>
            </div>
          )}
          {canViewCost && salePrice > 0 && (
            <div className="st-fact">
              <dt className="st-fact-l">Foyda (1 dona)</dt>
              <dd className={`st-fact-v ${profit >= 0 ? 'st-fact-v--ok' : 'st-fact-v--bad'}`} style={{ margin: 0 }}>
                {profit > 0 ? '+' : ''}{fmtMoney(profit)}
              </dd>
            </div>
          )}
          {product.color && (
            <div className="st-fact">
              <dt className="st-fact-l">Rang</dt>
              <dd className="st-fact-v" style={{ margin: 0 }}>{product.color}</dd>
            </div>
          )}
          {product.createdAt && (
            <div className="st-fact">
              <dt className="st-fact-l">Qo&apos;shilgan</dt>
              <dd className="st-fact-v" style={{ margin: 0 }}>
                {new Date(product.createdAt).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </dd>
            </div>
          )}
        </dl>

      </section>

      <div className="st-actionbar" role="toolbar" aria-label="Mahsulot amallari">
        {status === 'in_stock' && (canSell || canTransfer) && (
          <ProductRowActions
            variant="bar"
            productId={String(product._id)}
            status={product.status}
            currentBranchId={String(product.branchId)}
            trackQuantity={trackQuantity}
            available={available}
            salePrice={salePrice}
            canInstallment={!!(features.variant || features.nasiya)}
            canCredit={!!features.creditKassa}
            canSell={canSell}
            canTransfer={canTransfer}
            branches={filialBranches}
          />
        )}
        <a href="#st-edit" className="btn btn-tinted btn-with-icon">
          <Icon name="edit" size={17} /> Tahrirlash
        </a>
        {canDelete && (
          <a href="#st-danger" className="btn btn-danger btn-with-icon">
            <Icon name="trash" size={17} /> O&apos;chirish
          </a>
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
            productId: product.productId,
            trackQuantity: product.trackQuantity ?? false,
            quantity: product.quantity ?? 1,
            soldQuantity: product.soldQuantity ?? 0,
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
