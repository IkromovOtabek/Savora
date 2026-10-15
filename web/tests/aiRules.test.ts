import { describe, it, expect } from 'vitest';
import { ruleBasedAnalysis, scoreHealth, RULE_THRESHOLDS } from '@/lib/ai/rules';
import { parseAiResult, extractJson } from '@/lib/ai/validate';
import { overdueBuckets, nasiyaPortfolio, pctChange, snapshotHash } from '@/lib/ai/snapshot';
import { taskScope, taskViewFilter, isTaskOverdue, dueDateFromDays } from '@/lib/tasks';
import type { AiSnapshot } from '@/lib/ai/types';
import { defaultFeaturesForPlan, resolveOrgFeatures } from '@/lib/features';
import { ROLE_DEFAULT_PERMISSIONS, effectivePermissions } from '@/lib/permissions';

function snap(over: Partial<AiSnapshot> = {}): AiSnapshot {
  const base: AiSnapshot = {
    version: 1,
    generatedAt: '2026-10-16T10:00:00.000Z',
    currency: 'UZS',
    scope: 'org',
    businessType: 'phone_shop',
    periodDays: 30,
    revenue: {
      total: 30_000_000,
      collected: 20_000_000,
      salesCount: 60,
      avgCheck: 500_000,
      byDay: [],
      byPaymentType: [{ type: 'cash', revenue: 20_000_000, count: 50 }, { type: 'installment', revenue: 10_000_000, count: 10 }],
    },
    week: { last7: 7_000_000, prev7: 7_000_000, salesLast7: 14, salesPrev7: 14, changePct: 0 },
    topProducts: [{ name: 'iPhone 15', qty: 5, revenue: 6_000_000 }, { name: 'Chexol', qty: 40, revenue: 2_000_000 }],
    stock: { inStockCount: 120, lowStockCount: 0, lowStock: [] },
    nasiya: {
      count: 10,
      totalRemaining: 10_000_000,
      installmentCount: 10,
      maxMonths: 12,
      overdue: {
        count: 1,
        amount: 500_000,
        share: 0.05,
        buckets: { d1_30: 500_000, d31_60: 0, d61_90: 0, d90p: 0 },
        bucketCounts: { d1_30: 1, d31_60: 0, d61_90: 0, d90p: 0 },
      },
    },
    debtsDueSoon: { days: 7, count: 0, amount: 0 },
    branches: [
      { name: 'Asosiy', isMain: true, revenue: 20_000_000, salesLast7: 10 },
      { name: 'Chilonzor', isMain: false, revenue: 10_000_000, salesLast7: 4 },
    ],
  };
  return { ...base, ...over };
}

describe('Qoidalar dvigateli — natija shakli', () => {
  it('AI bilan bir xil shakl qaytaradi va validatsiyadan o\'tadi', () => {
    const r = ruleBasedAnalysis(snap());
    expect(typeof r.summary).toBe('string');
    expect(['yaxshi', 'o\'rta', 'xavfli']).toContain(r.health);
    expect(Array.isArray(r.insights) && Array.isArray(r.recommendations) && Array.isArray(r.tasks)).toBe(true);
    // Qoidalar natijasi AI validatoridan ham o'tishi kerak (bir xil kontrakt)
    expect(parseAiResult(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });

  it('barqaror biznes — "yaxshi"', () => {
    expect(ruleBasedAnalysis(snap()).health).toBe('yaxshi');
  });
});

describe('Qoidalar — nasiya', () => {
  it('muddati o\'tgan ulush > 15% → tavsiya va kassirga topshiriq', () => {
    const s = snap();
    s.nasiya.overdue = { ...s.nasiya.overdue, share: 0.2, amount: 2_000_000, count: 4 };
    const r = ruleBasedAnalysis(s);
    expect(r.recommendations.some((x) => x.title.includes('undiring'))).toBe(true);
    expect(r.tasks.some((t) => t.role === 'cashier')).toBe(true);
    expect(r.health).toBe('o\'rta');
  });

  it('ulush > 30% → "xavfli" va yuqori muhimlik', () => {
    const s = snap();
    s.nasiya.overdue = { ...s.nasiya.overdue, share: 0.35, amount: 3_500_000, count: 7 };
    const r = ruleBasedAnalysis(s);
    expect(r.health).toBe('xavfli');
    expect(r.recommendations[0].priority).toBe('yuqori');
  });

  it('ulush aynan chegarada (15%) — tavsiya yo\'q', () => {
    const s = snap();
    s.nasiya.overdue = { ...s.nasiya.overdue, share: RULE_THRESHOLDS.overdueShareWarn };
    expect(ruleBasedAnalysis(s).recommendations.some((x) => x.title.includes('undiring'))).toBe(false);
  });

  it('90+ kun savati → alohida yuqori tavsiya', () => {
    const s = snap();
    s.nasiya.overdue = { ...s.nasiya.overdue, buckets: { ...s.nasiya.overdue.buckets, d90p: 800_000 }, bucketCounts: { ...s.nasiya.overdue.bucketCounts, d90p: 2 } };
    const r = ruleBasedAnalysis(s);
    expect(r.recommendations.some((x) => x.title.includes('90 kun') && x.priority === 'yuqori')).toBe(true);
  });

  it('12 oydan uzun nasiya → PQ-294 ogohlantirishi', () => {
    const s = snap();
    s.nasiya.maxMonths = 18;
    expect(ruleBasedAnalysis(s).recommendations.some((x) => x.title.includes('PQ-294'))).toBe(true);
    s.nasiya.maxMonths = 12;
    expect(ruleBasedAnalysis(s).recommendations.some((x) => x.title.includes('PQ-294'))).toBe(false);
  });

  it('yaqin to\'lovlar → sotuvchiga eslatma topshirig\'i', () => {
    const r = ruleBasedAnalysis(snap({ debtsDueSoon: { days: 7, count: 3, amount: 1_500_000 } }));
    expect(r.tasks.some((t) => t.role === 'seller' && t.title.includes('Yaqin'))).toBe(true);
  });
});

describe('Qoidalar — ombor, tushum, filial', () => {
  it('qoldig\'i oz → buyurtma topshirig\'i (egasiga)', () => {
    const r = ruleBasedAnalysis(snap({ stock: { inStockCount: 10, lowStockCount: 2, lowStock: [{ name: 'Chexol', left: 1 }, { name: 'Zaryadka', left: 0 }] } }));
    const t = r.tasks.find((x) => x.title.includes('buyurtma'));
    expect(t?.role).toBe('owner');
    expect(t?.detail).toContain('Chexol');
  });

  it('filial login doirasida buyurtma — filial rahbariga', () => {
    const r = ruleBasedAnalysis(snap({ scope: 'branch', stock: { inStockCount: 1, lowStockCount: 1, lowStock: [{ name: 'X', left: 1 }] } }));
    expect(r.tasks.find((x) => x.title.includes('buyurtma'))?.role).toBe('director');
  });

  it('haftalik tushum −20% → aksiya taklifi; −35% → xavfli', () => {
    const r = ruleBasedAnalysis(snap({ week: { last7: 8, prev7: 10, salesLast7: 1, salesPrev7: 1, changePct: -20 } }));
    expect(r.recommendations.some((x) => x.title.includes('aksiya'))).toBe(true);
    expect(r.tasks.some((t) => t.title.includes('aksiya'))).toBe(true);
    expect(scoreHealth(snap({ week: { last7: 6, prev7: 10, salesLast7: 1, salesPrev7: 1, changePct: -35 } }))).toBe('xavfli');
  });

  it('tushum o\'sishi — tavsiya emas, kuzatuv', () => {
    const r = ruleBasedAnalysis(snap({ week: { last7: 12, prev7: 10, salesLast7: 1, salesPrev7: 1, changePct: 20 } }));
    expect(r.insights.some((x) => x.title.includes('o\'smoqda'))).toBe(true);
    expect(r.recommendations.some((x) => x.title.includes('aksiya'))).toBe(false);
  });

  it('7 kun savdosiz filial → filial rahbariga topshiriq (asosiy ombor hisobga olinmaydi)', () => {
    const r = ruleBasedAnalysis(snap({
      branches: [
        { name: 'Asosiy', isMain: true, revenue: 0, salesLast7: 0 },
        { name: 'Yunusobod', isMain: false, revenue: 1000, salesLast7: 0 },
        { name: 'Chilonzor', isMain: false, revenue: 5000, salesLast7: 3 },
      ],
    }));
    const idle = r.tasks.filter((t) => t.role === 'director' && t.title.includes('savdo yo\'q'));
    expect(idle).toHaveLength(1);
    expect(idle[0].title).toContain('Yunusobod');
  });

  it('sotuv yo\'q — "o\'rta", ma\'lumot kiritish tavsiyasi', () => {
    const s = snap();
    s.revenue = { ...s.revenue, total: 0, collected: 0, salesCount: 0, avgCheck: 0, byPaymentType: [] };
    s.topProducts = [];
    const r = ruleBasedAnalysis(s);
    expect(r.health).toBe('o\'rta');
    expect(r.summary).toContain('yetarli emas');
    expect(r.recommendations[0].priority).toBe('yuqori');
  });

  it('chegaralar: insights ≤ 8, recommendations ≤ 6, tasks ≤ 6', () => {
    const s = snap({
      week: { last7: 1, prev7: 10, salesLast7: 1, salesPrev7: 5, changePct: -90 },
      stock: { inStockCount: 1, lowStockCount: 9, lowStock: [{ name: 'A', left: 0 }] },
      debtsDueSoon: { days: 7, count: 5, amount: 10 },
      branches: Array.from({ length: 6 }, (_, i) => ({ name: `F${i}`, isMain: false, revenue: 0, salesLast7: 0 })),
    });
    s.nasiya.maxMonths = 24;
    s.nasiya.overdue = { ...s.nasiya.overdue, share: 0.5, buckets: { d1_30: 1, d31_60: 1, d61_90: 1, d90p: 1 }, bucketCounts: { d1_30: 1, d31_60: 1, d61_90: 1, d90p: 1 } };
    const r = ruleBasedAnalysis(s);
    expect(r.insights.length).toBeLessThanOrEqual(8);
    expect(r.recommendations.length).toBeLessThanOrEqual(6);
    expect(r.tasks.length).toBeLessThanOrEqual(6);
    // Muhimlik bo'yicha tartiblangan
    const order = { yuqori: 0, 'o\'rta': 1, past: 2 } as const;
    const ranks = r.recommendations.map((x) => order[x.priority]);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it('natijada shaxsiy ma\'lumot yo\'q (snapshotda bo\'lmagani uchun)', () => {
    const json = JSON.stringify(ruleBasedAnalysis(snap()));
    expect(json).not.toMatch(/\+998|\b\d{15}\b/);
  });
});

describe('AI javobi validatsiyasi', () => {
  it('yaroqsiz javob → null (qoidalarga o\'tiladi)', () => {
    expect(parseAiResult(null)).toBeNull();
    expect(parseAiResult({ summary: 'x' })).toBeNull();
    expect(parseAiResult({ summary: '', health: 'yaxshi' })).toBeNull();
    expect(parseAiResult({ summary: 'ok', health: 'zo\'r' })).toBeNull();
  });

  it('enum va maydonlarni tozalaydi', () => {
    const r = parseAiResult({
      summary: '  Holat   yaxshi ',
      health: 'orta',
      insights: [{ title: 'T', detail: 'D', metric: 5 }, { title: '', detail: 'x' }],
      recommendations: [{ title: 'R', detail: 'D', priority: 'HIGH', impact: 'I', extra: 1 }],
      tasks: [{ title: 'Vazifa', detail: 'd', role: 'boss', dueInDays: 99 }, { title: 'V2', role: 'cashier', dueInDays: -3 }],
    });
    expect(r).not.toBeNull();
    expect(r!.summary).toBe('Holat yaxshi');
    expect(r!.health).toBe('o\'rta');
    expect(r!.insights).toEqual([{ title: 'T', detail: 'D' }]);
    expect(r!.recommendations[0]).toEqual({ title: 'R', detail: 'D', priority: 'yuqori', impact: 'I' });
    expect(r!.tasks[0]).toMatchObject({ role: 'owner', dueInDays: 30 });
    expect(r!.tasks[1]).toMatchObject({ role: 'cashier', dueInDays: 0, detail: '' });
  });

  it('extractJson — kod bloki ichidagi JSON', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('salom')).toBeNull();
  });
});

describe('Snapshot yordamchilari', () => {
  it('kechikish savatlari 1-30 / 31-60 / 61-90 / 90+', () => {
    const { buckets, bucketCounts } = overdueBuckets([
      { daysOverdue: 1, amount: 10 }, { daysOverdue: 30, amount: 20 }, { daysOverdue: 31, amount: 30 },
      { daysOverdue: 90, amount: 40 }, { daysOverdue: 91, amount: 50 }, { daysOverdue: 0, amount: 999 },
    ]);
    expect(buckets).toEqual({ d1_30: 30, d31_60: 30, d61_90: 40, d90p: 50 });
    expect(bucketCounts).toEqual({ d1_30: 2, d31_60: 1, d61_90: 1, d90p: 1 });
  });

  it('nasiya portfeli: kechikkan oylar, qarz muddati, yaqin to\'lovlar', () => {
    const now = new Date('2026-10-16T12:00:00');
    const p = nasiyaPortfolio([
      // 6 oylik nasiya, 3 oy oldin, boshlang'ichsiz, hech narsa to'lanmagan → 3 oy kechikkan
      { paymentType: 'installment', totalAmount: 600, paidAmount: 0, remainingAmount: 600, installmentMonths: 6, downPayment: 0, payments: [], createdAt: new Date('2026-07-10T12:00:00') },
      // Qarz: muddati 40 kun oldin o'tgan
      { paymentType: 'debt', totalAmount: 100, paidAmount: 0, remainingAmount: 100, dueDate: new Date('2026-09-06T12:00:00') },
      // Qarz: 3 kundan keyin
      { paymentType: 'debt', totalAmount: 50, paidAmount: 0, remainingAmount: 50, dueDate: new Date('2026-10-19T12:00:00') },
    ], now);
    expect(p.nasiya.totalRemaining).toBe(750);
    expect(p.nasiya.installmentCount).toBe(1);
    expect(p.nasiya.maxMonths).toBe(6);
    expect(p.nasiya.overdue.count).toBe(2);
    expect(p.nasiya.overdue.amount).toBe(300 + 100);
    expect(p.nasiya.overdue.buckets.d31_60).toBe(100);
    expect(p.nasiya.overdue.buckets.d61_90).toBe(300);
    expect(p.debtsDueSoon.count).toBe(1);
    expect(p.debtsDueSoon.amount).toBe(50);
  });

  it('pctChange va xesh barqarorligi', () => {
    expect(pctChange(120, 100)).toBe(20);
    expect(pctChange(5, 0)).toBeNull();
    const a = snap();
    const b = { ...snap(), generatedAt: '2030-01-01T00:00:00.000Z' };
    expect(snapshotHash(a)).toBe(snapshotHash(b));
    expect(snapshotHash(a)).not.toBe(snapshotHash(snap({ businessType: 'grocery' })));
  });
});

describe('Topshiriqlar doirasi va modul/huquq', () => {
  const admin = { id: 'a1', role: 'admin' as const };
  const branchUser = { id: 'u1', role: 'user' as const, branchId: 'b1' };

  it('egasi — hammasi; filial — o\'z filiali yoki o\'ziga biriktirilgan', () => {
    expect(taskScope(admin)).toEqual({});
    expect(taskScope(branchUser)).toEqual({ $or: [{ branchId: 'b1' }, { assigneeUserId: 'u1' }] });
    expect(taskViewFilter(branchUser, 'mine')).toEqual({ assigneeUserId: 'u1' });
    expect(taskViewFilter(branchUser, 'branch')).toEqual({ branchId: 'b1' });
  });

  it('muddat o\'tganligi va dueInDays', () => {
    const now = new Date('2026-10-16T12:00:00');
    expect(isTaskOverdue({ status: 'todo', dueDate: new Date('2026-10-15T09:00:00') }, now)).toBe(true);
    expect(isTaskOverdue({ status: 'todo', dueDate: new Date('2026-10-16T00:00:00') }, now)).toBe(false);
    expect(isTaskOverdue({ status: 'done', dueDate: new Date('2026-10-01T00:00:00') }, now)).toBe(false);
    expect(dueDateFromDays(2, now).getDate()).toBe(18);
  });

  it('ai — Pro+; tasks — barcha pullik tariflar', () => {
    expect(defaultFeaturesForPlan('free').ai).toBe(false);
    expect(defaultFeaturesForPlan('starter').ai).toBe(false);
    expect(defaultFeaturesForPlan('pro').ai).toBe(true);
    expect(defaultFeaturesForPlan('free').tasks).toBe(false);
    expect(defaultFeaturesForPlan('starter').tasks).toBe(true);
    const f = resolveOrgFeatures({ plan: { tier: 'business', maxFilial: 5, maxUsers: 10 }, businessType: 'restaurant' });
    expect(f.ai && f.tasks).toBe(true);
    expect(resolveOrgFeatures({ plan: { tier: 'free', maxFilial: 1, maxUsers: 2 }, businessType: 'grocery' }).ai).toBe(false);
  });

  it('ai.view va tasks.manage — admin\'da bor, filial standartida yo\'q', () => {
    expect(effectivePermissions({ role: 'admin' }).has('ai.view')).toBe(true);
    expect(effectivePermissions({ role: 'admin' }).has('tasks.manage')).toBe(true);
    expect(ROLE_DEFAULT_PERMISSIONS.user).not.toContain('ai.view');
    expect(ROLE_DEFAULT_PERMISSIONS.user).not.toContain('tasks.manage');
    // Egasi bersa — filialda ishlaydi (adminOnly emas)
    expect(effectivePermissions({ role: 'user', permissions: ['ai.view', 'tasks.manage'] }).has('ai.view')).toBe(true);
  });
});
