import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter, isBranchScoped } from '@/lib/branchScope';
import { PRODUCT_STATUS_LABELS } from '@/lib/models/tenant/Product';
import { fmtMoney } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import Tilt from '@/components/ui/Tilt';

export const metadata = { title: 'Inventarizatsiya — Savora' };

export default async function InventoryPage() {
  const { user, Product, Branch } = await getTenantSession();

  const branchScopeFilter = branchFilter(user);
  const [branchesAll, products] = await Promise.all([
    Branch.find({ active: true }).lean(),
    Product.find({ ...branchScopeFilter, status: 'in_stock' }).lean(),
  ]);
  // Filial login — faqat o'z filiali ko'rinadi
  const branches = isBranchScoped(user)
    ? branchesAll.filter((b) => String(b._id) === user.branchId)
    : branchesAll;

  // Son bilan hisoblanadigan mahsulotda qoldiq (umumiy − sotilgan) dona; aks holda 1 dona
  const unitsOf = (p: (typeof products)[number]) =>
    p.trackQuantity ? Math.max(0, (p.quantity ?? 0) - (p.soldQuantity ?? 0)) : 1;
  const valueOf = (p: (typeof products)[number]) => (p.salePrice ?? 0) * unitsOf(p);

  const byBranch = branches
    .map((b) => {
      const bid = String(b._id);
      const items = products.filter((p) => String(p.branchId) === bid);
      const totalValue = items.reduce((s, p) => s + valueOf(p), 0);
      const units = items.reduce((s, p) => s + unitsOf(p), 0);
      return { branch: b, count: items.length, units, totalValue, items };
    })
    // Mahsuloti bor filiallar oldinda — bo'shlari oxirida ixcham qatorda
    .sort((a, b) => (b.count > 0 ? 1 : 0) - (a.count > 0 ? 1 : 0) || b.totalValue - a.totalValue);

  const totalProducts = products.length;
  const totalUnits = products.reduce((s, p) => s + unitsOf(p), 0);
  const totalValue = products.reduce((s, p) => s + valueOf(p), 0);

  const PREVIEW = 20;
  const filled = byBranch.filter((b) => b.count > 0);
  const empty = byBranch.filter((b) => b.count === 0);
  // Ulush — sotuv qiymati bo'yicha (qiymat yo'q bo'lsa — dona bo'yicha)
  const shareBase = totalValue > 0 ? totalValue : totalUnits;
  const shareOf = (b: (typeof byBranch)[number]) =>
    shareBase > 0 ? ((totalValue > 0 ? b.totalValue : b.units) / shareBase) * 100 : 0;

  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">Inventarizatsiya</h1>
          <p className="t-page-sub">Ombordagi qoldiq — filial bo&apos;yicha</p>
        </div>
        <div className="t-page-actions ux-hide-mobile">
          <Link href="/app/products" className="btn btn-ghost btn-with-icon">
            <Icon name="box" size={18} /> Omborga o&apos;tish
          </Link>
        </div>
      </div>

      {/* Sahifaning asosiy ob'ekti — umumiy sotuv qiymati (3D to'plam) + filiallar ulushi */}
      <Tilt as="section" stack max={4} className="st-inv-hero">
        <div className="st-inv-hero-top">
          <div>
            <div className="st-inv-hero-l">Sotuv qiymati</div>
            <div className="st-inv-hero-v ux-z">{fmtMoney(totalValue)} <small>so&apos;m</small></div>
            <div className="st-inv-hero-s">Omborda turgan barcha mahsulotlar sotuv narxida</div>
          </div>
          <dl className="st-inv-kpis">
            <div>
              <dt>Mahsulot</dt>
              <dd>{totalProducts} <small>tur</small></dd>
            </div>
            <div>
              <dt>Qoldiq</dt>
              <dd>{totalUnits} <small>dona</small></dd>
            </div>
            <div>
              <dt>Filial</dt>
              <dd>{branches.length}</dd>
            </div>
          </dl>
        </div>

        {shareBase > 0 && (
          <div className="st-inv-share">
            <div className="st-inv-share-h">
              <span>Filiallar ulushi</span>
              <span>{totalValue > 0 ? 'qiymat bo\'yicha' : 'dona bo\'yicha'}</span>
            </div>
            <div
              className="st-dist-bar st-dist-bar--hero"
              role="img"
              aria-label={`Filiallar ulushi: ${filled.map((b) => `${b.branch.name} ${Math.round(shareOf(b))}%`).join(', ')}`}
            >
              {filled.map((b, i) => (
                <span
                  key={String(b.branch._id)}
                  className={`st-dist-seg st-hc${i % 4}`}
                  style={{ width: `${shareOf(b)}%` }}
                />
              ))}
            </div>
            <ul className="st-inv-legend">
              {filled.map((b, i) => (
                <li key={String(b.branch._id)}>
                  <span className={`st-dist-sw st-hc${i % 4}`} aria-hidden="true" />
                  <span className="st-inv-legend-n">{b.branch.name}</span>
                  <b>{Math.round(shareOf(b))}%</b>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Tilt>

      {totalProducts === 0 ? (
        <div className="st-group st-section">
          <div className="ux-empty">
            <span className="ux-empty-ic"><Icon name="clipboard" size={26} /></span>
            <b>Omborda qoldiq yo&apos;q</b>
            <p>Mahsulot qo&apos;shilgach, filiallar bo&apos;yicha qoldiq shu yerda hisoblanadi.</p>
            <Link href="/app/products" className="btn btn-tinted">Omborga o&apos;tish</Link>
          </div>
        </div>
      ) : (
        <div className="st-inv-grid st-section">
          {filled.map(({ branch, count, units, totalValue: tv, items }) => (
            <section key={String(branch._id)} aria-label={branch.name}>
              <div className="st-ghead">
                <span>{branch.name}</span>
                <strong>{count === units ? `${count} ta` : `${count} tur · ${units} dona`} · {fmtMoney(tv)} so&apos;m</strong>
              </div>
              <div className="st-group">
                {items.slice(0, PREVIEW).map((p) => {
                  const u = unitsOf(p);
                  return (
                    <Link key={String(p._id)} href={`/app/products/${p._id}`} className="st-cell">
                      <span className="st-cell-t">
                        <b>{p.name}</b>
                        <small><code className="st-mono">{p.barcode || p.imei || '—'}</code> · {PRODUCT_STATUS_LABELS[p.status]}</small>
                      </span>
                      <span className="st-cell-v">
                        {fmtMoney(p.salePrice)}
                        {p.trackQuantity && <small className="st-cell-sub">× {u} dona</small>}
                      </span>
                      <span className="st-cell-chev" aria-hidden="true"><Icon name="chevron" size={16} /></span>
                    </Link>
                  );
                })}
                {items.length > PREVIEW && (
                  <Link href={`/app/products?branch=${branch._id}`} className="st-cell st-cell--more">
                    Yana {items.length - PREVIEW} ta — barchasini ko&apos;rish
                  </Link>
                )}
              </div>
            </section>
          ))}

          {empty.length > 0 && (
            <section aria-labelledby="st-inv-empty">
              <div className="st-ghead"><span id="st-inv-empty">Mahsulotsiz filiallar</span><strong>{empty.length} ta</strong></div>
              <div className="st-group">
                {empty.map(({ branch }) => (
                  <div key={String(branch._id)} className="st-cell st-cell--quiet">
                    <span className="st-cell-ic" aria-hidden="true"><Icon name="building" size={15} /></span>
                    <span className="st-cell-t"><b>{branch.name}</b></span>
                    <span className="st-cell-v st-muted">0 ta</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
