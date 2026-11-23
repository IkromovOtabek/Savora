import { getTenantSession } from '@/lib/tenantSession';
import { isBranchScoped } from '@/lib/branchScope';
import { isDayPeriod, periodRange, toDayKey } from '@/lib/period';
import { loadRealization } from '@/lib/realization';
import { scopeMoneyRows } from '@/lib/dayFlow';
import { fmtDate } from '@/lib/format';
import KassaDateFilter from '@/components/tenant/KassaDateFilter';
import DayFlowView from '@/components/tenant/DayFlowView';
import BackLink from '@/components/ui/BackLink';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import '@/components/tenant/styles/finance.css';

export async function generateMetadata() {
  return { title: (await getDict()).sales.kassa.flowMetaTitle };
}

/**
 * Kunlik kirim-chiqim — tanlangan kundagi barcha pul harakati (Realizatsiya bilan bir manba).
 * Kassa layout: kassa moduli + kassa.view; filial login — faqat o'z filiali. Egasi uchun — Moliya → «Kirim-chiqim» ham.
 */
export default async function KassaDayFlowPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const { user, Sale, CashFlow, BankReceipt, SupplierEntry, Supplier, Branch } = await getTenantSession();
  const d = await getDict();
  const k = d.sales.kassa;

  const today = toDayKey(new Date());
  const day = isDayPeriod(sp.date) && sp.date <= today ? sp.date : today;
  const { start, end } = periodRange(day);
  const { money, branchNames } = await loadRealization({ Sale, CashFlow, BankReceipt, SupplierEntry, Supplier, Branch }, start, end);

  const scoped = isBranchScoped(user);
  // Eng yangisi tepada (loadRealization tartibi) — kassir oxirgi yozuvni darhol ko'radi
  const rows = scopeMoneyRows(money, scoped ? String(user.branchId) : null);

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
      <DayFlowView rows={rows} branchNames={branchNames} scoped={scoped} headingId="kassa-flow-tl" />
    </div>
  );
}
