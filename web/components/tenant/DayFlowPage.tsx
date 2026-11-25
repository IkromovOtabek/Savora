import { getTenantSession } from '@/lib/tenantSession';
import { isBranchScoped } from '@/lib/branchScope';
import { isDayPeriod, periodRange, toDayKey } from '@/lib/period';
import { loadRealization } from '@/lib/realization';
import { scopeMoneyRows } from '@/lib/dayFlow';
import { fmtDate } from '@/lib/format';
import KassaDateFilter from '@/components/tenant/KassaDateFilter';
import DayFlowView from '@/components/tenant/DayFlowView';
import FinanceTabs from '@/components/tenant/FinanceTabs';
import BackLink from '@/components/ui/BackLink';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import '@/components/tenant/styles/finance.css';

/**
 * Kunlik kirim-chiqim — tanlangan kundagi barcha pul harakati (Realizatsiya bilan bir manba).
 * Ikki kirish nuqtasi, kirish huquqi layout'da:
 * - `finance` — Moliya → «Kirim-chiqim»: faqat egasi, barcha filiallar, Moliya tablari;
 * - `kassa` — Kassa → «Kirim-chiqim»: kassa.view, filial login — faqat o'z filiali.
 */
export default async function DayFlowPage({ variant, date }: { variant: 'finance' | 'kassa'; date?: string }) {
  const { user, Sale, CashFlow, BankReceipt, SupplierEntry, Supplier, Branch } = await getTenantSession();
  const d = await getDict();
  const k = d.sales.kassa;

  const today = toDayKey(new Date());
  const day = isDayPeriod(date) && date <= today ? date : today;
  const { start, end } = periodRange(day);
  const { money, branchNames } = await loadRealization({ Sale, CashFlow, BankReceipt, SupplierEntry, Supplier, Branch }, start, end);

  const isKassa = variant === 'kassa';
  const scoped = isKassa && isBranchScoped(user);
  // Eng yangisi tepada (loadRealization tartibi) — kassir oxirgi yozuvni darhol ko'radi
  const rows = scoped ? scopeMoneyRows(money, String(user.branchId)) : money;
  const basePath = isKassa ? '/app/kassa/kunlik' : '/app/finance/kunlik';

  return (
    <div className="fn-page">
      <div className="t-page-head" style={{ marginBottom: 0 }}>
        <div>
          {isKassa && (
            <div style={{ marginBottom: 8 }}>
              <BackLink href="/app/kassa" className="btn btn-plain btn-sm">
                {k.title}
              </BackLink>
            </div>
          )}
          <h1 className="t-page-title">{k.flowTitle}</h1>
          <p className="t-page-sub">
            {tr(k.flowSub, { date: day === today ? `${d.common.today}, ${fmtDate(start)}` : fmtDate(start), scope: scoped ? k.yourBranch : k.flowAllBranches })}
          </p>
        </div>
      </div>
      {!isKassa && <FinanceTabs current="flow" />}

      <KassaDateFilter initialDate={day} basePath={basePath} today={today} />
      <DayFlowView rows={rows} branchNames={branchNames} scoped={scoped} headingId={isKassa ? 'kassa-flow-tl' : 'fin-flow-tl'} />
    </div>
  );
}
