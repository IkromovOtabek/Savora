import { productionCtxFromSession } from '@/lib/production/session';
import { getOrder } from '@/lib/production/orders';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import { fmtQty } from '@/lib/qty';
import BackLink from '@/components/ui/BackLink';
import PrintButton from '@/components/ui/PrintButton';
import { qtyText, signedQty, unitName } from '@/components/production/common/ui';

export async function generateMetadata() {
  return { title: (await getDict()).production.orders.printTitle };
}

/**
 * Ishlab chiqarish aktining chop etiladigan varag'i (A4): rekvizitlar, reja va haqiqiy sarf, ish haqi, tannarx
 * (`production.viewCost` bo'lsa), izoh, imzolar. Oq qog'oz — mavzudan qat'i nazar.
 */
export default async function ProductionOrderPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await productionCtxFromSession();
  const d = ctx.d;
  const t = d.production.orders;
  const c = d.production.common;
  const p = d.production.print;
  const units = d.stock.fields.units;
  const res = await getOrder(ctx, id);
  if (!res.ok) {
    return (
      <>
        <BackLink href="/app/production">{t.back}</BackLink>
        <p className="t-note t-note--warn" role="alert">{res.error}</p>
      </>
    );
  }
  const o = res.data.order;
  const unit = o.recipe.unit;
  const showCost = o.can.viewCost && o.status === 'done';
  const usedMaterials = o.materials;
  const laborTotal = o.labor.reduce((s, l) => s + l.amount, 0);
  const materialsCost = usedMaterials.reduce((s, m) => s + (m.cost ?? 0), 0);
  const date = o.completedAt ?? o.createdAt;

  return (
    <div>
      {/* Faqat shu sahifada: A4 (global qoida — 80 mm chek) */}
      <style>{'@media print{@page{size:A4 portrait;margin:12mm}}'}</style>

      <div className="pr-print-bar no-print">
        <BackLink href={`/app/production/${o.id}`}>{o.docNo}</BackLink>
        <div className="pr-card-head">
          <div>
            <h1 className="pr-h">{t.printTitle}</h1>
            <p className="pr-hint">{t.printHint}</p>
          </div>
          <PrintButton label={t.print} />
        </div>
      </div>

      <article className="pr-sheet">
        <header className="pr-sheet-top">
          <div>
            <h1>{t.printTitle} № {o.docNo}</h1>
            <div>{c.orderStatuses[o.status]}{date ? ` · ${fmtDateTime(date)}` : ''}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div>{t.printShop}</div>
            <b>{ctx.orgName}</b>
          </div>
        </header>

        <dl className="pr-sheet-meta">
          <div><dt>{c.recipe}</dt><dd>{o.recipe.name} · {tr(d.production.recipes.versionShort, { v: o.recipe.version })}</dd></div>
          <div><dt>{c.output}</dt><dd>{o.recipe.outputName} ({o.recipe.outputCode})</dd></div>
          <div><dt>{c.planned}</dt><dd>{qtyText(o.plannedQty, unit, units)}</dd></div>
          {o.producedQty !== null && <div><dt>{c.produced}</dt><dd>{qtyText(o.producedQty, unit, units)}</dd></div>}
          {!!o.scrapQty && <div><dt>{c.scrap}</dt><dd>{qtyText(o.scrapQty, unit, units)}{o.scrapDocNo ? ` · ${o.scrapDocNo}` : ''}</dd></div>}
          <div><dt>{c.fromBranch}</dt><dd>{o.fromBranchName ?? '—'}</dd></div>
          <div><dt>{c.toBranch}</dt><dd>{o.toBranchName ?? '—'}</dd></div>
        </dl>

        <h2>{t.materials}</h2>
        <table>
          <thead>
            <tr>
              <th>{p.colNo}</th>
              <th>{p.colName}</th>
              <th>{p.colUnit}</th>
              <th className="r">{c.planned}</th>
              <th className="r">{c.actual}</th>
              <th className="r">{t.colVariance}</th>
              {showCost && <th className="r">{p.colPrice}</th>}
              {showCost && <th className="r">{p.colAmount}</th>}
            </tr>
          </thead>
          <tbody>
            {usedMaterials.map((m, i) => (
              <tr key={m.id}>
                <td>{i + 1}</td>
                <td>{m.name}<br /><small>{m.code}{m.extra ? ` · ${t.extra}` : ''}</small></td>
                <td>{unitName(m.unit, units)}</td>
                <td className="r">{fmtQty(m.plannedQty)}</td>
                <td className="r">{fmtQty(m.actualQty)}</td>
                <td className="r">{signedQty(m.variance)}</td>
                {showCost && <td className="r">{m.unitCost !== null ? fmtMoney(m.unitCost) : '—'}</td>}
                {showCost && <td className="r">{m.cost !== null ? fmtMoney(m.cost) : '—'}</td>}
              </tr>
            ))}
          </tbody>
          {showCost && (
            <tfoot>
              <tr>
                <td colSpan={7}>{p.total}</td>
                <td className="r">{fmtMoney(materialsCost)}</td>
              </tr>
            </tfoot>
          )}
        </table>

        {o.labor.length > 0 && (
          <>
            <h2>{t.labor}</h2>
            <table>
              <thead>
                <tr>
                  <th>{p.colNo}</th>
                  <th>{c.operation}</th>
                  <th>{c.worker}</th>
                  <th className="r">{p.colQty}</th>
                  <th className="r">{p.colPrice}</th>
                  <th className="r">{p.colAmount}</th>
                </tr>
              </thead>
              <tbody>
                {o.labor.map((l, i) => (
                  <tr key={l.id}>
                    <td>{i + 1}</td>
                    <td>{l.operation}</td>
                    <td>{l.workerName ?? '—'}</td>
                    <td className="r">{fmtQty(l.qty)}</td>
                    <td className="r">{fmtMoney(l.rate)}</td>
                    <td className="r">{fmtMoney(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>{p.total}</td>
                  <td className="r">{fmtMoney(laborTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </>
        )}

        {o.cost && (
          <>
            <h2>{t.costTitle}</h2>
            <table>
              <tbody>
                <tr><td>{d.production.reports.materials}</td><td className="r">{fmtMoney(o.cost.materials)} {d.common.sum}</td></tr>
                <tr><td>{d.production.reports.labor}</td><td className="r">{fmtMoney(o.cost.labor)} {d.common.sum}</td></tr>
                <tr><td>{d.production.reports.overhead}</td><td className="r">{fmtMoney(o.cost.overhead)} {d.common.sum}</td></tr>
                <tr><td><b>{c.total}</b></td><td className="r"><b>{fmtMoney(o.cost.total)} {d.common.sum}</b></td></tr>
                <tr><td>{t.costUnit}</td><td className="r">{fmtMoney(o.cost.unitCost)} {d.common.sum}</td></tr>
                {o.cost.scrap > 0 && <tr><td>{t.costScrap}</td><td className="r">{fmtMoney(o.cost.scrap)} {d.common.sum}</td></tr>}
              </tbody>
            </table>
          </>
        )}

        {o.note && <p className="pr-sheet-note"><b>{c.note}:</b> {o.note}</p>}

        <div className="pr-sign">
          <div>{t.printGave}<span>&nbsp;</span></div>
          <div>{t.printChief}<span>&nbsp;</span></div>
          <div>{t.printTook}<span>&nbsp;</span></div>
        </div>
      </article>
    </div>
  );
}
