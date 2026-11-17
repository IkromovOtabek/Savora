'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import SegmentSwitch from '@/components/ui/SegmentSwitch';
import { BILLING_CYCLES, cyclePrice, fmtPlanPrice, type BillingCycle } from '@/lib/plans';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';

/**
 * Bosh sahifa tariflari: davr tugmasi («Oylik | 6 oy | 1 yil») va kartalardagi narx.
 * Kartalar server komponentda qoladi (children) — bu yerda faqat tanlov holati va narx qatori.
 */
const CycleContext = createContext<BillingCycle>('monthly');

export function PlanCycleScope({ children }: { children: ReactNode }) {
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const b = useDict().catalog.billing;
  return (
    <CycleContext.Provider value={cycle}>
      <div className="lp-cycle">
        <SegmentSwitch
          options={BILLING_CYCLES.map((c) => ({ value: c, label: b.cycles[c] }))}
          value={cycle}
          onChange={setCycle}
          label={b.cycleGroup}
          className="seg-sw--fluid"
        />
      </div>
      {children}
    </CycleContext.Provider>
  );
}

/** Karta narxi: oylik narx serverdan (super admin o'zgartirgani bilan), summa — lib/plans.ts → cyclePrice */
export function PlanCyclePrice({ monthlyPrice }: { monthlyPrice: number }) {
  const cycle = useContext(CycleContext);
  const d = useDict();
  const b = d.catalog.billing;
  const sum = { free: d.landing.plans.free, sum: d.common.sum };

  if (monthlyPrice === 0) return <div className="lp-plan-price">{d.landing.plans.free}</div>;
  const c = cyclePrice(monthlyPrice, cycle);
  const saving = c.freeMonths > 0 ? tr(b.freeMonths, { n: c.freeMonths }) : c.pct > 0 ? tr(b.save, { pct: c.pct }) : '';
  return (
    <>
      <div className="lp-plan-price">{fmtPlanPrice(c.total, sum)}<span> {b.per[cycle]}</span></div>
      {cycle !== 'monthly' && (
        <div className="lp-plan-eq">
          {tr(b.perMonthEq, { sum: fmtPlanPrice(c.perMonth, sum) })}
          {saving && <> · <b>{saving}</b></>}
        </div>
      )}
    </>
  );
}
