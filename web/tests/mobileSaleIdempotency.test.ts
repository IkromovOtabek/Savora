import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';

/**
 * POST /api/mobile/sales — clientSaleId bilan qayta yuborish sotuvni ikki marta yozmaydi
 * (javob kelmay qolgan onlayn sotuv + oflayn navbat). Bazasiz: modellar soxta.
 */

let user: Record<string, unknown> = {};
const productId = new Types.ObjectId();
const product = {
  _id: productId, name: 'Kabel', imei: 'K1', status: 'in_stock', branchId: new Types.ObjectId(),
  salePrice: 10000, purchasePrice: 5000, trackQuantity: false, unit: 'dona',
};
let prevSale: Record<string, unknown> | null = null;

const saleFindOne = vi.fn(() => ({ lean: async () => prevSale }));
const saleCreate = vi.fn(async (doc: Record<string, unknown>) => ({ _id: new Types.ObjectId(), ...doc }));
const productFindById = vi.fn(() => ({ lean: async () => product }));
const reserveStock = vi.fn(async () => true);
const releaseStock = vi.fn(async () => {});

vi.mock('@/lib/mobileAuth', () => ({ authenticateMobile: async () => user }));
vi.mock('@/lib/permissionGuard', () => ({ mobilePermissionDenied: async () => null, userCan: async () => true }));
vi.mock('@/lib/mobileOrg', () => ({ getMobileFeatures: async () => ({ variant: true, nasiya: true, creditKassa: false }) }));
vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: async () => ({
    Sale: { findOne: saleFindOne, create: saleCreate },
    Product: { findById: productFindById },
    Customer: {},
    CreditBank: {},
  }),
}));
vi.mock('@/lib/stock', () => ({ reserveStock, releaseStock }));
vi.mock('@/lib/sales', async (orig) => ({ ...(await orig<typeof import('@/lib/sales')>()), generateSaleNo: async () => 'S-0001' }));
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock('@/lib/shopNotify', () => ({ notifyNewSale: vi.fn(async () => {}), salePayLabel: () => 'naqd' }));
vi.mock('@/lib/daftarOps', () => ({ findCustomerByPhone: async () => null }));

const KEY = '3f2a9c1e-7b4d-4e8a-9f10-2c6d8e4b1a77';
const post = (extra: Record<string, unknown> = {}) => new Request('http://x/api/mobile/sales', {
  method: 'POST',
  body: JSON.stringify({ productId: String(productId), paymentType: 'cash', totalAmount: 10000, ...extra }),
});

beforeEach(() => {
  user = { id: 'u1', username: 'ali', role: 'admin', dbName: 't_db', organizationId: '0123456789abcdef01234567' };
  prevSale = null;
  for (const m of [saleFindOne, saleCreate, productFindById, reserveStock, releaseStock]) m.mockClear();
  saleCreate.mockImplementation(async (doc: Record<string, unknown>) => ({ _id: new Types.ObjectId(), ...doc }));
});

describe('POST /api/mobile/sales — clientSaleId', () => {
  it('kalitsiz (eski ilova) — oddiy sotuv, kalit tekshirilmaydi', async () => {
    const { POST } = await import('@/app/api/mobile/sales/route');
    const res = await POST(post());
    expect(res.status).toBe(201);
    expect(saleFindOne).not.toHaveBeenCalled();
    expect(saleCreate.mock.calls[0][0]).not.toHaveProperty('clientSaleId');
  });

  it('yangi kalit — sotuv shu kalit bilan yoziladi', async () => {
    const { POST } = await import('@/app/api/mobile/sales/route');
    const res = await POST(post({ clientSaleId: KEY }));
    expect(res.status).toBe(201);
    expect(saleCreate.mock.calls[0][0]).toMatchObject({ clientSaleId: KEY });
  });

  it('qayta yuborish — avvalgi sotuv qaytadi, ombor va sotuv tegilmaydi', async () => {
    const id = new Types.ObjectId();
    prevSale = { _id: id, saleNo: 'S-0001', totalAmount: 10000, remainingAmount: 0, checkoutId: 'abcdEFGH1234', soldBy: 'ali' };
    const { POST } = await import('@/app/api/mobile/sales/route');
    const res = await POST(post({ clientSaleId: KEY }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ id: String(id), saleNo: 'S-0001', totalAmount: 10000, remainingAmount: 0 });
    expect(json.receiptPath).toMatch(/^\/r\//);
    expect(productFindById).not.toHaveBeenCalled();
    expect(reserveStock).not.toHaveBeenCalled();
    expect(saleCreate).not.toHaveBeenCalled();
  });

  it('parallel yozuv (E11000) — ombor qaytariladi, avvalgi sotuv qaytadi', async () => {
    const id = new Types.ObjectId();
    saleCreate.mockImplementationOnce(async () => {
      prevSale = { _id: id, saleNo: 'S-0001', totalAmount: 10000, remainingAmount: 0, soldBy: 'ali' };
      throw Object.assign(new Error('dup'), { code: 11000 });
    });
    const { POST } = await import('@/app/api/mobile/sales/route');
    const res = await POST(post({ clientSaleId: KEY }));
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(String(id));
    expect(releaseStock).toHaveBeenCalledOnce();
  });

  it('kalit boshqa xodimniki — 409, ma\'lumot ko\'rsatilmaydi', async () => {
    prevSale = { _id: new Types.ObjectId(), saleNo: 'S-0009', totalAmount: 5000, remainingAmount: 0, soldBy: 'vali' };
    const { POST } = await import('@/app/api/mobile/sales/route');
    const res = await POST(post({ clientSaleId: KEY }));
    expect(res.status).toBe(409);
    expect(await res.json()).not.toHaveProperty('saleNo');
    expect(saleCreate).not.toHaveBeenCalled();
  });

  it('noto\'g\'ri kalit — 400', async () => {
    const { POST } = await import('@/app/api/mobile/sales/route');
    expect((await POST(post({ clientSaleId: 'qisqa' }))).status).toBe(400);
    expect((await POST(post({ clientSaleId: { $gt: '' } }))).status).toBe(400);
    expect(saleCreate).not.toHaveBeenCalled();
  });
});
