import Link from 'next/link';
import type { CSSProperties } from 'react';
import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter, isBranchScoped } from '@/lib/branchScope';
import { searchPattern } from '@/lib/security';
import { isImeiEnabled } from '@/lib/features';
import { resolveOrgPlan } from '@/lib/plans';
import { PRODUCT_STATUS_LABELS, ProductStatus } from '@/lib/models/tenant/Product';
import ProductSearch from '@/components/tenant/ProductSearch';
import ProductRowActions from '@/components/tenant/ProductRowActions';
import LimitBanner from '@/components/tenant/LimitBanner';
import { loadUserPermissions } from '@/lib/permissionGuard';
import Icon from '@/components/icons/Icon';
import MoreMenu from '@/components/ui/MoreMenu';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
// import ProductImportForm from '@/components/tenant/ProductImportForm'; // CSV Import vaqtincha yashirilgan

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.stock.list.metaTitle };
}

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
  const d = await getDict();
  const t = d.stock.list;
  const { user, Product, Branch, org, features } = await getTenantSession();
  const showImei = isImeiEnabled(org);
  const perms = await loadUserPermissions(user);
  const canViewCost = perms.has('product.viewCost');
  const canInstallment = !!(features.variant || features.nasiya);
  const canCredit = !!features.creditKassa;

  const branches = await Branch.find({ active: true }).sort({ name: 1 }).lean();
  const branchMap = Object.fromEntries(branches.map((b) => [String(b._id), b.name]));
  // "Filialga berish" maqsadi — faqat filiallar (asosiy ombor emas)
  const filialBranches = branches.filter((b) => !b.isMain).map((b) => ({ id: String(b._id), name: b.name }));

  const filter: Record<string, unknown> = {};
  const q = (sp.q ?? '').trim();
  if (q) {
    // Regex injection/ReDoS himoyasi: ekranlangan, 50 belgigacha
    const pattern = searchPattern(q);
    const qNoSpace = searchPattern(q.replace(/\s/g, ''));
    filter.$or = [
      { name: { $regex: pattern, $options: 'i' } },
      { imei: { $regex: qNoSpace, $options: 'i' } },
      { barcode: { $regex: qNoSpace, $options: 'i' } },
      { productId: { $regex: qNoSpace, $options: 'i' } },
    ];
  }
  if (sp.branch && /^[a-f0-9]{24}$/i.test(sp.branch)) filter.branchId = sp.branch;
  // Ombor faqat QOLDIQ mahsulotlarni ko'rsatadi — sotilganlar bu yerda emas, "Sotildi" sahifasida.
  if (sp.status && sp.status !== 'sold' && sp.status in PRODUCT_STATUS_LABELS) {
    filter.status = sp.status;
  } else {
    filter.status = { $ne: 'sold' };
  }
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
  const orgProductCount = isAdmin ? await Product.countDocuments({ status: { $ne: 'sold' } }) : 0;

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (sp.branch) params.set('branch', sp.branch);
    if (sp.status) params.set('status', sp.status);
    if (p > 1) params.set('page', String(p));
    const s = params.toString();
    return `/app/products${s ? `?${s}` : ''}`;
  }

  // Holat chiplari — qidiruv va filial saqlanadi, sahifa 1 ga qaytadi
  function statusUrl(status: string) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (sp.branch) params.set('branch', sp.branch);
    if (status) params.set('status', status);
    const s = params.toString();
    return `/app/products${s ? `?${s}` : ''}`;
  }
  const activeStatus = sp.status && sp.status !== 'sold' && sp.status in PRODUCT_STATUS_LABELS ? sp.status : '';
  const statusChips = (Object.keys(PRODUCT_STATUS_LABELS) as ProductStatus[]).filter((s) => s !== 'sold');

  // Xulosa — faqat shu sahifada yuklangan mahsulotlardan (qo'shimcha so'rovsiz)
  const mainBranchIds = new Set(branches.filter((b) => b.isMain).map((b) => String(b._id)));
  const availableOf = (p: (typeof products)[number]) =>
    p.trackQuantity ? Math.max(0, (p.quantity ?? 0) - (p.soldQuantity ?? 0)) : 1;
  const LOW_STOCK = 2;
  const pageInStock = products.filter((p) => p.status === 'in_stock').length;
  const pageLow = products.filter((p) => p.trackQuantity && availableOf(p) <= LOW_STOCK).length;
  const pageInBranches = products.filter((p) => !mainBranchIds.has(String(p.branchId))).length;
  const perPageNote = totalPages > 1;

  // Filial login — filial tanlovi va "Filiallarda" ko'rsatkichi ma'nosiz (faqat o'z filiali)
  const scoped = isBranchScoped(user);
  const canCreate = perms.has('product.create');
  const canExport = !!features.export && perms.has('export.data');
  const hasFilter = !!(q || activeStatus || sp.branch);
  // Bo'sh omborda nol kartalar o'rniga darhol bo'sh holat ko'rinadi
  const showStats = total > 0 || hasFilter;
  // Izoh endi kartaning title'ida (sichqoncha) va ekran o'quvchisi uchun sr-only matnda
  const pageHint = perPageNote ? tr(t.pageHint, { n: products.length }) : undefined;

  return (
    <>
      {isAdmin && <LimitBanner label={d.common.products} current={orgProductCount} max={maxProducts} />}
      <div className="t-page-head st-head">
        <div>
          <h1 className="t-page-title">{t.title}</h1>
          <p className="t-page-sub">
            {t.subtitle}
            {totalPages > 1 ? tr(t.pageOf, { page, total: totalPages }) : ''}
          </p>
        </div>
        <div className="t-page-actions">
          {canCreate && (
            <Link href="/app/products/new" className="btn btn-primary btn-with-icon ux-hide-mobile">
              <Icon name="plus" size={18} /> {t.addProduct}
            </Link>
          )}
          <MoreMenu label={t.menuLabel}>
            <Link href="/app/inventory"><Icon name="clipboard" size={18} /> {t.inventory}</Link>
            {canExport && (
              <a href="/api/export/products"><Icon name="download" size={18} /> {t.exportCsv}</a>
            )}
          </MoreMenu>
        </div>
      </div>

      {sp?.created === '1' && <div className="auth-alert auth-alert--info st-alert" role="status">{t.created}</div>}
      {sp?.deleted === '1' && <div className="auth-alert auth-alert--info st-alert" role="status">{t.deleted}</div>}

      {showStats && (
        <section
          className="ux-strip st-strip"
          style={{ '--ux-cols': scoped ? 3 : 4 } as CSSProperties}
          aria-label={t.summaryLabel}
        >
          <div className="ux-stat">
            <div className="ux-stat-l"><span className="ux-clay st-clay-sm" aria-hidden="true"><Icon name="box" size={15} /></span>{d.common.total}</div>
            <div className="ux-stat-v">{fmtMoney(total)}<small>{d.common.pcs}</small></div>
          </div>
          <div className="ux-stat" title={pageHint}>
            <div className="ux-stat-l"><span className="ux-clay ux-clay--green st-clay-sm" aria-hidden="true"><Icon name="check" size={15} /></span>{t.inStock}</div>
            <div className="ux-stat-v">{pageInStock}{perPageNote && <small>/ {products.length}</small>}</div>
            {pageHint && <span className="sr-only">{pageHint}</span>}
          </div>
          <div
            className="ux-stat"
            title={`${tr(t.lowStockTitle, { n: LOW_STOCK })}${pageHint ? `. ${pageHint}` : ''}`}
          >
            <div className="ux-stat-l">
              <span className={`ux-clay ${pageLow > 0 ? 'ux-clay--gold' : 'ux-clay--gray'} st-clay-sm`} aria-hidden="true"><Icon name="alert" size={15} /></span>
              {t.lowStock}
              <span className="st-info" aria-hidden="true">i</span>
            </div>
            <div className="ux-stat-v">{pageLow}</div>
            <span className="sr-only">{tr(t.lowStockSr, { n: LOW_STOCK })} {pageHint}</span>
          </div>
          {!scoped && (
            <div className="ux-stat" title={pageHint}>
              <div className="ux-stat-l"><span className="ux-clay ux-clay--gold st-clay-sm" aria-hidden="true"><Icon name="building" size={15} /></span>{t.inBranches}</div>
              <div className="ux-stat-v">{pageInBranches}</div>
              {pageHint && <span className="sr-only">{pageHint}</span>}
            </div>
          )}
        </section>
      )}

      <ProductSearch
        branches={scoped ? [] : branches.map((b) => ({ id: String(b._id), name: b.name }))}
        initial={{ q: sp.q ?? '', branch: sp.branch ?? '', status: activeStatus }}
      >
        <Link href={statusUrl('')} className="st-chip" aria-current={activeStatus === '' ? 'page' : undefined}>{d.common.all}</Link>
        {statusChips.map((s) => (
          <Link key={s} href={statusUrl(s)} className="st-chip" aria-current={activeStatus === s ? 'page' : undefined}>
            {d.stock.status[s]}
          </Link>
        ))}
      </ProductSearch>

      {/* CSV Import vaqtincha yashirilgan
      <ProductImportForm branches={branches.map((b) => ({ id: String(b._id), name: b.name }))} />
      */}

      <div className="st-group st-list-wrap">
        {products.length === 0 ? (
          <div className="ux-empty">
            <span className="ux-empty-ic"><Icon name={q ? 'search' : 'box'} size={26} /></span>
            <b>{q ? d.common.nothingFound : hasFilter ? t.emptyFilter : t.emptyNoProducts}</b>
            <p>
              {q
                ? tr(t.emptyQueryHint, { q })
                : hasFilter
                  ? t.emptyFilterHint
                  : t.emptyHint}
            </p>
            {hasFilter ? (
              <Link href="/app/products" className="btn btn-tinted">{t.clearFilter}</Link>
            ) : canCreate && (
              <Link href="/app/products/new" className="btn btn-primary btn-with-icon">
                <Icon name="plus" size={18} /> {t.addProduct}
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="st-list-head" aria-hidden="true">
              <span />
              <span>{d.common.product}</span>
              <span>{d.common.branch}</span>
              <span>{t.colQtyStatus}</span>
              <span className="r">{d.common.price}</span>
              <span />
            </div>
            <ul className="st-list">
              {products.map((p) => {
                const avail = availableOf(p);
                const code = p.productId ?? String(p._id).slice(-8).toUpperCase();
                const branchName = branchMap[String(p.branchId)] ?? '—';
                // Ikkinchi kod (IMEI yoki shtrix) — mobilda ichki kod o'rniga shu ko'rinadi
                const secCode = showImei ? p.imei || '' : p.barcode && p.barcode !== code ? p.barcode : '';
                const qtyCls = p.trackQuantity
                  ? avail === 0 ? ' st-qty--zero' : avail <= LOW_STOCK ? ' st-qty--low' : ''
                  : '';
                const qtyPill = p.trackQuantity ? (
                  <span className={`st-qty${qtyCls}`} title={t.qtyTitle}>
                    {avail}<small>/{p.quantity ?? 0}</small>
                  </span>
                ) : (
                  <span className="st-qty">1 <small>{d.stock.unit}</small></span>
                );
                return (
                  <li key={String(p._id)} className="st-row">
                    <span className="st-thumb" aria-hidden="true">
                      {p.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.photoUrl} alt="" loading="lazy" />
                      ) : (
                        <span className="st-thumb-letter">{(p.name ?? '').trim().charAt(0).toUpperCase() || '?'}</span>
                      )}
                    </span>
                    <div className="st-row-main">
                      <Link href={`/app/products/${p._id}`} className="st-row-name">{p.name}</Link>
                      <div className="st-row-meta">
                        <code className={`st-mono${secCode ? ' st-meta-code' : ''}`}>{code}</code>
                        {secCode && <code className="st-mono st-dotsep st-meta-sec">{secCode}</code>}
                        {!scoped && <span className="st-row-meta-branch st-dotsep">{branchName}</span>}
                        <span className="st-dotsep st-meta-date">{fmtDate(p.createdAt) ?? '—'}</span>
                      </div>
                    </div>
                    <div className="st-row-branch">
                      <Icon name="building" size={14} />
                      <span>{branchName}</span>
                    </div>
                    <div className="st-row-status">
                      {qtyPill}
                      {p.status !== 'in_stock' && (
                        <span className={`st-pill st-pill--${p.status}`}>
                          {d.stock.status[p.status as ProductStatus]}
                        </span>
                      )}
                    </div>
                    <div className="st-row-price r">
                      {p.salePrice > 0 ? <b>{fmtMoney(p.salePrice)}</b> : <b className="st-noprice">{t.noPrice}</b>}
                      {canViewCost && <small>{tr(t.cost, { sum: fmtMoney(p.purchasePrice) })}</small>}
                    </div>
                    <div className="st-row-actions">
                      <ProductRowActions
                        productId={String(p._id)}
                        productName={p.name}
                        status={p.status}
                        currentBranchId={String(p.branchId)}
                        trackQuantity={p.trackQuantity ?? false}
                        available={avail}
                        salePrice={p.salePrice ?? 0}
                        canInstallment={canInstallment}
                        canCredit={canCredit}
                        canSell={features.sales && perms.has('sale.create')}
                        canTransfer={perms.has('transfer.create')}
                        branches={filialBranches}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>

            {totalPages > 1 && (
              <nav className="st-pager" aria-label={t.pagerLabel}>
                {page > 1 && (
                  <Link href={pageUrl(page - 1)} className="btn btn-ghost btn-sm">{t.prevPage}</Link>
                )}
                <span className="st-pager-info">{page} / {totalPages}</span>
                {page < totalPages && (
                  <Link href={pageUrl(page + 1)} className="btn btn-ghost btn-sm">{t.nextPage}</Link>
                )}
              </nav>
            )}
          </>
        )}
      </div>

      {canCreate && (
        <Link href="/app/products/new" className="ux-fab" aria-label={t.addProduct}>
          <Icon name="plus" size={20} /> {t.fab}
        </Link>
      )}
    </>
  );
}
