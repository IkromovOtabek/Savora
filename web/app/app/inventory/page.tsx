import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter, isBranchScoped } from '@/lib/branchScope';
import { fmtMoney } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import Tilt from '@/components/ui/Tilt';
import { getDict } from '@/lib/i18n/server';
import { qtyWithUnit, tr } from '@/lib/i18n/fmt';
import { getStockQty } from '@/lib/productQuantity';
import { fmtQty, priceTimesQty, roundQty } from '@/lib/qty';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.stock.inventory.metaTitle };
}

export default async function InventoryPage() {
  const d = await getDict();
  const t = d.stock.inventory;
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
  // (kg/m… mahsulotda qoldiq kasr bo'lishi mumkin — qiymat butun so'mga yaxlitlanadi)
  const unitsOf = (p: (typeof products)[number]) => (p.trackQuantity ? getStockQty(p) : 1);
  const valueOf = (p: (typeof products)[number]) => priceTimesQty(p.salePrice ?? 0, unitsOf(p));

  const byBranch = branches
    .map((b) => {
      const bid = String(b._id);
      const items = products.filter((p) => String(p.branchId) === bid);
      const totalValue = items.reduce((s, p) => s + valueOf(p), 0);
      const units = roundQty(items.reduce((s, p) => s + unitsOf(p), 0));
      return { branch: b, count: items.length, units, totalValue, items };
    })
    // Mahsuloti bor filiallar oldinda — bo'shlari oxirida ixcham qatorda
    .sort((a, b) => (b.count > 0 ? 1 : 0) - (a.count > 0 ? 1 : 0) || b.totalValue - a.totalValue);

  const totalProducts = products.length;
  const totalUnits = roundQty(products.reduce((s, p) => s + unitsOf(p), 0));
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
          <h1 className="t-page-title">{t.title}</h1>
          <p className="t-page-sub">{t.subtitle}</p>
        </div>
        <div className="t-page-actions ux-hide-mobile">
          <Link href="/app/products" className="btn btn-ghost btn-with-icon">
            <Icon name="box" size={18} /> {t.goToStock}
          </Link>
        </div>
      </div>

      {/* Sahifaning asosiy ob'ekti — umumiy sotuv qiymati (3D to'plam) + filiallar ulushi */}
      <Tilt as="section" stack max={4} className="st-inv-hero">
        <div className="st-inv-hero-top">
          <div>
            <div className="st-inv-hero-l">{t.saleValue}</div>
            <div className="st-inv-hero-v ux-z">{fmtMoney(totalValue)} <small>{d.common.sum}</small></div>
            <div className="st-inv-hero-s">{t.saleValueHint}</div>
          </div>
          <dl className="st-inv-kpis">
            <div>
              <dt>{d.common.product}</dt>
              <dd>{totalProducts} <small>{t.types}</small></dd>
            </div>
            <div>
              <dt>{d.common.remaining}</dt>
              <dd>{fmtQty(totalUnits)} <small>{d.stock.unit}</small></dd>
            </div>
            <div>
              <dt>{d.common.branch}</dt>
              <dd>{branches.length}</dd>
            </div>
          </dl>
        </div>

        {shareBase > 0 && (
          <div className="st-inv-share">
            <div className="st-inv-share-h">
              <span>{t.shareTitle}</span>
              <span>{totalValue > 0 ? t.byValue : t.byUnits}</span>
            </div>
            <div
              className="st-dist-bar st-dist-bar--hero"
              role="img"
              aria-label={tr(t.shareAria, { list: filled.map((b) => `${b.branch.name} ${Math.round(shareOf(b))}%`).join(', ') })}
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
            <b>{t.emptyTitle}</b>
            <p>{t.emptyHint}</p>
            <Link href="/app/products" className="btn btn-tinted">{t.goToStock}</Link>
          </div>
        </div>
      ) : (
        <div className="st-inv-grid st-section">
          {filled.map(({ branch, count, units, totalValue: tv, items }) => (
            <section key={String(branch._id)} aria-label={branch.name}>
              <div className="st-ghead">
                <span>{branch.name}</span>
                <strong>{count === units ? tr(d.common.nPcs, { n: count }) : tr(t.typesUnits, { count, units: fmtQty(units) })} · {fmtMoney(tv)} {d.common.sum}</strong>
              </div>
              <div className="st-group">
                {items.slice(0, PREVIEW).map((p) => {
                  const u = unitsOf(p);
                  return (
                    <Link key={String(p._id)} href={`/app/products/${p._id}`} className="st-cell">
                      <span className="st-cell-t">
                        <b>{p.name}</b>
                        <small><code className="st-mono">{p.barcode || p.imei || '—'}</code> · {d.stock.status[p.status]}</small>
                      </span>
                      <span className="st-cell-v">
                        {fmtMoney(p.salePrice)}
                        {p.trackQuantity && <small className="st-cell-sub">× {qtyWithUnit(u, p.unit, d.stock.fields.units)}</small>}
                      </span>
                      <span className="st-cell-chev" aria-hidden="true"><Icon name="chevron" size={16} /></span>
                    </Link>
                  );
                })}
                {items.length > PREVIEW && (
                  <Link href={`/app/products?branch=${branch._id}`} className="st-cell st-cell--more">
                    {tr(t.more, { n: items.length - PREVIEW })}
                  </Link>
                )}
              </div>
            </section>
          ))}

          {empty.length > 0 && (
            <section aria-labelledby="st-inv-empty">
              <div className="st-ghead"><span id="st-inv-empty">{t.emptyBranches}</span><strong>{tr(d.common.nPcs, { n: empty.length })}</strong></div>
              <div className="st-group">
                {empty.map(({ branch }) => (
                  <div key={String(branch._id)} className="st-cell st-cell--quiet">
                    <span className="st-cell-ic" aria-hidden="true"><Icon name="building" size={15} /></span>
                    <span className="st-cell-t"><b>{branch.name}</b></span>
                    <span className="st-cell-v st-muted">{tr(d.common.nPcs, { n: 0 })}</span>
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
