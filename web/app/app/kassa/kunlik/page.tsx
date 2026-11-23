import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { isBranchScoped } from '@/lib/branchScope';
import { isDayPeriod, periodRange, toDayKey } from '@/lib/period';
import { loadRealization, sumMoney, type MoneyKind } from '@/lib/realization';
import { IN_KINDS, OUT_KINDS, scopeMoneyRows, sumByKind } from '@/lib/dayFlow';
import { amtTone, fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import KassaDateFilter from '@/components/tenant/KassaDateFilter';
import BackLink from '@/components/ui/BackLink';
import Icon from '@/components/icons/Icon';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import '@/components/tenant/styles/finance.css';

export async function generateMetadata() {
  return { title: (await getDict()).sales.kassa.flowMetaTitle };
}

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
 * Kunlik kirim-chiqim — tanlangan kundagi barcha pul harakati (Realizatsiya bilan bir manba).
 * Kassa layout: kassa moduli + kassa.view; filial login — faqat o'z filiali.
 */
export default async function KassaDayFlowPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const { user, Sale, CashFlow, BankReceipt, SupplierEntry, Supplier, Branch } = await getTenantSession();
  const d = await getDict();
  const k = d.sales.kassa;
  const mk = d.crm.money;

  const today = toDayKey(new Date());
  const day = isDayPeriod(sp.date) && sp.date <= today ? sp.date : today;
  const { start, end } = periodRange(day);
  const { money, branchNames } = await loadRealization({ Sale, CashFlow, BankReceipt, SupplierEntry, Supplier, Branch }, start, end);

  const scoped = isBranchScoped(user);
  const rows = scopeMoneyRows(money, scoped ? String(user.branchId) : null);
  const sums = sumMoney(rows);
  const byKind = sumByKind(rows);
  // Eng yangisi tepada (loadRealization tartibi) — kassir oxirgi yozuvni darhol ko'radi
  const timeline = rows;
  // Filial login Moliya/yetkazib beruvchi sahifalariga kira olmaydi — faqat sotuv havolasi
  const canOpen = (href?: string) => !!href && (!scoped || href.startsWith('/app/sales/'));
  const hhmm = (at: Date) => fmtDateTime(at).slice(-5);
  const parts = (kinds: readonly MoneyKind[]) => kinds.filter((x) => byKind[x] > 0);
  const inParts = parts(IN_KINDS);
  const outParts = parts(OUT_KINDS);

  return (
    <div className="fn-page">
      <div className="t-page-head" style={{ marginBottom: 0 }}>
        <div>
          <div style={{ marginBottom: 8 }}>
            <BackLink href="/app/kassa" className="btn btn-plain btn-sm">
              {k.title}
            </BackLink>
          </div>
          <h1 className="t-page-title">{k.flowTitle}</h1>
          <p className="t-page-sub">
            {tr(k.flowSub, { date: day === today ? `${d.common.today}, ${fmtDate(start)}` : fmtDate(start), scope: scoped ? k.yourBranch : k.flowAllBranches })}
          </p>
        </div>
      </div>

      <KassaDateFilter initialDate={day} basePath="/app/kassa/kunlik" today={today} />

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

      <section className="fn-panel" aria-labelledby="kassa-flow-tl">
        <div className="fn-panel-head">
          <h2 id="kassa-flow-tl">{k.duringDay}</h2>
          <small>{tr(d.common.nPcs, { n: timeline.length })}</small>
        </div>
        {timeline.length === 0 ? (
          <div className="ux-empty">
            <span className="ux-empty-ic"><Icon name="wallet" size={26} /></span>
            <b>{k.flowEmpty}</b>
            <p>{k.flowEmptyHint}</p>
          </div>
        ) : (
          <ul className="fx-list">
            {timeline.slice(0, SHOW_LIMIT).map((r, i) => {
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
        {timeline.length > SHOW_LIMIT && <p className="field-hint fx-real-more">{tr(mk.moreRows, { n: SHOW_LIMIT })}</p>}
      </section>
    </div>
  );
}
