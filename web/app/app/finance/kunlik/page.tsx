import { getTenantSession } from '@/lib/tenantSession';
import { isDayPeriod, periodRange, toDayKey } from '@/lib/period';
import { loadRealization } from '@/lib/realization';
import { fmtDate } from '@/lib/format';
import KassaDateFilter from '@/components/tenant/KassaDateFilter';
import DayFlowView from '@/components/tenant/DayFlowView';
import FinanceTabs from '@/components/tenant/FinanceTabs';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import '@/components/tenant/styles/finance.css';

export async function generateMetadata() {
  return { title: (await getDict()).sales.kassa.flowMetaTitle };
}

/**
 * Moliya → «Kirim-chiqim»: tanlangan kundagi barcha pul harakati, barcha filiallar (Kassa → «Kirim-chiqim» bilan
 * bir ko'rinish). Moliya layout: faqat do'kon egasi + kirimChiqim moduli — kassa moduli o'chiq bo'lsa ham ishlaydi.
 */
export default async function FinanceDayFlowPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const { Sale, CashFlow, BankReceipt, SupplierEntry, Supplier, Branch } = await getTenantSession();
  const d = await getDict();
  const k = d.sales.kassa;

  const today = toDayKey(new Date());
  const day = isDayPeriod(sp.date) && sp.date <= today ? sp.date : today;
  const { start, end } = periodRange(day);
  const { money, branchNames } = await loadRealization({ Sale, CashFlow, BankReceipt, SupplierEntry, Supplier, Branch }, start, end);

  return (
    <div className="fn-page">
      <div className="t-page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="t-page-title">{k.flowTitle}</h1>
          <p className="t-page-sub">
            {tr(k.flowSub, { date: day === today ? `${d.common.today}, ${fmtDate(start)}` : fmtDate(start), scope: k.flowAllBranches })}
          </p>
        </div>
      </div>
      <FinanceTabs current="flow" />

      <KassaDateFilter initialDate={day} basePath="/app/finance/kunlik" today={today} />
      <DayFlowView rows={money} branchNames={branchNames} scoped={false} headingId="fin-flow-tl" />
    </div>
  );
}
