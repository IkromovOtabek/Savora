import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter } from '@/lib/branchScope';
import { isImeiEnabled } from '@/lib/features';
import { resolveOrgPlan } from '@/lib/plans';
import { PRODUCT_STATUS_LABELS, ProductStatus } from '@/lib/models/tenant/Product';
import ProductSearch from '@/components/tenant/ProductSearch';
import ProductRowActions from '@/components/tenant/ProductRowActions';
import LimitBanner from '@/components/tenant/LimitBanner';
// import ProductImportForm from '@/components/tenant/ProductImportForm'; // CSV Import vaqtincha yashirilgan

export const metadata = { title: 'Ombor — Savora' };

const PAGE_SIZE = 50;

function fmtMoney(n: number) {
  return new Intl.NumberFormat('uz-UZ').format(n);
}

function fmtDate(d?: Date | string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; branch?: string; status?: string; page?: string; created?: string; deleted?: string }>;
}) {
  const sp = await searchParams;
  const { user, Product, Branch, org, features } = await getTenantSession();
  const showImei = isImeiEnabled(org);
  const richSale = !!(features.variant || features.creditKassa);

  const branches = await Branch.find({ active: true }).sort({ name: 1 }).lean();
  const branchMap = Object.fromEntries(branches.map((b) => [String(b._id), b.name]));
  // "Filialga berish" maqsadi — faqat filiallar (asosiy ombor emas)
  const filialBranches = branches.filter((b) => !b.isMain).map((b) => ({ id: String(b._id), name: b.name }));

  const filter: Record<string, unknown> = {};
  const q = (sp.q ?? '').trim();
  if (q) {
    const qNoSpace = q.replace(/\s/g, '');
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { imei: { $regex: qNoSpace, $options: 'i' } },
      { barcode: { $regex: qNoSpace, $options: 'i' } },
      { productId: { $regex: qNoSpace, $options: 'i' } },
    ];
  }
  if (sp.branch) filter.branchId = sp.branch;
  if (sp.status && sp.status in PRODUCT_STATUS_LABELS) filter.status = sp.status;
  // Filial login — faqat o'z filiali mahsulotlari (admin tanlovini ham bekor qiladi)
  Object.assign(filter, branchFilter(user));

  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const [products, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(PAGE_SIZE).lean(),
    Product.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Yumshoq mahsulot chegarasi — faqat admin uchun (org bo'yicha umumiy son)
  const isAdmin = user.role === 'admin';
  const maxProducts = resolveOrgPlan(org).maxProducts ?? 0;
  const orgProductCount = isAdmin ? await Product.countDocuments({}) : 0;

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (sp.branch) params.set('branch', sp.branch);
    if (sp.status) params.set('status', sp.status);
    if (p > 1) params.set('page', String(p));
    const s = params.toString();
    return `/app/products${s ? `?${s}` : ''}`;
  }

  return (
    <>
      {isAdmin && <LimitBanner label="Mahsulotlar" current={orgProductCount} max={maxProducts} />}
      <div className="dash-head">
        <div>
          <h1 className="dash-hello">Ombor</h1>
          <p className="dash-sub">
            {total} ta mahsulot
            {totalPages > 1 ? ` · ${page}-sahifa (${totalPages} ta)` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/app/products/new" className="btn btn-primary">+ Mahsulot qo&apos;shish</Link>
          <a href="/api/export/products" className="btn btn-ghost">CSV export</a>
        </div>
      </div>

      {sp?.created === '1' && <div className="auth-alert auth-alert--info" style={{ marginBottom: 16 }}>Mahsulot qo&apos;shildi.</div>}
      {sp?.deleted === '1' && <div className="auth-alert auth-alert--info" style={{ marginBottom: 16 }}>Mahsulot o&apos;chirildi.</div>}

      <ProductSearch
        branches={branches.map((b) => ({ id: String(b._id), name: b.name }))}
        initial={{ q: sp.q ?? '', branch: sp.branch ?? '', status: sp.status ?? '' }}
      />

      {/* CSV Import vaqtincha yashirilgan
      <ProductImportForm branches={branches.map((b) => ({ id: String(b._id), name: b.name }))} />
      */}

      <div className="panel" style={{ marginTop: 20 }}>
        {products.length === 0 ? (
          <div className="panel-empty">
            <p>{q ? `"${q}" bo'yicha mahsulot topilmadi.` : 'Mahsulot topilmadi.'}</p>
            {!q && <Link href="/app/products/new" className="btn btn-primary">Mahsulot qo&apos;shish</Link>}
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Mahsulot</th>
                    {showImei && <th>IMEI</th>}
                    <th>Filial</th>
                    <th>Son</th>
                    <th>Holat</th>
                    <th>Kelish</th>
                    <th>Sotuv</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={String(p._id)}>
                      <td><code>{p.productId ?? String(p._id).slice(-8).toUpperCase()}</code></td>
                      <td>
                        <Link href={`/app/products/${p._id}`} className="cell-link cell-main">{p.name}</Link>
                        <div className="cell-sub">Qo&apos;shildi: {fmtDate(p.createdAt) ?? '—'}</div>
                      </td>
                      {showImei && <td><code className="imei-code">{p.imei}</code></td>}
                      <td>{branchMap[String(p.branchId)] ?? '—'}</td>
                      <td>
                        {p.trackQuantity
                          ? `${Math.max(0, (p.quantity ?? 0) - (p.soldQuantity ?? 0))}/${p.quantity ?? 0}`
                          : '1'}
                      </td>
                      <td>
                        <span className={`badge-status badge-status--${p.status === 'in_stock' ? 'active' : p.status === 'sold' ? 'expired' : 'suspended'}`}>
                          {PRODUCT_STATUS_LABELS[p.status as ProductStatus]}
                        </span>
                        {p.status === 'sold' && p.soldAt && (
                          <div className="cell-sub">Sotildi: {fmtDate(p.soldAt)}</div>
                        )}
                      </td>
                      <td>{fmtMoney(p.purchasePrice)}</td>
                      <td>{fmtMoney(p.salePrice)}</td>
                      <td className="cell-actions">
                        <ProductRowActions
                          productId={String(p._id)}
                          status={p.status}
                          currentBranchId={String(p.branchId)}
                          trackQuantity={p.trackQuantity ?? false}
                          available={p.trackQuantity ? Math.max(0, (p.quantity ?? 0) - (p.soldQuantity ?? 0)) : 1}
                          salePrice={p.salePrice ?? 0}
                          richSale={richSale}
                          branches={filialBranches}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="pagination">
                {page > 1 && (
                  <Link href={pageUrl(page - 1)} className="btn btn-ghost btn-sm">← Oldingi</Link>
                )}
                <span className="pagination-info">{page} / {totalPages}</span>
                {page < totalPages && (
                  <Link href={pageUrl(page + 1)} className="btn btn-ghost btn-sm">Keyingi →</Link>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
