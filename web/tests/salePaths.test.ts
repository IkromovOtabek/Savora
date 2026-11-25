/**
 * Sotuv va to'lov yo'llarining HOZIRGI xatti-harakati (characterization) — haqiqiy MongoDB bilan:
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/salePaths.test.ts
 *
 * Maqsad: sotuv/to'lov yadrosiga ko'chirishda (lib/sales) biror narsa jimgina o'zgarmasin. Har yo'l
 * (web «Yangi sotuv», POS, mobil API, tezkor sotuv, «Sotildi», to'lovlar) bazaga yozgan sotuv
 * normallashtirilib snapshot bilan solishtiriladi. Ataylab qilingan o'zgarish — snapshot `-u` bilan
 * yangilanadi va commit'da sababi yoziladi.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { getDictionary } from '@/lib/i18n/dict';

const URI = process.env.MONGO_TEST_URI;
const RUN = Math.random().toString(36).slice(2, 8);
const dbName = `salepaths_t_${RUN}`;
const dict = getDictionary('uz');

// Sessiya va muhit: haqiqiy tenant modellari, foydalanuvchi va huquqlar test boshqaradi
const ctl = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  models: null as any,
  user: { id: new Types.ObjectId().toString(), username: 'egasi', role: 'admin', dbName, organizationId: new Types.ObjectId().toString(), tokenVersion: 0 } as Record<string, unknown>,
  denied: new Set<string>(),
};
const ALL_FEATURES = new Proxy({}, { get: () => true });

vi.mock('@/lib/tenantSession', () => ({
  getTenantSession: async () => ({ user: ctl.user, org: { name: 'Test', slug: 'test' }, features: ALL_FEATURES, ...ctl.models }),
  getTenantAdminSession: async () => ({ user: ctl.user, org: { name: 'Test', slug: 'test' }, features: ALL_FEATURES, ...ctl.models }),
}));
vi.mock('@/lib/i18n/server', () => ({
  getI18n: async () => ({ locale: 'uz', d: dict }),
  getDict: async () => dict,
  getLocale: async () => 'uz',
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }); },
  notFound: () => { throw new Error('NOT_FOUND'); },
}));
vi.mock('@/lib/permissionGuard', async (orig) => {
  const real = await orig<typeof import('@/lib/permissionGuard')>();
  const { permissionDeniedError } = await import('@/lib/permissions');
  return {
    ...real,
    checkPermission: async (_u: unknown, key: string) => (ctl.denied.has(key) ? permissionDeniedError(key as never) : null),
    userCan: async (_u: unknown, key: string) => !ctl.denied.has(key),
    mobilePermissionDenied: async () => null,
  };
});
vi.mock('@/lib/mobileAuth', () => ({ authenticateMobile: async () => ctl.user }));
vi.mock('@/lib/mobileOrg', () => ({ getMobileFeatures: async () => ALL_FEATURES, kirimChiqimDenied: async () => null }));
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock('@/lib/telegram', () => ({ sendTelegram: vi.fn(async () => true), sendTelegramTo: vi.fn(async () => true), tgEscape: (v: unknown) => String(v) }));
vi.mock('@/lib/shopNotify', () => ({ notifyNewSale: vi.fn(async () => {}), salePayLabel: (t: string) => t }));
vi.mock('@/lib/onboarding', () => ({ markOnboardingStep: vi.fn(async () => {}) }));

const DAY = 86400_000;

/** Sotuvning solishtiriladigan qismi: id, sana va tasodifiy raqamlarsiz */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function norm(s: any) {
  const days = (d?: Date | null) => (d ? Math.round((new Date(d).getTime() - Date.now()) / DAY) : undefined);
  return {
    product: s.productSnapshot?.name,
    purchasePrice: s.productSnapshot?.purchasePrice,
    qty: s.productSnapshot?.saleQuantity,
    paymentType: s.paymentType,
    totalAmount: s.totalAmount,
    paidAmount: s.paidAmount,
    remainingAmount: s.remainingAmount,
    status: s.status,
    installmentMonths: s.installmentMonths,
    payDay: s.payDay,
    downPayment: s.downPayment,
    dueInDays: days(s.dueDate),
    bankName: s.bankName,
    bankParts: s.bankParts?.map((p: { bankName: string; amount: number }) => ({ bankName: p.bankName, amount: p.amount })),
    customer: s.customerSnapshot ? { fullName: s.customerSnapshot.fullName, phone: s.customerSnapshot.phone } : undefined,
    hasCustomerId: !!s.customerId,
    payments: (s.payments ?? []).map((p: { amount: number; note?: string; method?: string; months?: number[]; balanceAfter?: number }) => ({
      amount: p.amount, note: p.note, method: p.method, months: p.months?.length ? [...p.months] : undefined, balanceAfter: p.balanceAfter,
    })),
    discount: s.discount,
    hasCheckout: !!s.checkoutId,
    clientSaleId: s.clientSaleId,
    soldBy: s.soldBy,
    notes: s.notes,
  };
}

const fd = (o: Record<string, unknown>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) if (v !== undefined) f.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  return f;
};

describe.skipIf(!URI)('sotuv yo\'llari — hozirgi xatti-harakat (MongoDB)', () => {
  const branchId = new Types.ObjectId();
  let n = 0;

  beforeAll(async () => {
    process.env.MONGO_URI = URI;
    ctl.models = await (await import('@/lib/tenantDb')).getTenantModels(dbName);
    await ctl.models.Branch.create({ _id: branchId, name: 'Markaz', active: true });
    await ctl.models.CreditBank.create({ name: 'Ipak Yo\'li', active: true });
    await ctl.models.CreditBank.create({ name: 'Anorbank', active: true });
  }, 30_000);

  afterAll(async () => {
    if (!ctl.models) return;
    await ctl.models.conn.dropDatabase().catch(() => {});
  });

  beforeEach(() => {
    ctl.user = { ...ctl.user, role: 'admin', branchId: undefined };
    ctl.denied = new Set();
  });

  /** Har test uchun yangi tovar */
  async function product(over: Record<string, unknown> = {}) {
    n += 1;
    return ctl.models.Product.create({
      name: `Tovar ${n}`, imei: `SP${RUN}${n}`.toUpperCase(), branchId, salePrice: 1_000_000, purchasePrice: 700_000,
      status: 'in_stock', kind: 'goods', trackQuantity: true, quantity: 10, unit: 'dona', ...over,
    });
  }
  const salesOf = (productId: unknown) => ctl.models.Sale.find({ productId }).sort({ createdAt: 1 }).lean();
  const stockOf = async (id: unknown) => {
    const p = await ctl.models.Product.findById(id).lean();
    return { quantity: p.quantity, soldQuantity: p.soldQuantity ?? 0, status: p.status };
  };

  // ── web «Yangi sotuv» (createSaleAction) ──────────────────────────────────────────────
  async function webSale(o: Record<string, unknown>) {
    const { createSaleAction } = await import('@/app/actions/sales');
    try {
      return await createSaleAction(null, fd(o));
    } catch (e) {
      if ((e as Error).message === 'NEXT_REDIRECT') return { redirected: true };
      throw e;
    }
  }
  const cust = { customerName: 'Ali Valiyev', customerPhone: '901234567' };

  it('web: naqd, bitta tovar, 2 dona', async () => {
    const p = await product();
    const r = await webSale({ productId: String(p._id), saleQty: '2', paymentType: 'cash', totalAmount: '2000000', ...cust });
    expect(r).toEqual({ redirected: true });
    expect((await salesOf(p._id)).map(norm)).toMatchSnapshot();
    expect(await stockOf(p._id)).toMatchSnapshot();
  });

  // 2026-11-25 qaror: naqdda mijoz ixtiyoriy (qarz/nasiya/bankda majburiy) — barcha sotuv yo'llarida bir xil
  it('web: naqd, mijozsiz — sotiladi; qarz mijozsiz — rad', async () => {
    const p = await product();
    expect(await webSale({ productId: String(p._id), paymentType: 'cash', totalAmount: '1000000' })).toMatchSnapshot();
    expect((await salesOf(p._id)).map(norm)).toMatchSnapshot();
    const q = await product();
    expect(await webSale({ productId: String(q._id), paymentType: 'debt', totalAmount: '1000000', paidAmount: '0' })).toMatchSnapshot();
    expect(await salesOf(q._id)).toHaveLength(0);
  });

  it('web: qarz, qisman to\'lov, muddat', async () => {
    const p = await product();
    const due = new Date(Date.now() + 10 * DAY).toISOString().slice(0, 10);
    await webSale({ productId: String(p._id), paymentType: 'debt', totalAmount: '1000000', paidAmount: '300000', dueDate: due, ...cust });
    expect((await salesOf(p._id)).map(norm)).toMatchSnapshot();
  });

  it('web: nasiya 6 oy, boshlang\'ich, to\'lov kuni', async () => {
    const p = await product();
    await webSale({ productId: String(p._id), paymentType: 'installment', totalAmount: '1200000', paidAmount: '200000', installmentMonths: '6', payDay: '5', ...cust });
    expect((await salesOf(p._id)).map(norm)).toMatchSnapshot();
  });

  it('web: bank krediti, ikki bank', async () => {
    const p = await product();
    await webSale({
      productId: String(p._id), paymentType: 'bank_credit', totalAmount: '1000000', paidAmount: '100000',
      bankParts: [{ bankName: 'Ipak Yo\'li', amount: 500000 }, { bankName: 'Anorbank', amount: 400000 }], ...cust,
    });
    expect((await salesOf(p._id)).map(norm)).toMatchSnapshot();
  });

  it('web: bank + nasiya (oylar) va bank + qarz (kunlar)', async () => {
    const p1 = await product();
    await webSale({
      productId: String(p1._id), paymentType: 'bank_credit', totalAmount: '1200000', paidAmount: '200000',
      bankName: 'Ipak Yo\'li', nasiyaAmount: '400000', bankTermUnit: 'months', installmentMonths: '4', ...cust,
    });
    const p2 = await product();
    await webSale({
      productId: String(p2._id), paymentType: 'bank_credit', totalAmount: '1000000', paidAmount: '0',
      bankName: 'Anorbank', nasiyaAmount: '300000', bankTermUnit: 'days', debtDays: '7', ...cust,
    });
    expect([...(await salesOf(p1._id)), ...(await salesOf(p2._id))].map(norm)).toMatchSnapshot();
  });

  it('web: ko\'p tovar, chegirma bilan jami — qatorlarga bo\'linadi', async () => {
    const a = await product({ salePrice: 600_000 });
    const b = await product({ salePrice: 400_000 });
    await webSale({
      items: [{ productId: String(a._id), qty: 1 }, { productId: String(b._id), qty: 2 }],
      paymentType: 'debt', totalAmount: '1300000', paidAmount: '500000', ...cust,
    });
    expect([...(await salesOf(a._id)), ...(await salesOf(b._id))].map(norm)).toMatchSnapshot();
  });

  it('web: chegirma huquqisiz arzon sotish — rad', async () => {
    ctl.denied.add('sale.discount');
    const p = await product();
    expect(await webSale({ productId: String(p._id), paymentType: 'cash', totalAmount: '900000', ...cust })).toMatchSnapshot();
  });

  // ── POS (posSaleAction) ─────────────────────────────────────────────────────────────
  async function pos(input: Record<string, unknown>) {
    const { posSaleAction } = await import('@/app/actions/pos');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: any = await posSaleAction({ wholesale: false, discount: { kind: 'amount', value: 0 }, customerName: '', customerPhone: '', note: '', ...input } as never);
    if (r?.done) r.done = { total: r.done.total, change: r.done.change, debt: r.done.debt, n: r.done.saleIds.length };
    if (r?.saleIds) r.saleIds = r.saleIds.length;
    return r;
  }

  it('POS: ikki tovar, foiz chegirma, aralash to\'lov (naqd + click), qaytim', async () => {
    const a = await product({ salePrice: 300_000 });
    const b = await product({ salePrice: 200_000 });
    const r = await pos({
      lines: [{ productId: String(a._id), qty: 1 }, { productId: String(b._id), qty: 2 }],
      discount: { kind: 'percent', value: 10 },
      payment: { mode: 'full', parts: [{ method: 'click', amount: 600000 }, { method: 'cash', amount: 100000 }] },
    });
    expect(r).toMatchSnapshot();
    expect([...(await salesOf(a._id)), ...(await salesOf(b._id))].map(norm)).toMatchSnapshot();
  });

  it('POS: qarzga, qisman to\'lov, mijoz telefon bo\'yicha', async () => {
    const p = await product();
    const due = new Date(Date.now() + 5 * DAY).toISOString().slice(0, 10);
    const r = await pos({
      lines: [{ productId: String(p._id), qty: 1 }], customerName: 'Vali', customerPhone: '+998 90 111 22 33',
      payment: { mode: 'debt', parts: [{ method: 'cash', amount: 250000 }], dueDate: due },
    });
    expect(r).toMatchSnapshot();
    expect((await salesOf(p._id)).map(norm)).toMatchSnapshot();
  });

  it('POS: nasiya 3 oy', async () => {
    const p = await product();
    await pos({
      lines: [{ productId: String(p._id), qty: 1 }], customerName: 'Hasan', customerPhone: '901112244',
      payment: { mode: 'installment', parts: [{ method: 'cash', amount: 100000 }], months: 3 },
    });
    expect((await salesOf(p._id)).map(norm)).toMatchSnapshot();
  });

  it('POS: narxni o\'zgartirish huquqisiz — rad', async () => {
    ctl.denied.add('sale.editPrice');
    const p = await product();
    expect(await pos({ lines: [{ productId: String(p._id), qty: 1, price: 1_100_000 }], payment: { mode: 'full', parts: [{ method: 'cash', amount: 1100000 }] } })).toMatchSnapshot();
  });

  // ── mobil POST /api/mobile/sales ───────────────────────────────────────────────────
  async function mobile(body: Record<string, unknown>) {
    const { POST } = await import('@/app/api/mobile/sales/route');
    const res = await POST(new Request('http://x/api/mobile/sales', { method: 'POST', body: JSON.stringify(body) }));
    const json = await res.json();
    return { status: res.status, error: json.error };
  }

  it('mobil: naqd mijozsiz, karta usuli', async () => {
    const p = await product();
    expect(await mobile({ productId: String(p._id), paymentType: 'cash', totalAmount: 1000000, payMethod: 'uzcard' })).toMatchSnapshot();
    expect((await salesOf(p._id)).map(norm)).toMatchSnapshot();
  });

  it('mobil: nasiya 70 oy (60 gacha qisqaradi), to\'lov kuni', async () => {
    const p = await product();
    expect(await mobile({ productId: String(p._id), paymentType: 'installment', totalAmount: 1200000, paidAmount: 200000, installmentMonths: 70, payDay: 10, ...cust })).toMatchSnapshot();
    expect((await salesOf(p._id)).map(norm)).toMatchSnapshot();
  });

  it('mobil: qarz, clientSaleId bilan ikki marta — bitta sotuv', async () => {
    const p = await product();
    const key = '3f2a9c1e-7b4d-4e8a-9f10-2c6d8e4b1a' + String(n).padStart(2, '0');
    const body = { productId: String(p._id), paymentType: 'debt', totalAmount: 1000000, paidAmount: 0, clientSaleId: key, ...cust };
    expect([await mobile(body), await mobile(body)]).toMatchSnapshot();
    expect((await salesOf(p._id)).map(norm)).toMatchSnapshot();
  });

  it('mobil: bank + nasiya', async () => {
    const p = await product();
    await mobile({ productId: String(p._id), paymentType: 'bank_credit', totalAmount: 1200000, paidAmount: 200000, bankName: 'Ipak Yo\'li', nasiyaAmount: 400000, bankTermUnit: 'months', installmentMonths: 4, ...cust });
    expect((await salesOf(p._id)).map(norm)).toMatchSnapshot();
  });

  // ── tezkor sotuv va «Sotildi» ──────────────────────────────────────────────────────
  it('tezkor sotuv (bosh sahifa): ikki tovar, biri o\'zgargan narx', async () => {
    const a = await product();
    const b = await product({ salePrice: 50_000 });
    const { quickSaleBatchAction } = await import('@/app/actions/sales');
    expect(await quickSaleBatchAction([{ productId: String(a._id), qty: 1, salePrice: 950000 }, { productId: String(b._id), qty: 3 }] as never)).toMatchSnapshot();
    expect([...(await salesOf(a._id)), ...(await salesOf(b._id))].map(norm)).toMatchSnapshot();
  });

  it('«Sotildi» tugmasi (mahsulot qatori)', async () => {
    const p = await product();
    const { quickMarkSoldAction } = await import('@/app/actions/products');
    expect(await quickMarkSoldAction(null, fd({ productId: String(p._id), qty: '2', salePrice: '1000000', ...cust }))).toMatchSnapshot();
    expect((await salesOf(p._id)).map(norm)).toMatchSnapshot();
    expect(await stockOf(p._id)).toMatchSnapshot();
  });

  // ── to'lovlar ──────────────────────────────────────────────────────────────────────
  async function installmentSale() {
    const p = await product();
    await webSale({ productId: String(p._id), paymentType: 'installment', totalAmount: '1200000', paidAmount: '0', installmentMonths: '4', ...cust });
    return (await salesOf(p._id))[0];
  }

  it('to\'lov: web — nasiyaga qisman to\'lov, qolgani keyingi oylarga', async () => {
    const s = await installmentSale();
    const { addSalePaymentAction } = await import('@/app/actions/sales');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: any = await addSalePaymentAction(null, fd({ saleId: String(s._id), amount: '200000', method: 'cash', note: '', spread: '1' }));
    expect({ ...r, paymentId: typeof r?.paymentId }).toMatchSnapshot();
    expect(norm(await ctl.models.Sale.findById(s._id).lean())).toMatchSnapshot();
  });

  it('to\'lov: mobil — nasiyaga to\'lov', async () => {
    const s = await installmentSale();
    const { POST } = await import('@/app/api/mobile/sales/[id]/route');
    const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ amount: 350000, method: 'humo' }) }), { params: Promise.resolve({ id: String(s._id) }) });
    expect(res.status).toMatchSnapshot();
    expect(norm(await ctl.models.Sale.findById(s._id).lean())).toMatchSnapshot();
  });

  it('to\'lov: ommaviy — mijozning qarzlariga taqsimlanadi', async () => {
    const p1 = await product();
    const p2 = await product();
    const phone = '905550000' + String(n % 10);
    const c = { customerName: 'Ommaviy Mijoz', customerPhone: phone };
    await webSale({ productId: String(p1._id), paymentType: 'debt', totalAmount: '500000', paidAmount: '0', dueDate: new Date(Date.now() + 3 * DAY).toISOString().slice(0, 10), ...c });
    await webSale({ productId: String(p2._id), paymentType: 'debt', totalAmount: '400000', paidAmount: '0', dueDate: new Date(Date.now() + 1 * DAY).toISOString().slice(0, 10), ...c });
    const s1 = (await salesOf(p1._id))[0];
    const { bulkDebtPaymentAction } = await import('@/app/actions/debts');
    expect(await bulkDebtPaymentAction({ customerId: String(s1.customerId), amount: 600000, method: 'cash' })).toMatchSnapshot();
    expect([...(await salesOf(p1._id)), ...(await salesOf(p2._id))].map(norm)).toMatchSnapshot();
  });

  // ── bekor qilish va qaytarish (web va mobil — bitta yadro, lib/sales/undoSale) ─────────
  async function cashSale(qty = 3) {
    const p = await product();
    await webSale({ productId: String(p._id), saleQty: String(qty), paymentType: 'cash', totalAmount: String(qty * 1_000_000), ...cust });
    return { p, s: (await salesOf(p._id))[0] };
  }
  const refundFlows = (saleId: unknown) => ctl.models.CashFlow.find({ saleId }).select('type amount category -_id').lean();

  it('bekor qilish: web — ombor qaytadi, to\'langan pul kassadan chiqim; ikkinchi marta — rad', async () => {
    const { p, s } = await cashSale(2);
    const { cancelSaleAction } = await import('@/app/actions/sales');
    expect(await cancelSaleAction(null, fd({ saleId: String(s._id) }))).toMatchSnapshot();
    expect(await cancelSaleAction(null, fd({ saleId: String(s._id) }))).toMatchSnapshot();
    expect(norm(await ctl.models.Sale.findById(s._id).lean())).toMatchSnapshot();
    expect(await stockOf(p._id)).toMatchSnapshot();
    expect(await refundFlows(s._id)).toMatchSnapshot();
  });

  it('bekor qilish: mobil API — web bilan bir xil natija', async () => {
    const { p, s } = await cashSale(2);
    const { POST } = await import('@/app/api/mobile/sales/[id]/cancel/route');
    const res = await POST(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ id: String(s._id) }) });
    expect({ status: res.status, body: { ...(await res.json()), saleNo: undefined } }).toMatchSnapshot();
    expect(norm(await ctl.models.Sale.findById(s._id).lean())).toMatchSnapshot();
    expect(await stockOf(p._id)).toMatchSnapshot();
    expect(await refundFlows(s._id)).toMatchSnapshot();
  });

  it('qaytarish: web va mobil — 3 tadan 1 ta, keyin mobil 1 ta', async () => {
    const { p, s } = await cashSale(3);
    const { returnSaleItemsAction } = await import('@/app/actions/sales');
    expect(await returnSaleItemsAction(null, fd({ saleId: String(s._id), qty: '1', reason: 'singan' }))).toMatchSnapshot();
    const { POST } = await import('@/app/api/mobile/sales/[id]/return/route');
    const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ qty: 1 }) }), { params: Promise.resolve({ id: String(s._id) }) });
    expect({ status: res.status, body: { ...(await res.json()), saleNo: undefined } }).toMatchSnapshot();
    expect(norm(await ctl.models.Sale.findById(s._id).lean())).toMatchSnapshot();
    expect(await stockOf(p._id)).toMatchSnapshot();
  });
});
