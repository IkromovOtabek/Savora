import { beforeEach, describe, expect, it, vi } from 'vitest';

/** /api/mobile/notify — bildirishnoma tanlovlari (bazasiz: modellar soxta) */

let user: Record<string, unknown> = {};
const save = vi.fn(async () => {});
const audit = vi.fn(async () => {});

vi.mock('@/lib/mobileAuth', () => ({ authenticateMobile: async () => user }));
vi.mock('@/lib/tenantDb', () => ({ getTenantModels: async () => ({ ShopSettings: {} }) }));
vi.mock('@/lib/masterDb', () => ({
  getMasterModels: async () => ({
    Organization: { findById: () => ({ select: () => ({ lean: async () => ({ telegramChatId: '123' }) }) }) },
  }),
}));
vi.mock('@/lib/shopSettings', () => ({
  getShopSettings: async () => ({ notify: { shiftDiff: true, dailySummary: false, newSale: false } }),
  saveShopSettingsPart: save,
}));
vi.mock('@/lib/audit', () => ({ recordAudit: audit }));

const put = (body: unknown) => new Request('http://x/api/mobile/notify', { method: 'PUT', body: JSON.stringify(body) });
const value = { shiftDiff: false, dailySummary: true, newSale: true };

beforeEach(() => {
  user = { id: 'u1', username: 'ega', role: 'admin', dbName: 't_db', organizationId: 'o1' };
  save.mockClear();
  audit.mockClear();
});

describe('/api/mobile/notify', () => {
  it('egasiga: tanlovlar va Telegram holati', async () => {
    const { GET } = await import('@/app/api/mobile/notify/route');
    const res = await GET(new Request('http://x/api/mobile/notify'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notify: { shiftDiff: true, dailySummary: false, newSale: false }, telegram: true });
  });

  it('xodimga — 403, hech narsa saqlanmaydi', async () => {
    user = { ...user, role: 'user' };
    const { GET, PUT } = await import('@/app/api/mobile/notify/route');
    expect((await GET(new Request('http://x/api/mobile/notify'))).status).toBe(403);
    expect((await PUT(put(value))).status).toBe(403);
    expect(save).not.toHaveBeenCalled();
  });

  it("noto'g'ri so'rov — 400", async () => {
    const { PUT } = await import('@/app/api/mobile/notify/route');
    expect((await PUT(put({ shiftDiff: 'ha' }))).status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });

  it('saqlaydi va auditga yozadi', async () => {
    const { PUT } = await import('@/app/api/mobile/notify/route');
    const res = await PUT(put(value));
    expect(res.status).toBe(200);
    expect(save).toHaveBeenCalledWith({}, 'notify', value, 'ega');
    expect(audit).toHaveBeenCalledOnce();
  });
});
