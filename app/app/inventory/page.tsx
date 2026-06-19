import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter, isBranchScoped } from '@/lib/branchScope';
import { PRODUCT_STATUS_LABELS } from '@/lib/models/tenant/Product';
import { fmtMoney } from '@/lib/format';

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

  return (
    <>
      <div className="dash-head dash-head--simple">
        <div>
          <h1 className="dash-hello">Inventarizatsiya</h1>
          <p className="dash-sub">Ombordagi qoldiq — filial bo&apos;yicha</p>
        </div>
        <Link href="/app/products" className="btn btn-ghost">Omborga o&apos;tish</Link>
      </div>

      <div className="dash-stats">
        <div className="dash-stat dash-stat--ok">
          <div className="dash-stat-n">{totalProducts}</div>
          <div className="dash-stat-l">Jami mahsulot</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat-n">{fmtMoney(totalValue)}</div>
          <div className="dash-stat-l">Sotuv qiymati</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat-n">{branches.length}</div>
          <div className="dash-stat-l">Faol filial</div>
        </div>
      </div>

      {byBranch.map(({ branch, count, totalValue: tv, items }) => (
        <div key={String(branch._id)} className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-head">
            <h2>{branch.name}</h2>
            <span className="panel-sub">{count} ta · {fmtMoney(tv)} so&apos;m</span>
          </div>
          {items.length === 0 ? (
            <div className="panel-empty"><p>Bu filialda mahsulot yo&apos;q.</p></div>
          ) : (
            <div className="table-wrap">
              <table className="data-table data-table--simple">
                <thead><tr><th>Mahsulot</th><th>Kod</th><th>Narx</th><th>Holat</th></tr></thead>
                <tbody>
                  {items.slice(0, 20).map((p) => (
                    <tr key={String(p._id)}>
                      <td><Link href={`/app/products/${p._id}`} className="cell-link">{p.name}</Link></td>
                      <td><code className="imei-code">{p.barcode || p.imei}</code></td>
                      <td>{fmtMoney(p.salePrice)}</td>
                      <td>{PRODUCT_STATUS_LABELS[p.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
