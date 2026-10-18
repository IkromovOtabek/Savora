import { getTenantSession } from '@/lib/tenantSession';
import { branchFilter, isBranchScoped } from '@/lib/branchScope';
import { userCan } from '@/lib/permissionGuard';
import { getStockQty } from '@/lib/productQuantity';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import StockAdjustForm, { type AdjustProduct } from './StockAdjustForm';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import './styles/stockAdjust.css';

const PRODUCT_LIMIT = 3000;

/** Qayta baholash / hisobdan chiqarish sahifasi: chapda hujjat, pastda hujjatlar tarixi */
export default async function StockAdjustPage({ mode }: { mode: 'revaluation' | 'writeoff' }) {
  const { user, Product, StockAdjustment } = await getTenantSession();
  const d = await getDict();
  const k = d.stock.adjust;
  const canViewCost = await userCan(user, 'product.viewCost');

  const [products, docs] = await Promise.all([
    Product.find({ ...branchFilter(user), status: 'in_stock' })
      .select('name imei barcode productId salePrice wholesalePrice purchasePrice trackQuantity quantity soldQuantity status')
      .sort({ name: 1 })
      .limit(PRODUCT_LIMIT)
      .lean(),
    StockAdjustment.find({ type: mode, ...(isBranchScoped(user) ? { branchId: user.branchId } : {}) })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean(),
  ]);

  const list: AdjustProduct[] = products.map((p) => ({
    id: String(p._id),
    name: p.name,
    code: p.barcode || p.productId || p.imei,
    salePrice: p.salePrice ?? 0,
    wholesalePrice: p.wholesalePrice && p.wholesalePrice > 0 ? p.wholesalePrice : undefined,
    tracked: p.trackQuantity ?? false,
    available: getStockQty(p),
    ...(canViewCost ? { purchasePrice: p.purchasePrice ?? 0 } : {}),
  }));

  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{mode === 'revaluation' ? k.revalTitle : k.woTitle}</h1>
          <p className="t-page-sub">{mode === 'revaluation' ? k.revalSub : k.woSub}</p>
        </div>
      </div>

      <StockAdjustForm mode={mode} products={list} />

      <h2 className="sa-h">{k.history}</h2>
      {docs.length === 0 ? (
        <div className="sa-empty sa-empty--sm"><span>{k.historyEmpty}</span></div>
      ) : (
        <ul className="sa-docs">
          {docs.map((doc) => (
            <li key={String(doc._id)}>
              <details>
                <summary>
                  <span className="sa-doc-no">{doc.docNo}</span>
                  <span className="sa-doc-meta">
                    <b>{tr(k.items, { n: doc.items.length })}{doc.reason ? ` · ${k.reasons[doc.reason]}` : ''}</b>
                    <small>{doc.createdAt ? fmtDateTime(doc.createdAt) : ''} · {doc.by}{doc.note ? ` · ${doc.note}` : ''}</small>
                  </span>
                  {mode === 'writeoff' && canViewCost && <b className="sa-doc-cost">− {fmtMoney(doc.totalCost)} {d.common.sum}</b>}
                </summary>
                <ul className="sa-doc-items">
                  {doc.items.map((it, i) => (
                    <li key={i}>
                      <span>{it.name}</span>
                      {mode === 'revaluation'
                        ? <span className="sa-doc-price">{fmtMoney(it.oldSalePrice ?? 0)} → <b>{fmtMoney(it.newSalePrice ?? 0)}</b></span>
                        : <span className="sa-doc-price">× {it.qty}{canViewCost ? ` · ${fmtMoney((it.qty ?? 0) * (it.purchasePrice ?? 0))}` : ''}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
