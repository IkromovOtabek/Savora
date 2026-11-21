/**
 * Telegram orqali ro'yxatdan o'tish (lib/tgSignup.ts) va egasining filialga kirishi (api/mobile/auth/branch) —
 * haqiqiy MongoDB bilan (MONGO_TEST_URI berilsa):
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/tgSignup.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Types } from 'mongoose';

vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }));

const URI = process.env.MONGO_TEST_URI;
const RUN = Math.random().toString(36).slice(2, 8);

describe.skipIf(!URI)('Telegram ro\'yxatdan o\'tish (MongoDB)', () => {
  let master: Awaited<ReturnType<typeof import('@/lib/masterDb').getMasterModels>>;
  let tg: typeof import('@/lib/tgSignup');

  beforeAll(async () => {
    process.env.MONGO_URI = URI;
    process.env.MASTER_DB_NAME = `tgtest_master_${RUN}`;
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_BOT_USERNAME = '@savora_test_bot';
    master = await (await import('@/lib/masterDb')).getMasterModels();
    tg = await import('@/lib/tgSignup');
  }, 30_000);

  afterAll(async () => {
    if (!master) return;
    await master.conn.dropDatabase();
  });

  const ip = () => `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

  it('to\'liq oqim: havola → raqam → chipta → bir marta ishlatish', async () => {
    const s = await tg.startTgSignup(ip());
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(s.url).toBe(`https://t.me/savora_test_bot?start=su_${s.nonce}`);
    expect(s.nonce).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(await tg.tgSignupStatus(s.nonce)).toEqual({ status: 'pending' });

    const start = await tg.botStartSignup(s.nonce, '111', '111');
    expect(start.askContact).toBe(true);
    // Boshqa Telegram foydalanuvchisi shu havolani «egallab» ololmaydi
    const hijack = await tg.botStartSignup(s.nonce, '222', '222');
    expect(hijack.askContact).toBeFalsy();

    // Begona raqam (boshqa odam kontakti) qabul qilinmaydi
    const foreign = await tg.botContact('111', { phone_number: '998901112233', user_id: 999 });
    expect(foreign?.askContact).toBe(true);
    expect(await tg.tgSignupStatus(s.nonce)).toEqual({ status: 'pending' });

    const ok = await tg.botContact('111', { phone_number: '+998 90 123 45 67', user_id: 111, first_name: 'Jasur', last_name: 'Karimov' });
    expect(ok?.restoreMenu).toBe(true);
    const st = await tg.tgSignupStatus(s.nonce);
    expect(st.status).toBe('done');
    if (st.status !== 'done') return;
    expect(st.phone).toBe('+998901234567');
    expect(st.name).toBe('Jasur Karimov');
    // Raqam kelgach muddat uzayadi — biznes ustasini shoshilmay tugatish uchun
    const left = (await master.TgSignup.findOne({ nonce: s.nonce }).lean())!.expiresAt.getTime() - Date.now();
    expect(left).toBeGreaterThan(25 * 60_000);

    const ticket = await tg.verifyTgTicket(st.ticket);
    expect(ticket).toMatchObject({ n: s.nonce, tg: '111', p: '+998901234567' });
    await tg.consumeTgTicket(ticket!);
    expect(await tg.verifyTgTicket(st.ticket)).toBeNull();
    expect(await tg.tgSignupStatus(s.nonce)).toEqual({ status: 'expired' });
  });

  it('noto\'g\'ri nonce, soxta chipta va xorijiy raqam', async () => {
    expect(await tg.tgSignupStatus('yoq')).toEqual({ status: 'expired' });
    expect(await tg.tgSignupStatus('A'.repeat(32))).toEqual({ status: 'expired' });
    expect(await tg.verifyTgTicket('soxta')).toBeNull();
    expect(await tg.verifyTgTicket(undefined)).toBeNull();
    expect((await tg.botStartSignup('../x', '1', '1')).askContact).toBeFalsy();

    const s = await tg.startTgSignup(ip());
    if (!s.ok) throw new Error('start');
    await tg.botStartSignup(s.nonce, '333', '333');
    const r = await tg.botContact('333', { phone_number: '+79161234567', user_id: 333 });
    expect(r?.restoreMenu).toBe(true);
    expect(await tg.tgSignupStatus(s.nonce)).toEqual({ status: 'pending' });
    // Kutilayotgan so'rovi yo'q foydalanuvchi kontakti — e'tiborsiz
    expect(await tg.botContact('444', { phone_number: '998901234567', user_id: 444 })).toBeNull();
  });

  it('muddati o\'tgan so\'rov', async () => {
    const s = await tg.startTgSignup(ip());
    if (!s.ok) throw new Error('start');
    await master.TgSignup.updateOne({ nonce: s.nonce }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await tg.tgSignupStatus(s.nonce)).toEqual({ status: 'expired' });
    expect((await tg.botStartSignup(s.nonce, '555', '555')).askContact).toBeFalsy();
  });

  it('bot sozlanmagan — notConfigured', async () => {
    const prev = process.env.TELEGRAM_BOT_USERNAME;
    delete process.env.TELEGRAM_BOT_USERNAME;
    expect(await tg.startTgSignup(ip())).toEqual({ ok: false, error: 'notConfigured' });
    process.env.TELEGRAM_BOT_USERNAME = prev;
  });
});

describe.skipIf(!URI)('Egasi filialga kiradi (MongoDB)', () => {
  let master: Awaited<ReturnType<typeof import('@/lib/masterDb').getMasterModels>>;
  let tenant: Awaited<ReturnType<typeof import('@/lib/tenantDb').getTenantModels>>;
  let mobileAuth: typeof import('@/lib/mobileAuth');
  let POST: typeof import('@/app/api/mobile/auth/branch/route').POST;
  const orgId = new Types.ObjectId();
  const dbName = `branchtest_t_${RUN}`;
  const ids: Record<string, Types.ObjectId> = {};
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    process.env.MONGO_URI = URI;
    process.env.MASTER_DB_NAME = `branchtest_master_${RUN}`;
    master = await (await import('@/lib/masterDb')).getMasterModels();
    tenant = await (await import('@/lib/tenantDb')).getTenantModels(dbName);
    mobileAuth = await import('@/lib/mobileAuth');
    POST = (await import('@/app/api/mobile/auth/branch/route')).POST;

    await master.Organization.create({
      _id: orgId, name: 'Filial Test', slug: `filial-${RUN}`, dbName, status: 'active',
      expiresAt: new Date(Date.now() + 30 * 86400_000), plan: { tier: 'pro', maxFilial: 3, maxUsers: 5 },
    });
    const main = await tenant.Branch.create({ name: 'Bosh', isMain: true, active: true });
    const b1 = await tenant.Branch.create({ name: 'Chilonzor', active: true });
    const b2 = await tenant.Branch.create({ name: 'Yopiq', active: false });
    ids.main = main._id; ids.b1 = b1._id; ids.b2 = b2._id;
    const mk = async (key: string, doc: Record<string, unknown>) => {
      const u = await tenant.User.create({ password: 'parol123', active: true, ...doc });
      ids[key] = u._id;
      tokens[key] = await mobileAuth.createMobileToken({
        id: String(u._id), username: u.username, role: u.role, tokenVersion: 0, organizationId: String(orgId), dbName,
        branchId: u.branchId ? String(u.branchId) : undefined,
      });
    };
    await mk('owner', { username: `egasi_${RUN}`, role: 'admin' });
    // Xodim avval ochilgan — baribir filialning asosiy logini tanlanishi kerak
    await mk('staff', { username: `xodim_${RUN}`, role: 'user', branchId: b1._id, staff: true });
    await mk('branch', { username: `chil_${RUN}`, role: 'user', branchId: b1._id });
  }, 30_000);

  afterAll(async () => {
    if (!master) return;
    await tenant.conn.dropDatabase().catch(() => {});
    await master.conn.dropDatabase();
  });

  const call = (token: string | null, body: unknown) => POST(new Request('http://127.0.0.1/api/mobile/auth/branch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }));

  it('egasi filialning asosiy logini bilan token oladi (xodim emas)', async () => {
    const res = await call(tokens.owner, { branchId: String(ids.b1) });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.user.username).toBe(`chil_${RUN}`);
    expect(j.branch).toEqual({ id: String(ids.b1), name: 'Chilonzor' });
    // Yangi token filial foydalanuvchisi sifatida tekshiriladi
    const me = await mobileAuth.verifyMobileToken(new Request('http://x', { headers: { Authorization: `Bearer ${j.token}` } }));
    expect(me).toMatchObject({ id: String(ids.branch), role: 'user', branchId: String(ids.b1), dbName });
  });

  it('rad etiladi: token yo\'q, filial logini, bosh/yopiq/noto\'g\'ri filial', async () => {
    expect((await call(null, { branchId: String(ids.b1) })).status).toBe(401);
    expect((await call(tokens.branch, { branchId: String(ids.b1) })).status).toBe(403);
    expect((await call(tokens.staff, { branchId: String(ids.b1) })).status).toBe(403);
    expect((await call(tokens.owner, { branchId: String(ids.main) })).status).toBe(400);
    expect((await call(tokens.owner, { branchId: String(ids.b2) })).status).toBe(404);
    expect((await call(tokens.owner, { branchId: 'x' })).status).toBe(404);
    expect((await call(tokens.owner, { branchId: String(new Types.ObjectId()) })).status).toBe(404);
  });
});
