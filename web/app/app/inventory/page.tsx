import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter, isBranchScoped } from '@/lib/branchScope';
import { PRODUCT_STATUS_LABELS } from '@/lib/models/tenant/Product';
import { fmtMoney } from '@/lib/format';
import Icon from '@/components/icons/Icon';

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

  const byBranch = branches.map((b) => {
    const bid = String(b._id);
    const items = products.filter((p) => String(p.branchId) === bid);
    const totalValue = items.reduce((s, p) => s + p.salePrice, 0);
    return { branch: b, count: items.length, totalValue, items };
  });

  const totalProducts = products.length;
  const totalValue = products.reduce((s, p) => s + p.salePrice, 0);

  // Taqsimot chizig'i — filiallar ulushi (mahsulot soni bo'yicha)
  const PREVIEW = 20;
  const dist = byBranch.filter((b) => b.count > 0);

  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">Inventarizatsiya</h1>
          <p className="t-page-sub">Ombordagi qoldiq — filial bo&apos;yicha</p>
        </div>
        <div className="t-page-actions">
          <Link href="/app/products" className="btn btn-ghost btn-with-icon">
            <Icon name="box" size={18} /> Omborga o&apos;tish
          </Link>
        </div>
      </div>

      <section className="st-inv-bento" aria-label="Inventarizatsiya xulosasi">
        <div className="st-inv-hero">
          <div className="st-inv-hero-l">Sotuv qiymati</div>
          <div className="st-inv-hero-v">{fmtMoney(totalValue)} <small>so&apos;m</small></div>
          <div className="st-inv-hero-s">Omborda turgan barcha mahsulotlar sotuv narxida</div>
        </div>
        <div className="st-stat st-stat--ok">
          <div className="st-stat-l"><span className="st-stat-ic"><Icon name="box" size={15} /></span>Jami mahsulot</div>
          <div className="st-stat-v">{totalProducts} <small>ta</small></div>
        </div>
        <div className="st-stat">
          <div className="st-stat-l"><span className="st-stat-ic"><Icon name="building" size={15} /></span>Faol filial</div>
          <div className="st-stat-v">{branches.length}</div>
        </div>
      </section>

      {dist.length > 1 && totalProducts > 0 && (
        <section className="st-section" aria-labelledby="st-dist-title">
          <div className="st-ghead"><span id="st-dist-title">Filiallar ulushi</span></div>
          <div className="st-group st-dist">
            <div className="st-dist-bar" role="img" aria-label="Mahsulotlarning filiallar bo'yicha taqsimoti">
              {dist.map((b, i) => (
                <span
                  key={String(b.branch._id)}
                  className={`st-dist-seg st-c${i % 6}`}
                  style={{ width: `${(b.count / totalProducts) * 100}%` }}
                />
              ))}
            </div>
            <ul className="st-dist-legend">
              {dist.map((b, i) => (
                <li key={String(b.branch._id)}>
                  <span className={`st-dist-sw st-c${i % 6}`} aria-hidden="true" />
                  <span>{b.branch.name}</span>
                  <b>{Math.round((b.count / totalProducts) * 100)}%</b>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <div className="st-inv-grid st-section">
        {byBranch.map(({ branch, count, totalValue: tv, items }) => (
          <section key={String(branch._id)} aria-label={branch.name}>
            <div className="st-ghead">
              <span>{branch.name}</span>
              <strong>{count} ta · {fmtMoney(tv)} so&apos;m</strong>
            </div>
            <div className="st-group">
              {items.length === 0 ? (
                <div className="st-empty" style={{ padding: '28px 20px' }}>
                  <span className="st-empty-ic"><Icon name="box" size={22} /></span>
                  <p>Bu filialda mahsulot yo&apos;q.</p>
                </div>
              ) : (
                <>
                  {items.slice(0, PREVIEW).map((p) => (
                    <Link key={String(p._id)} href={`/app/products/${p._id}`} className="st-cell">
                      <span className="st-cell-t">
                        <b>{p.name}</b>
                        <small><code className="st-mono">{p.barcode || p.imei || '—'}</code> · {PRODUCT_STATUS_LABELS[p.status]}</small>
                      </span>
                      <span className="st-cell-v">{fmtMoney(p.salePrice)}</span>
                      <span className="st-cell-chev" aria-hidden="true"><Icon name="chevron" size={16} /></span>
                    </Link>
                  ))}
                  {items.length > PREVIEW && (
                    <Link href={`/app/products?branch=${branch._id}`} className="st-cell st-cell--more">
                      Yana {items.length - PREVIEW} ta — barchasini ko&apos;rish
                    </Link>
                  )}
                </>
              )}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
