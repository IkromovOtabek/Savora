import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter, isBranchScoped } from '@/lib/branchScope';
import { fmtMoney } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import Tilt from '@/components/ui/Tilt';
import { getDict } from '@/lib/i18n/server';
import { qtyByUnits, qtyWithUnit, tr } from '@/lib/i18n/fmt';
import { getStockQty } from '@/lib/productQuantity';
import { fmtQty, priceTimesQty } from '@/lib/qty';
import { addQtyByUnit, qtyByUnitEntries, singleUnit, type QtyByUnit } from '@/lib/unitTotals';

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
    // Inventarizatsiya — faqat jismoniy tovar (xizmat/to'plam sanalmaydi)
    Product.find({ ...branchScopeFilter, status: 'in_stock', kind: { $nin: ['service', 'bundle'] } }).lean(),
  ]);
  // Filial login — faqat o'z filiali ko'rinadi
  const branches = isBranchScoped(user)
    ? branchesAll.filter((b) => String(b._id) === user.branchId)
    : branchesAll;

  // Son bilan hisoblanadigan mahsulotda qoldiq (umumiy − sotilgan); aks holda 1 dona
  // (kg/m… mahsulotda qoldiq kasr bo'lishi mumkin — qiymat butun so'mga yaxlitlanadi)
  const unitsOf = (p: (typeof products)[number]) => (p.trackQuantity ? getStockQty(p) : 1);
  const valueOf = (p: (typeof products)[number]) => priceTimesQty(p.salePrice ?? 0, unitsOf(p));
  // Miqdor birlik bo'yicha yig'iladi — "dona" va "kg" bitta songa qo'shilmaydi
  const qtyOf = (items: typeof products) =>
    items.reduce<QtyByUnit>((acc, p) => addQtyByUnit(acc, unitsOf(p), p.trackQuantity ? p.unit : 'dona'), {});

  const byBranch = branches
    .map((b) => {
      const bid = String(b._id);
      const items = products.filter((p) => String(p.branchId) === bid);
      const totalValue = items.reduce((s, p) => s + valueOf(p), 0);
      const qty = qtyOf(items);
      return { branch: b, count: items.length, qty, totalValue, items };
    })
    // Mahsuloti bor filiallar oldinda — bo'shlari oxirida ixcham qatorda
    .sort((a, b) => (b.count > 0 ? 1 : 0) - (a.count > 0 ? 1 : 0) || b.totalValue - a.totalValue);

  const totalProducts = products.length;
  const totalQty = qtyOf(products);
  const totalUnit = singleUnit(totalQty);
  const totalValue = products.reduce((s, p) => s + valueOf(p), 0);

  const PREVIEW = 20;
  const filled = byBranch.filter((b) => b.count > 0);
  const empty = byBranch.filter((b) => b.count === 0);
  // Ulush — sotuv qiymati bo'yicha; qiymat yo'q bo'lsa — miqdor bo'yicha (birlik bitta bo'lsa),
  // birliklar aralash bo'lsa — mahsulot turlari soni bo'yicha (dona + kg qo'shilmaydi)
  const shareBy = totalValue > 0 ? 'value' : totalUnit ? 'units' : 'types';
  const metricOf = (v: number, qty: QtyByUnit, count: number) =>
    shareBy === 'value' ? v : shareBy === 'units' ? (qty[totalUnit!] ?? 0) : count;
  const shareBase = metricOf(totalValue, totalQty, totalProducts);
  const shareOf = (b: (typeof byBranch)[number]) =>
    shareBase > 0 ? (metricOf(b.totalValue, b.qty, b.count) / shareBase) * 100 : 0;

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
              {/* Birliklar aralash bo'lsa — har biri alohida (dona + kg qo'shilmaydi), tor ekranda qatorga o'tadi */}
              <dd className="st-inv-qty">
                {qtyByUnitEntries(totalQty).length === 0
                  ? <span>0 <small>{d.stock.unit}</small></span>
                  : qtyByUnitEntries(totalQty).map(([u, n]) => (
                    <span key={u}>{fmtQty(n)} <small>{d.stock.fields.units[u]}</small></span>
                  ))}
              </dd>
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
              <span>{shareBy === 'value' ? t.byValue : shareBy === 'units' ? t.byUnits : t.byTypes}</span>
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
          {filled.map(({ branch, count, qty, totalValue: tv, items }) => (
            <section key={String(branch._id)} aria-label={branch.name}>
              <div className="st-ghead">
                <span>{branch.name}</span>
                <strong>{singleUnit(qty) === 'dona' && qty.dona === count ? tr(d.common.nPcs, { n: count }) : tr(t.typesUnits, { count, units: qtyByUnits(qty, d.stock.fields.units) })} · {fmtMoney(tv)} {d.common.sum}</strong>
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
