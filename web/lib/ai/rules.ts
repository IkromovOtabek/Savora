import { fmtMoney } from '../format';
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

const som = (n: number) => `${fmtMoney(n)} so'm`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

const PAY_LABELS: Record<string, string> = {
  cash: 'naqd',
  debt: 'qarz',
  installment: 'nasiya',
  bank_credit: 'bank krediti',
};

const PRIORITY_ORDER: Record<AiRecommendation['priority'], number> = { yuqori: 0, 'o\'rta': 1, past: 2 };

export function ruleBasedAnalysis(s: AiSnapshot): AiResult {
  const insights: AiInsight[] = [];
  const recs: AiRecommendation[] = [];
  const tasks: AiTask[] = [];
  const T = RULE_THRESHOLDS;
  const isBranch = s.scope === 'branch';

  const hasSales = s.revenue.salesCount > 0;
  const od = s.nasiya.overdue;
  const wow = s.week.changePct;

  // ---- Tushum ----
  if (hasSales) {
    insights.push({
      title: `${s.periodDays} kunlik savdo`,
      detail: `${s.revenue.salesCount} ta sotuv, o'rtacha chek ${som(s.revenue.avgCheck)}. Shundan kassaga tushgani ${som(s.revenue.collected)}.`,
      metric: som(s.revenue.total),
    });
  }

  if (wow !== null && wow <= T.wowDropWarn) {
    insights.push({
      title: 'Haftalik tushum pasaydi',
      detail: `Oxirgi 7 kun: ${som(s.week.last7)}, undan oldingi 7 kun: ${som(s.week.prev7)}.`,
      metric: `${wow}%`,
    });
    recs.push({
      title: 'Qisqa muddatli aksiya o\'tkazing',
      detail: 'Eng ko\'p sotiladigan mahsulotlarga 3–5 kunlik chegirma yoki "2-chisiga sovg\'a" taklifi bering, doimiy mijozlarga SMS/Telegram orqali xabar yuboring.',
      priority: wow <= T.wowDropDanger ? 'yuqori' : 'o\'rta',
      impact: 'Tushumni oldingi hafta darajasiga qaytarish',
    });
    tasks.push({
      title: 'Hafta aksiyasini tayyorlash',
      detail: 'Aksiya uchun 3–5 ta mahsulot tanlang, narx va muddatni belgilang, vitrinada e\'lon qiling.',
      role: isBranch ? 'director' : 'owner',
      dueInDays: 2,
    });
  } else if (wow !== null && wow >= T.wowGrowth) {
    insights.push({
      title: 'Haftalik tushum o\'smoqda',
      detail: `Oxirgi 7 kun oldingi haftadan ${wow}% yuqori. Talab oshgan mahsulotlar zaxirasini tekshiring.`,
      metric: `+${wow}%`,
    });
  }

  // ---- Top mahsulot ----
  const top = s.topProducts[0];
  if (top && s.revenue.total > 0) {
    const share = top.revenue / s.revenue.total;
    insights.push({
      title: 'Eng daromadli mahsulot',
      detail: `«${top.name}» — ${top.qty} dona, tushumning ${pct(share)} qismi.`,
      metric: som(top.revenue),
    });
    if (share >= 0.4 && s.topProducts.length > 1) {
      recs.push({
        title: 'Bitta mahsulotga bog\'liqlikni kamaytiring',
        detail: `Tushumning ${pct(share)} qismi bitta mahsulotdan. Unga qo'shimcha (aksessuar, hamroh mahsulot) taklif qiling va assortimentni kengaytiring.`,
        priority: 'past',
        impact: 'Tushum barqarorligi',
      });
    }
  }

  // ---- To'lov turlari ----
  const inst = s.revenue.byPaymentType.find((p) => p.type === 'installment');
  if (inst && s.revenue.total > 0 && inst.revenue / s.revenue.total >= T.installmentShareWarn) {
    recs.push({
      title: 'Naqd savdo ulushini oshiring',
      detail: `Tushumning ${pct(inst.revenue / s.revenue.total)} qismi nasiyada — aylanma mablag' sekin qaytadi. Naqd to'lovga kichik chegirma yoki boshlang'ich to'lovni oshirishni ko'rib chiqing.`,
      priority: 'o\'rta',
      impact: 'Pul oqimini tezlashtirish',
    });
  }

  // ---- Nasiya / qarz portfeli ----
  if (s.nasiya.totalRemaining > 0) {
    insights.push({
      title: 'Qarz va nasiya portfeli',
      detail: `${s.nasiya.count} ta qoldiqli sotuv, jami ${som(s.nasiya.totalRemaining)}. Muddati o'tgani: ${som(od.amount)} (${od.count} ta).`,
      metric: pct(od.share),
    });
  }
  if (od.share > T.overdueShareWarn) {
    recs.push({
      title: 'Muddati o\'tgan to\'lovlarni undiring',
      detail: `Qarzning ${pct(od.share)} qismi muddatidan o'tgan (${som(od.amount)}). Har kuni eslatma yuboring, 30 kundan oshganlarga shaxsan qo'ng'iroq qiling va yangi nasiyada boshlang'ich to'lovni oshiring.`,
      priority: od.share > T.overdueShareDanger ? 'yuqori' : 'o\'rta',
      impact: `${som(od.amount)} gacha pulni qaytarish`,
    });
    tasks.push({
      title: 'Kechikkan nasiyalar bo\'yicha qo\'ng\'iroq',
      detail: `Muddati o'tgan ${od.count} ta to'lov bo'yicha mijozlarga qo'ng'iroq qiling va to'lov sanasini kelishing (Nasiya bo'limi → muddati o'tganlar).`,
      role: 'cashier',
      dueInDays: 1,
    });
  }
  if (od.buckets.d90p > 0) {
    recs.push({
      title: '90 kundan oshgan qarzlar bo\'yicha choralar',
      detail: `${od.bucketCounts.d90p} ta qarz 90 kundan ortiq kechikkan (${som(od.buckets.d90p)}). Kafil/hujjatlarni tekshiring, rasmiy talabnoma yuboring yoki qayta tuzish rejasini taklif qiling.`,
      priority: 'yuqori',
      impact: 'Umidsiz qarzga aylanishining oldini olish',
    });
  }
  if (s.nasiya.maxMonths > T.maxInstallmentMonths) {
    recs.push({
      title: 'Nasiya shartlarini PQ-294 talablariga moslang',
      detail: `Faol nasiyalarda ${s.nasiya.maxMonths} oylik muddat bor. 2027-yildan bo'lib to'lash muddati 12 oydan, yillik ustama va to'lovlar 50% dan oshmasligi kerak — yangi shartnomalarni hozirdan shunga moslang.`,
      priority: 'o\'rta',
      impact: 'Huquqiy xavfni kamaytirish',
    });
  }
  if (s.debtsDueSoon.count > 0) {
    tasks.push({
      title: 'Yaqin to\'lovlar haqida eslatish',
      detail: `${s.debtsDueSoon.days} kun ichida ${s.debtsDueSoon.count} ta to'lov muddati keladi (${som(s.debtsDueSoon.amount)}). Mijozlarga oldindan eslatma yuboring.`,
      role: 'seller',
      dueInDays: 1,
    });
  }

  // ---- Ombor ----
  if (s.stock.lowStockCount > 0) {
    const names = s.stock.lowStock.slice(0, 5).map((p) => `${p.name} (${p.left})`).join(', ');
    insights.push({
      title: 'Qoldig\'i oz mahsulotlar',
      detail: `${s.stock.lowStockCount} ta mahsulot tugay deb qoldi: ${names}.`,
      metric: `${s.stock.lowStockCount} ta`,
    });
    tasks.push({
      title: 'Tovar buyurtma qilish',
      detail: `Qoldig'i oz mahsulotlarni yetkazib beruvchiga buyurtma qiling: ${names}.`,
      role: isBranch ? 'director' : 'owner',
      dueInDays: 2,
    });
    if (s.stock.lowStockCount >= 5) {
      recs.push({
        title: 'Minimal zaxira me\'yorini belgilang',
        detail: 'Tez sotiladigan mahsulotlar uchun minimal qoldiq belgilab, haftada bir marta buyurtma kuni tayinlang — "tugab qoldi" sababli savdo yo\'qotilmaydi.',
        priority: 'o\'rta',
        impact: 'Yo\'qotilgan savdoni kamaytirish',
      });
    }
  }

  // ---- Filiallar ----
  if (!isBranch && s.branches.length > 1) {
    const idle = s.branches.filter((b) => !b.isMain && b.salesLast7 === 0);
    for (const b of idle.slice(0, 3)) {
      tasks.push({
        title: `«${b.name}» filialida savdo yo'q`,
        detail: `Oxirgi 7 kunda «${b.name}» filialida birorta sotuv bo'lmadi. Filial rahbari bilan sababini aniqlang (tovar, xodim, kassa yoki tizimga kiritilmagan sotuv).`,
        role: 'director',
        dueInDays: 1,
      });
    }
    if (idle.length > 0) {
      insights.push({
        title: 'Faol bo\'lmagan filiallar',
        detail: `${idle.length} ta filialda oxirgi 7 kunda sotuv yo'q: ${idle.map((b) => b.name).join(', ')}.`,
        metric: `${idle.length} ta`,
      });
    }
    const top = s.branches[0];
    if (top && top.revenue > 0 && s.revenue.total > 0) {
      insights.push({
        title: 'Eng kuchli filial',
        detail: `«${top.name}» — 30 kunlik tushumning ${pct(top.revenue / s.revenue.total)} qismi.`,
        metric: som(top.revenue),
      });
    }
  }

  if (!hasSales) {
    recs.push({
      title: 'Sotuvlarni tizimga kiriting',
      detail: 'Oxirgi 30 kunda sotuv qayd etilmagan. Har bir sotuvni Savora orqali kiritsangiz, tahlil va tavsiyalar aniqroq bo\'ladi.',
      priority: 'yuqori',
      impact: 'Aniq tahlil va hisobot',
    });
  }

  // ---- Holat ----
  const health = scoreHealth(s);
  recs.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  return {
    summary: buildSummary(s, health),
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

function buildSummary(s: AiSnapshot, health: AiHealth): string {
  if (s.revenue.salesCount === 0) {
    return `Oxirgi ${s.periodDays} kunda sotuv qayd etilmagan — tahlil uchun ma'lumot yetarli emas.`;
  }
  const parts: string[] = [];
  parts.push(`${s.periodDays} kunda ${som(s.revenue.total)} savdo (${s.revenue.salesCount} ta sotuv).`);
  const wow = s.week.changePct;
  if (wow !== null) {
    parts.push(wow === 0 ? 'Haftalik tushum o\'zgarmadi.' : `Haftalik tushum ${wow > 0 ? `${wow}% o'sdi` : `${Math.abs(wow)}% kamaydi`}.`);
  }
  if (s.nasiya.overdue.amount > 0) parts.push(`Muddati o'tgan qarz: ${som(s.nasiya.overdue.amount)} (${pct(s.nasiya.overdue.share)}).`);
  if (s.stock.lowStockCount > 0) parts.push(`${s.stock.lowStockCount} ta mahsulot qoldig'i oz.`);
  const tail = health === 'yaxshi' ? 'Umumiy holat barqaror.' : health === 'xavfli' ? 'Zudlik bilan e\'tibor talab qiladi.' : 'Ayrim ko\'rsatkichlarga e\'tibor bering.';
  return `${parts.join(' ')} ${tail}`;
}

/** To'lov turi nomi (UI uchun) */
export function payTypeLabel(t: string): string {
  return PAY_LABELS[t] ?? t;
}
