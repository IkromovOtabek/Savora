import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter } from '@/lib/branchScope';
import { searchPattern } from '@/lib/security';
import { isImeiEnabled } from '@/lib/features';
import { resolveOrgPlan } from '@/lib/plans';
import { PRODUCT_STATUS_LABELS, ProductStatus } from '@/lib/models/tenant/Product';
import ProductSearch from '@/components/tenant/ProductSearch';
import ProductRowActions from '@/components/tenant/ProductRowActions';
import LimitBanner from '@/components/tenant/LimitBanner';
import { loadUserPermissions } from '@/lib/permissionGuard';
import Icon from '@/components/icons/Icon';
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

  return (
    <>
      {isAdmin && <LimitBanner label="Mahsulotlar" current={orgProductCount} max={maxProducts} />}
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">Ombor</h1>
          <p className="t-page-sub">
            Qoldiqdagi mahsulotlar
            {totalPages > 1 ? ` · ${page}-sahifa (${totalPages} ta)` : ''}
          </p>
        </div>
        <div className="t-page-actions">
          {perms.has('product.create') && (
            <Link href="/app/products/new" className="btn btn-primary btn-with-icon">
              <Icon name="plus" size={18} /> Mahsulot qo&apos;shish
            </Link>
          )}
          {features.export && perms.has('export.data') && (
            <a href="/api/export/products" className="btn btn-ghost btn-with-icon">
              <Icon name="download" size={18} /> CSV yuklab olish
            </a>
          )}
        </div>
      </div>

      {sp?.created === '1' && <div className="auth-alert auth-alert--info st-alert" role="status">Mahsulot qo&apos;shildi.</div>}
      {sp?.deleted === '1' && <div className="auth-alert auth-alert--info st-alert" role="status">Mahsulot o&apos;chirildi.</div>}

      <section className="st-stats" aria-label="Ombor xulosasi">
        <div className="st-stat">
          <div className="st-stat-l"><span className="st-stat-ic"><Icon name="box" size={15} /></span>Jami</div>
          <div className="st-stat-v">{fmtMoney(total)} <small>ta</small></div>
        </div>
        <div className="st-stat st-stat--ok">
          <div className="st-stat-l"><span className="st-stat-ic"><Icon name="check" size={15} /></span>Omborda</div>
          <div className="st-stat-v">{pageInStock}{perPageNote && <small> / {products.length}</small>}</div>
        </div>
        <div className="st-stat st-stat--warn">
          <div className="st-stat-l"><span className="st-stat-ic"><Icon name="alert" size={15} /></span>Kam qolgan</div>
          <div className="st-stat-v">{pageLow}</div>
        </div>
        <div className="st-stat st-stat--gold">
          <div className="st-stat-l"><span className="st-stat-ic"><Icon name="building" size={15} /></span>Filialga berilgan</div>
          <div className="st-stat-v">{pageInBranches}</div>
        </div>
      </section>
      <p className="st-stats-note">
        {perPageNote
          ? `"Jami" — barcha natijalar; qolganlari shu sahifadagi ${products.length} ta mahsulot bo'yicha.`
          : `"Kam qolgan" — qoldig'i ${LOW_STOCK} ta yoki undan kam (son bilan hisoblanadigan) mahsulotlar.`}
      </p>

      <ProductSearch
        branches={branches.map((b) => ({ id: String(b._id), name: b.name }))}
        initial={{ q: sp.q ?? '', branch: sp.branch ?? '', status: activeStatus }}
      />

      <nav className="st-chips" aria-label="Holat bo'yicha filtr">
        <Link href={statusUrl('')} className="st-chip" aria-current={activeStatus === '' ? 'page' : undefined}>Barchasi</Link>
        {statusChips.map((s) => (
          <Link key={s} href={statusUrl(s)} className="st-chip" aria-current={activeStatus === s ? 'page' : undefined}>
            {PRODUCT_STATUS_LABELS[s]}
          </Link>
        ))}
      </nav>

      {/* CSV Import vaqtincha yashirilgan
      <ProductImportForm branches={branches.map((b) => ({ id: String(b._id), name: b.name }))} />
      */}

      <div className="st-group st-list-wrap">
        {products.length === 0 ? (
          <div className="st-empty">
            <span className="st-empty-ic"><Icon name={q ? 'search' : 'box'} size={26} /></span>
            <h3>{q ? 'Hech narsa topilmadi' : 'Mahsulot topilmadi'}</h3>
            <p>
              {q
                ? `"${q}" bo'yicha mahsulot yo'q. Shtrix-kod, IMEI yoki nomni tekshirib ko'ring.`
                : 'Tanlangan filtr bo\'yicha omborda mahsulot yo\'q.'}
            </p>
            {!q && perms.has('product.create') && (
              <Link href="/app/products/new" className="btn btn-primary btn-with-icon">
                <Icon name="plus" size={18} /> Mahsulot qo&apos;shish
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="st-list-head" aria-hidden="true">
              <span />
              <span>Mahsulot</span>
              <span>Filial</span>
              <span>Son · holat</span>
              <span className="r">Narx</span>
              <span />
            </div>
            <ul className="st-list">
              {products.map((p) => {
                const avail = availableOf(p);
                const code = p.productId ?? String(p._id).slice(-8).toUpperCase();
                const branchName = branchMap[String(p.branchId)] ?? '—';
                const qtyCls = p.trackQuantity
                  ? avail === 0 ? ' st-qty--zero' : avail <= LOW_STOCK ? ' st-qty--low' : ''
                  : '';
                const qtyPill = p.trackQuantity ? (
                  <span className={`st-qty${qtyCls}`} title="Qoldiq / umumiy">
                    {avail}<small>/{p.quantity ?? 0}</small>
                  </span>
                ) : (
                  <span className="st-qty">1 <small>dona</small></span>
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
                        <code className="st-mono">{code}</code>
                        {showImei && p.imei && <code className="st-mono st-dotsep">{p.imei}</code>}
                        {!showImei && p.barcode && p.barcode !== code && <code className="st-mono st-dotsep">{p.barcode}</code>}
                        <span className="st-row-meta-branch st-dotsep">{branchName}</span>
                        <span className="st-dotsep">{fmtDate(p.createdAt) ?? '—'}</span>
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
                          {PRODUCT_STATUS_LABELS[p.status as ProductStatus]}
                        </span>
                      )}
                    </div>
                    <div className="st-row-price r">
                      {p.salePrice > 0 ? <b>{fmtMoney(p.salePrice)}</b> : <b className="st-noprice">Narx yo&apos;q</b>}
                      {canViewCost && <small>Kelish: {fmtMoney(p.purchasePrice)}</small>}
                    </div>
                    <div className="st-row-actions">
                      <ProductRowActions
                        productId={String(p._id)}
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
              <nav className="st-pager" aria-label="Sahifalar">
                {page > 1 && (
                  <Link href={pageUrl(page - 1)} className="btn btn-ghost btn-sm">← Oldingi</Link>
                )}
                <span className="st-pager-info">{page} / {totalPages}</span>
                {page < totalPages && (
                  <Link href={pageUrl(page + 1)} className="btn btn-ghost btn-sm">Keyingi →</Link>
                )}
              </nav>
            )}
          </>
        )}
      </div>
    </>
  );
}
