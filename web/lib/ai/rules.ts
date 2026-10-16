import { fmtMoney } from '../format';
import { getDictionary } from '../i18n/dict';
import { tr } from '../i18n/fmt';
import type { Locale } from '../i18n/config';
import type { AiHealth, AiInsight, AiRecommendation, AiResult, AiSnapshot, AiTask } from './types';

/**
 * Deterministik qoidalar dvigateli — AI bilan AYNAN bir xil natija shakli (AiResult).
 * Ishlatiladi: ANTHROPIC_API_KEY yo'q bo'lsa, AI xato/timeout bersa yoki javob yaroqsiz bo'lsa.
 * Sof funksiya (DB/tarmoq yo'q) — tests/aiRules.test.ts.
 */

export const RULE_THRESHOLDS = {
  /** Muddati o'tgan qarz ulushi — tavsiya */
  overdueShareWarn: 0.15,
  /** Muddati o'tgan qarz ulushi — "xavfli" */
  overdueShareDanger: 0.3,
  /** Haftalik tushum pasayishi (%) — aksiya taklifi */
  wowDropWarn: -15,
  wowDropDanger: -30,
  wowGrowth: 15,
  /** Nasiya ulushi tushumda — naqd pul oqimi xavfi */
  installmentShareWarn: 0.6,
  /** PQ-294 (2027): nasiya muddati ≤ 12 oy */
  maxInstallmentMonths: 12,
} as const;

const pct = (x: number) => `${Math.round(x * 100)}%`;

const PRIORITY_ORDER: Record<AiRecommendation['priority'], number> = { yuqori: 0, 'o\'rta': 1, past: 2 };

/** Matnlar lug'atdan (lib/i18n/dict/crm.ts → aiRules); standart til — uz, natija o'zgarmaydi */
export function ruleBasedAnalysis(s: AiSnapshot, locale: Locale = 'uz'): AiResult {
  const insights: AiInsight[] = [];
  const recs: AiRecommendation[] = [];
  const tasks: AiTask[] = [];
  const T = RULE_THRESHOLDS;
  const isBranch = s.scope === 'branch';
  const d = getDictionary(locale);
  const R = d.crm.aiRules;
  const som = (n: number) => tr(R.som, { n: fmtMoney(n) });
  const nPcs = (n: number) => tr(d.common.nPcs, { n });

  const hasSales = s.revenue.salesCount > 0;
  const od = s.nasiya.overdue;
  const wow = s.week.changePct;

  // ---- Tushum ----
  if (hasSales) {
    insights.push({
      title: tr(R.periodSales.title, { days: s.periodDays }),
      detail: tr(R.periodSales.detail, { count: s.revenue.salesCount, avg: som(s.revenue.avgCheck), collected: som(s.revenue.collected) }),
      metric: som(s.revenue.total),
    });
  }

  if (wow !== null && wow <= T.wowDropWarn) {
    insights.push({
      title: R.weekDrop.title,
      detail: tr(R.weekDrop.detail, { last: som(s.week.last7), prev: som(s.week.prev7) }),
      metric: `${wow}%`,
    });
    recs.push({
      title: R.promoRec.title,
      detail: R.promoRec.detail,
      priority: wow <= T.wowDropDanger ? 'yuqori' : 'o\'rta',
      impact: R.promoRec.impact,
    });
    tasks.push({
      title: R.promoTask.title,
      detail: R.promoTask.detail,
      role: isBranch ? 'director' : 'owner',
      dueInDays: 2,
    });
  } else if (wow !== null && wow >= T.wowGrowth) {
    insights.push({
      title: R.weekGrowth.title,
      detail: tr(R.weekGrowth.detail, { pct: wow }),
      metric: `+${wow}%`,
    });
  }

  // ---- Top mahsulot ----
  const top = s.topProducts[0];
  if (top && s.revenue.total > 0) {
    const share = top.revenue / s.revenue.total;
    insights.push({
      title: R.topProduct.title,
      detail: tr(R.topProduct.detail, { name: top.name, qty: top.qty, share: pct(share) }),
      metric: som(top.revenue),
    });
    if (share >= 0.4 && s.topProducts.length > 1) {
      recs.push({
        title: R.diversifyRec.title,
        detail: tr(R.diversifyRec.detail, { share: pct(share) }),
        priority: 'past',
        impact: R.diversifyRec.impact,
      });
    }
  }

  // ---- To'lov turlari ----
  const inst = s.revenue.byPaymentType.find((p) => p.type === 'installment');
  if (inst && s.revenue.total > 0 && inst.revenue / s.revenue.total >= T.installmentShareWarn) {
    recs.push({
      title: R.cashShareRec.title,
      detail: tr(R.cashShareRec.detail, { share: pct(inst.revenue / s.revenue.total) }),
      priority: 'o\'rta',
      impact: R.cashShareRec.impact,
    });
  }

  // ---- Nasiya / qarz portfeli ----
  if (s.nasiya.totalRemaining > 0) {
    insights.push({
      title: R.portfolio.title,
      detail: tr(R.portfolio.detail, { count: s.nasiya.count, total: som(s.nasiya.totalRemaining), overdue: som(od.amount), overdueCount: od.count }),
      metric: pct(od.share),
    });
  }
  if (od.share > T.overdueShareWarn) {
    recs.push({
      title: R.overdueRec.title,
      detail: tr(R.overdueRec.detail, { share: pct(od.share), amount: som(od.amount) }),
      priority: od.share > T.overdueShareDanger ? 'yuqori' : 'o\'rta',
      impact: tr(R.overdueRec.impact, { amount: som(od.amount) }),
    });
    tasks.push({
      title: R.overdueTask.title,
      detail: tr(R.overdueTask.detail, { count: od.count }),
      role: 'cashier',
      dueInDays: 1,
    });
  }
  if (od.buckets.d90p > 0) {
    recs.push({
      title: R.d90Rec.title,
      detail: tr(R.d90Rec.detail, { count: od.bucketCounts.d90p, amount: som(od.buckets.d90p) }),
      priority: 'yuqori',
      impact: R.d90Rec.impact,
    });
  }
  if (s.nasiya.maxMonths > T.maxInstallmentMonths) {
    recs.push({
      title: R.pq294Rec.title,
      detail: tr(R.pq294Rec.detail, { months: s.nasiya.maxMonths }),
      priority: 'o\'rta',
      impact: R.pq294Rec.impact,
    });
  }
  if (s.debtsDueSoon.count > 0) {
    tasks.push({
      title: R.dueSoonTask.title,
      detail: tr(R.dueSoonTask.detail, { days: s.debtsDueSoon.days, count: s.debtsDueSoon.count, amount: som(s.debtsDueSoon.amount) }),
      role: 'seller',
      dueInDays: 1,
    });
  }

  // ---- Ombor ----
  if (s.stock.lowStockCount > 0) {
    const names = s.stock.lowStock.slice(0, 5).map((p) => `${p.name} (${p.left})`).join(', ');
    insights.push({
      title: R.lowStock.title,
      detail: tr(R.lowStock.detail, { count: s.stock.lowStockCount, names }),
      metric: nPcs(s.stock.lowStockCount),
    });
    tasks.push({
      title: R.orderTask.title,
      detail: tr(R.orderTask.detail, { names }),
      role: isBranch ? 'director' : 'owner',
      dueInDays: 2,
    });
    if (s.stock.lowStockCount >= 5) {
      recs.push({
        title: R.minStockRec.title,
        detail: R.minStockRec.detail,
        priority: 'o\'rta',
        impact: R.minStockRec.impact,
      });
    }
  }

  // ---- Filiallar ----
  if (!isBranch && s.branches.length > 1) {
    const idle = s.branches.filter((b) => !b.isMain && b.salesLast7 === 0);
    for (const b of idle.slice(0, 3)) {
      tasks.push({
        title: tr(R.idleBranchTask.title, { name: b.name }),
        detail: tr(R.idleBranchTask.detail, { name: b.name }),
        role: 'director',
        dueInDays: 1,
      });
    }
    if (idle.length > 0) {
      insights.push({
        title: R.idleBranches.title,
        detail: tr(R.idleBranches.detail, { count: idle.length, names: idle.map((b) => b.name).join(', ') }),
        metric: nPcs(idle.length),
      });
    }
    const top = s.branches[0];
    if (top && top.revenue > 0 && s.revenue.total > 0) {
      insights.push({
        title: R.topBranch.title,
        detail: tr(R.topBranch.detail, { name: top.name, share: pct(top.revenue / s.revenue.total) }),
        metric: som(top.revenue),
      });
    }
  }

  if (!hasSales) {
    recs.push({
      title: R.noSalesRec.title,
      detail: R.noSalesRec.detail,
      priority: 'yuqori',
      impact: R.noSalesRec.impact,
    });
  }

  // ---- Holat ----
  const health = scoreHealth(s);
  recs.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  return {
    summary: buildSummary(s, health, locale),
    health,
    insights: insights.slice(0, 8),
    recommendations: recs.slice(0, 6),
    tasks: tasks.slice(0, 6),
  };
}

export function scoreHealth(s: AiSnapshot): AiHealth {
  const T = RULE_THRESHOLDS;
  const od = s.nasiya.overdue.share;
  const wow = s.week.changePct;
  if (s.revenue.salesCount === 0) return 'o\'rta';
  if (od > T.overdueShareDanger || (wow !== null && wow <= T.wowDropDanger)) return 'xavfli';
  if (od > T.overdueShareWarn || (wow !== null && wow <= T.wowDropWarn) || s.stock.lowStockCount >= 5) return 'o\'rta';
  return 'yaxshi';
}

function buildSummary(s: AiSnapshot, health: AiHealth, locale: Locale): string {
  const d = getDictionary(locale);
  const S = d.crm.aiRules.summary;
  const som = (n: number) => tr(d.crm.aiRules.som, { n: fmtMoney(n) });
  if (s.revenue.salesCount === 0) {
    return tr(S.noData, { days: s.periodDays });
  }
  const parts: string[] = [];
  parts.push(tr(S.sales, { days: s.periodDays, total: som(s.revenue.total), count: s.revenue.salesCount }));
  const wow = s.week.changePct;
  if (wow !== null) {
    parts.push(wow === 0 ? S.weekFlat : wow > 0 ? tr(S.weekUp, { pct: wow }) : tr(S.weekDown, { pct: Math.abs(wow) }));
  }
  if (s.nasiya.overdue.amount > 0) parts.push(tr(S.overdue, { amount: som(s.nasiya.overdue.amount), share: pct(s.nasiya.overdue.share) }));
  if (s.stock.lowStockCount > 0) parts.push(tr(S.lowStock, { count: s.stock.lowStockCount }));
  const tail = health === 'yaxshi' ? S.tailGood : health === 'xavfli' ? S.tailDanger : S.tailMid;
  return `${parts.join(' ')} ${tail}`;
}

/** To'lov turi nomi (UI uchun) */
export function payTypeLabel(t: string, locale: Locale = 'uz'): string {
  return getDictionary(locale).crm.aiRules.payTypes[t] ?? t;
}
