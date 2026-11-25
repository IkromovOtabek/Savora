import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';

/**
 * POST /api/mobile/sales — bank krediti (web createSaleAction bilan bir xil qoida): faqat bank, bank + nasiya
 * (mijoz qismi oyma-oy), bank + qarz (mijoz qismi N kunda). Bazasiz: modellar soxta.
 */

let features: Record<string, boolean> = {};
const productId = new Types.ObjectId();
const product = {
  _id: productId, name: 'iPhone 15', imei: 'I1', status: 'in_stock', branchId: new Types.ObjectId(),
  salePrice: 10_000_000, purchasePrice: 8_000_000, trackQuantity: false, unit: 'dona',
};
const KNOWN_BANKS = ['Ishonch', 'Uzum Nasiya'];

const saleCreate = vi.fn(async (doc: Record<string, unknown>) => ({ _id: new Types.ObjectId(), ...doc }));
const bankCount = vi.fn(async (q: { name: { $in: string[] } }) => q.name.$in.filter((n) => KNOWN_BANKS.includes(n)).length);

vi.mock('@/lib/mobileAuth', () => ({
  authenticateMobile: async () => ({ id: 'u1', username: 'ali', role: 'admin', dbName: 't_db', organizationId: '0123456789abcdef01234567' }),
}));
vi.mock('@/lib/permissionGuard', () => ({ mobilePermissionDenied: async () => null, userCan: async () => true }));
vi.mock('@/lib/mobileOrg', () => ({ getMobileFeatures: async () => features }));
vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: async () => ({
    Sale: { findOne: vi.fn(() => ({ lean: async () => null })), create: saleCreate },
    Product: { findById: vi.fn(() => ({ lean: async () => product })), findOne: vi.fn(() => ({ lean: async () => product })) },
    ShopSettings: {},
    Customer: {},
    CreditBank: { countDocuments: bankCount },
  }),
}));
vi.mock('@/lib/saleCustomer', () => ({
  resolveSaleCustomer: async () => ({ ok: true, customer: { _id: new Types.ObjectId(), fullName: 'Vali', phone: '998901234567' } }),
}));
vi.mock('@/lib/stock', () => ({ reserveStock: vi.fn(async () => true), releaseStock: vi.fn(async () => {}) }));
vi.mock('@/lib/sales', async (orig) => ({ ...(await orig<typeof import('@/lib/sales')>()), generateSaleNo: async () => 'S-0001' }));
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock('@/lib/shopSettings', () => ({ getShopSettings: async () => ({ stock: {} }) }));
vi.mock('@/lib/onboarding', () => ({ markOnboardingStep: vi.fn(async () => {}) }));
vi.mock('@/lib/shopNotify', () => ({ notifyNewSale: vi.fn(async () => {}), salePayLabel: () => 'bank' }));

const post = (extra: Record<string, unknown>) => new Request('http://x/api/mobile/sales', {
  method: 'POST',
  body: JSON.stringify({
    productId: String(productId), paymentType: 'bank_credit', totalAmount: 10_000_000, paidAmount: 2_000_000,
    customerName: 'Vali', customerPhone: '+998901234567', ...extra,
  }),
});
const created = () => saleCreate.mock.calls[0][0] as Record<string, unknown>;

beforeEach(() => {
  features = { sales: true, nasiya: true, creditKassa: true };
  saleCreate.mockClear();
  bankCount.mockClear();
});

describe('POST /api/mobile/sales — bank krediti', () => {
  it('faqat bank: qolgan summa banklarga, qoldiq — bank zimmasida', async () => {
    const { POST } = await import('@/app/api/mobile/sales/route');
    const res = await POST(post({ bankParts: [{ bankName: 'Ishonch', amount: 5_000_000 }, { bankName: 'Uzum Nasiya', amount: 3_000_000 }] }));
    expect(res.status).toBe(201);
    expect(created()).toMatchObject({
      paymentType: 'bank_credit', bankName: 'Ishonch, Uzum Nasiya', paidAmount: 2_000_000, remainingAmount: 8_000_000, status: 'partial',
    });
    expect(created().bankParts).toEqual([{ bankName: 'Ishonch', amount: 5_000_000 }, { bankName: 'Uzum Nasiya', amount: 3_000_000 }]);
  });

  it('bank + nasiya (oy): sotuv «Nasiya», qoldiq — faqat mijoz qismi, oylik jadval', async () => {
    const { POST } = await import('@/app/api/mobile/sales/route');
    const res = await POST(post({
      bankParts: [{ bankName: 'Ishonch', amount: 5_000_000 }], nasiyaAmount: 3_000_000, bankTermUnit: 'months', installmentMonths: 6,
    }));
    expect(res.status).toBe(201);
    expect(created()).toMatchObject({
      paymentType: 'installment', remainingAmount: 3_000_000, downPayment: 2_000_000, installmentMonths: 6,
      bankParts: [{ bankName: 'Ishonch', amount: 5_000_000 }],
    });
    expect(created().dueDate).toBeInstanceOf(Date);
    expect((await res.json()).remainingAmount).toBe(3_000_000);
  });

  it('bank + qarz (kun): sotuv «Qarz», muddat — bugun + N kun', async () => {
    const { POST } = await import('@/app/api/mobile/sales/route');
    const res = await POST(post({
      bankParts: [{ bankName: 'Ishonch', amount: 5_000_000 }], nasiyaAmount: 3_000_000, bankTermUnit: 'days', debtDays: 14,
    }));
    expect(res.status).toBe(201);
    expect(created()).toMatchObject({ paymentType: 'debt', remainingAmount: 3_000_000, bankName: 'Ishonch' });
    expect(created().installmentMonths).toBeUndefined();
    const days = ((created().dueDate as Date).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(12);
    expect(days).toBeLessThan(15);
  });

  it('xatolar: mijoz qismi qolgan summadan katta, banklar summasi mos emas, muddat, noma\'lum bank', async () => {
    const { POST } = await import('@/app/api/mobile/sales/route');
    const bad = async (extra: Record<string, unknown>) => (await POST(post(extra))).status;
    expect(await bad({ bankParts: [{ bankName: 'Ishonch', amount: 1 }], nasiyaAmount: 8_000_000, bankTermUnit: 'months', installmentMonths: 6 })).toBe(400);
    expect(await bad({ bankParts: [{ bankName: 'Ishonch', amount: 7_000_000 }] })).toBe(400);
    expect(await bad({ bankParts: [{ bankName: 'Ishonch', amount: 5_000_000 }], nasiyaAmount: 3_000_000, bankTermUnit: 'days', debtDays: 0 })).toBe(400);
    expect(await bad({ bankParts: [{ bankName: 'Ishonch', amount: 5_000_000 }], nasiyaAmount: 3_000_000, bankTermUnit: 'months' })).toBe(400);
    expect(await bad({ bankParts: [{ bankName: 'Soxta bank', amount: 8_000_000 }] })).toBe(400);
    expect(await bad({ bankParts: [], paidAmount: 10_000_000 })).toBe(400);
    expect(saleCreate).not.toHaveBeenCalled();
  });

  it('Kredit kassa o\'chiq — 403; bank + nasiyada Nasiya moduli ham kerak', async () => {
    const { POST } = await import('@/app/api/mobile/sales/route');
    features = { sales: true, nasiya: true, creditKassa: false };
    expect((await POST(post({ bankParts: [{ bankName: 'Ishonch', amount: 8_000_000 }] }))).status).toBe(403);
    features = { sales: true, creditKassa: true };
    expect((await POST(post({
      bankParts: [{ bankName: 'Ishonch', amount: 5_000_000 }], nasiyaAmount: 3_000_000, bankTermUnit: 'months', installmentMonths: 6,
    }))).status).toBe(403);
    expect(saleCreate).not.toHaveBeenCalled();
  });
});
