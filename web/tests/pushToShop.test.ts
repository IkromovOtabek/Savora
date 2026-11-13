import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * pushToShop — kimga yuborilishini tekshiradi (bazasiz: master/tenant modellar soxta).
 * Expo so'rovi global fetch orqali — u ham soxta.
 */

const tok = (n: number) => `ExponentPushToken[${String(n).padStart(22, 'x')}]`;
const A = '64a000000000000000000001'; // admin
const B = '64a000000000000000000002'; // ikkinchi admin
const S = '64a000000000000000000003'; // xodim (user)

let devices: { token: string; userId: string; tokenVersion?: number }[] = [];
let users: { _id: string; role: 'admin' | 'user'; active: boolean; tokenVersion?: number }[] = [];
const deleteMany = vi.fn(async () => ({}));

function lean<T>(v: T) { return { select: () => ({ lean: async () => v }) }; }

vi.mock('@/lib/masterDb', () => ({
  getMasterModels: async () => ({
    PushDevice: { find: () => lean(devices), deleteMany, distinct: async () => [] },
  }),
}));

vi.mock('@/lib/tenantDb', () => ({
  getTenantModels: async () => ({
    User: {
      find: (f: { role?: string; _id?: { $in: string[] }; active: boolean }) => lean(users.filter((u) =>
        u.active === f.active && (f.role ? u.role === f.role : (f._id?.$in ?? []).includes(u._id)))),
    },
  }),
}));

const sentTo = () => (fetchMock.mock.calls as unknown as [string, RequestInit][])
  .flatMap(([, init]) => (JSON.parse(String(init.body)) as { to: string }[]).map((m) => m.to));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  devices = [];
  users = [
    { _id: A, role: 'admin', active: true, tokenVersion: 0 },
    { _id: B, role: 'admin', active: true, tokenVersion: 2 },
    { _id: S, role: 'user', active: true, tokenVersion: 0 },
  ];
  deleteMany.mockClear();
  fetchMock = vi.fn(async (_u: string, init: RequestInit) => {
    const msgs = JSON.parse(String(init.body)) as { to: string }[];
    return new Response(JSON.stringify({
      data: msgs.map((m) => (m.to === tok(99) ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' })),
    }));
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const msg = { title: 'T', body: 'B' };

describe('pushToShop', () => {
  it("qurilma bo'lmasa — Expo'ga so'rov yo'q", async () => {
    const { pushToShop } = await import('@/lib/push');
    expect(await pushToShop('t_db', { admins: true }, msg)).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('faqat adminlarga; eski sessiya (tokenVersion) qurilmasiga emas', async () => {
    devices = [
      { token: tok(1), userId: A, tokenVersion: 0 },
      { token: tok(2), userId: B, tokenVersion: 1 }, // parol almashgan — eski
      { token: tok(3), userId: B, tokenVersion: 2 },
      { token: tok(4), userId: S, tokenVersion: 0 }, // xodim
    ];
    const { pushToShop } = await import('@/lib/push');
    expect(await pushToShop('t_db', { admins: true }, msg)).toBe(2);
    expect(sentTo().sort()).toEqual([tok(1), tok(3)].sort());
  });

  it("amalni bajargan odamning o'ziga yuborilmaydi", async () => {
    devices = [{ token: tok(1), userId: A }, { token: tok(3), userId: B, tokenVersion: 2 }];
    const { pushToShop } = await import('@/lib/push');
    await pushToShop('t_db', { admins: true }, msg, { exceptUserId: A });
    expect(sentTo()).toEqual([tok(3)]);
  });

  it("aniq foydalanuvchiga; faol bo'lmagan xodimga emas", async () => {
    devices = [{ token: tok(4), userId: S }, { token: tok(1), userId: A }];
    const { pushToShop } = await import('@/lib/push');
    await pushToShop('t_db', { userIds: [S] }, msg);
    expect(sentTo()).toEqual([tok(4)]);

    fetchMock.mockClear();
    users = users.map((u) => (u._id === S ? { ...u, active: false } : u));
    expect(await pushToShop('t_db', { userIds: [S, 'not-an-id'] }, msg)).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("o'chirilgan ilova tokeni bazadan olib tashlanadi", async () => {
    devices = [{ token: tok(1), userId: A }, { token: tok(99), userId: A }];
    const { pushToShop } = await import('@/lib/push');
    expect(await pushToShop('t_db', { admins: true }, msg)).toBe(1);
    expect(deleteMany).toHaveBeenCalledWith({ token: { $in: [tok(99)] } });
  });
});
