import Link from 'next/link';
import { sumMoney, type MoneyKind, type MoneyRow } from '@/lib/realization';
import { IN_KINDS, OUT_KINDS, sumByKind } from '@/lib/dayFlow';
import { amtTone, fmtDateTime, fmtMoney } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import '@/components/tenant/styles/finance.css';

/** Ekranda ko'rsatiladigan qatorlar (to'liq ro'yxat — Moliya → Realizatsiya Excel'ida) */
const SHOW_LIMIT = 300;

const KIND_ICON: Record<MoneyKind, 'cart' | 'wallet' | 'building' | 'arrowLeft' | 'arrowRight' | 'repeat' | 'box'> = {
  salePay: 'cart',
  debtPay: 'wallet',
  bank: 'building',
  income: 'arrowLeft',
  expense: 'arrowRight',
  refund: 'repeat',
  supplier: 'box',
};

/**
 * Bir kunning barcha pul harakati: jami kirim/chiqim/natija, tur bo'yicha tarkib va kun davomidagi ro'yxat
 * (Kassa → «Kirim-chiqim» va Moliya → «Kirim-chiqim»). `rows` — filial bo'yicha cheklangan, eng yangisi tepada.
 * `scoped` — filial login: Moliya/yetkazib beruvchi sahifalariga kira olmaydi, faqat sotuv havolasi.
 */
export default async function DayFlowView({
  rows,
  branchNames,
  scoped,
  headingId,
}: {
  rows: MoneyRow[];
  branchNames: Map<string, string>;
  scoped: boolean;
  headingId: string;
}) {
  const d = await getDict();
  const k = d.sales.kassa;
  const mk = d.crm.money;
  const sums = sumMoney(rows);
  const byKind = sumByKind(rows);
  const canOpen = (href?: string) => !!href && (!scoped || href.startsWith('/app/sales/'));
  const hhmm = (at: Date) => fmtDateTime(at).slice(-5);
  const parts = (kinds: readonly MoneyKind[]) => kinds.filter((x) => byKind[x] > 0);
  const inParts = parts(IN_KINDS);
  const outParts = parts(OUT_KINDS);

  return (
    <>
      <div className="fx-sums fx-day-sums">
        <div className="ux-stat"><div className="ux-stat-l">{mk.totalIn}</div><div className="ux-stat-v t-num amt-pos">+ {fmtMoney(sums.in)}</div></div>
        <div className="ux-stat"><div className="ux-stat-l">{mk.totalOut}</div><div className="ux-stat-v t-num amt-neg">− {fmtMoney(sums.out)}</div></div>
        <div className="ux-stat"><div className="ux-stat-l">{mk.net}</div><div className={`ux-stat-v t-num ${amtTone(sums.net)}`}>{fmtMoney(sums.net)}<small>{d.common.sum}</small></div></div>
      </div>

      {rows.length > 0 && (
        <div className="fx-day-parts">
          <section className="fx-card">
            <h2 className="fx-h">{k.flowInParts}</h2>
            {inParts.length === 0 ? <p className="field-hint">{k.flowNone}</p> : (
              <ul className="fx-cats">
                {inParts.map((x) => (
                  <li key={x}><span>{mk.kinds[x]}</span><b className="t-num fx-in">+ {fmtMoney(byKind[x])}</b></li>
                ))}
              </ul>
            )}
          </section>
          <section className="fx-card">
            <h2 className="fx-h">{k.flowOutParts}</h2>
            {outParts.length === 0 ? <p className="field-hint">{k.flowNone}</p> : (
              <ul className="fx-cats">
                {outParts.map((x) => (
                  <li key={x}><span>{mk.kinds[x]}</span><b className="t-num fx-out">− {fmtMoney(byKind[x])}</b></li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <section className="fn-panel" aria-labelledby={headingId}>
        <div className="fn-panel-head">
          <h2 id={headingId}>{k.duringDay}</h2>
          <small>{tr(d.common.nPcs, { n: rows.length })}</small>
        </div>
        {rows.length === 0 ? (
          <div className="ux-empty">
            <span className="ux-empty-ic"><Icon name="wallet" size={26} /></span>
            <b>{k.flowEmpty}</b>
            <p>{k.flowEmptyHint}</p>
          </div>
        ) : (
          <ul className="fx-list">
            {rows.slice(0, SHOW_LIMIT).map((r, i) => {
              const isIn = r.amountIn > 0;
              const meta = [hhmm(r.at), mk.kinds[r.kind], r.detail, r.branchId ? branchNames.get(r.branchId) : '', r.method ? d.sales.payMethods[r.method] : '']
                .filter(Boolean).join(' · ');
              return (
                <li key={i} className="fx-row fx-row--ro">
                  <span className={`fx-ic ${isIn ? 'fx-ic--in' : 'fx-ic--out'}`} aria-hidden="true">
                    <Icon name={KIND_ICON[r.kind]} size={16} />
                  </span>
                  <span className="fx-main">
                    {canOpen(r.href) ? <Link href={r.href!} className="cell-link"><b>{r.title}</b></Link> : <b>{r.title}</b>}
                    <small>{meta}</small>
                  </span>
                  <b className={`fx-amt t-num ${isIn ? 'fx-in' : 'fx-out'}`}>
                    {isIn ? `+ ${fmtMoney(r.amountIn)}` : `− ${fmtMoney(r.amountOut)}`}
                  </b>
                </li>
              );
            })}
          </ul>
        )}
        {rows.length > SHOW_LIMIT && <p className="field-hint fx-real-more">{tr(mk.moreRows, { n: SHOW_LIMIT })}</p>}
      </section>
    </>
  );
}
