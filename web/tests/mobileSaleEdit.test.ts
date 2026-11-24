import { beforeEach, describe, expect, it, vi } from 'vitest';

/** PATCH /api/mobile/sales/[id] — body → editSale parametrlari, huquq va xato holatlari (bazasiz, editSale soxta) */

const ID = '65a1b2c3d4e5f60718293a4b';
const denied = vi.fn(async (): Promise<Response | null> => null);
const userCan = vi.fn(async () => true);
const editSale = vi.fn();

vi.mock('@/lib/mobileAuth', () => ({ authenticateMobile: async () => ({ id: 'u', username: 'ali', role: 'user', dbName: 'test', branchId: 'b' }) }));
vi.mock('@/lib/permissionGuard', () => ({ mobilePermissionDenied: denied, userCan, loadUserPermissions: async () => new Set(), saleViewScope: () => ({}) }));
vi.mock('@/lib/tenantDb', () => ({ getTenantModels: async () => ({ Sale: {}, Customer: {} }) }));
vi.mock('@/lib/saleEditOps', () => ({ SALE_NOTES_MAX: 500, editSale }));
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }));

const call = async (body: unknown) => {
  const { PATCH } = await import('@/app/api/mobile/sales/[id]/route');
  const res = await PATCH(new Request('http://x/api/mobile/sales/' + ID, { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id: ID }) });
  return { status: res.status, json: await res.json() };
};

describe('PATCH /api/mobile/sales/[id]', () => {
  beforeEach(() => {
    editSale.mockReset();
    denied.mockReset().mockResolvedValue(null);
    userCan.mockReset().mockResolvedValue(true);
  });

  it("maydonlar editSale'ga to'g'ri o'tadi; bo'sh mijoz — olib tashlash", async () => {
    editSale.mockResolvedValue({ ok: true, saleNo: 'S-1', changes: [], price: { refundAmount: 135_000, newRemaining: 0 }, siblings: 0 });
    const r = await call({ customer: { name: ' ', phone: '' }, notes: 'kafolat', dueDate: '2026-12-31', totalAmount: 15_000 });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, refundAmount: 135_000 });
    const [, , id, input, opts] = editSale.mock.calls[0];
    expect(id).toBe(ID);
    expect(input).toMatchObject({ customer: null, notes: 'kafolat', totalAmount: 15_000 });
    expect((input.dueDate as Date).toISOString().slice(0, 10)).toBe('2026-12-31');
    expect(opts).toEqual({ canEditPrice: true });
  });

  it("yuborilmagan maydon — o'zgarmaydi (undefined)", async () => {
    editSale.mockResolvedValue({ ok: true, saleNo: 'S-1', changes: [], price: null, siblings: 0 });
    await call({ notes: 'x' });
    expect(editSale.mock.calls[0][3]).toEqual({ customer: undefined, notes: 'x', dueDate: undefined, totalAmount: undefined });
  });

  it("noto'g'ri sana va kasr narx — 400, editSale chaqirilmaydi", async () => {
    expect((await call({ dueDate: '31.12.2026' })).status).toBe(400);
    expect((await call({ totalAmount: 1.5 })).status).toBe(400);
    expect(editSale).not.toHaveBeenCalled();
  });

  it('xato kodlari: conflict — 409, pricePerm — 403', async () => {
    editSale.mockResolvedValueOnce({ ok: false, error: 'conflict' });
    expect((await call({ notes: 'x' })).status).toBe(409);
    editSale.mockResolvedValueOnce({ ok: false, error: 'pricePerm' });
    expect((await call({ totalAmount: 10 })).status).toBe(403);
  });

  it("«sale.edit» huquqi yo'q — editSale'gacha yetmaydi", async () => {
    denied.mockResolvedValueOnce(Response.json({ error: 'Huquq yo\'q' }, { status: 403 }));
    expect((await call({ notes: 'x' })).status).toBe(403);
    expect(editSale).not.toHaveBeenCalled();
  });
});
