/**
 * Kirim/chiqim yozuvi — yagona qoida (lib/cashFlowEntry). Haqiqiy MongoDB bilan:
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/cashFlowEntry.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Types } from 'mongoose';

vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }));

const URI = process.env.MONGO_TEST_URI;
const RUN = Math.random().toString(36).slice(2, 8);

describe.skipIf(!URI)('recordCashFlow (MongoDB)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: any;
  let record: typeof import('@/lib/cashFlowEntry').recordCashFlow;
  const branchId = new Types.ObjectId();
  const owner = { id: 'u1', username: 'ega', role: 'admin' as const, dbName: `cfe_t_${RUN}`, tokenVersion: 0 };

  beforeAll(async () => {
    process.env.MONGO_URI = URI;
    m = await (await import('@/lib/tenantDb')).getTenantModels(`cfe_t_${RUN}`);
    record = (await import('@/lib/cashFlowEntry')).recordCashFlow;
    await m.Branch.create({ _id: branchId, name: 'Markaz', active: true });
    await m.FinanceCategory.create({ name: 'Ijara', type: 'expense', active: true });
    await m.FinanceCategory.create({ name: 'Kassadan olindi', type: 'expense', active: true, system: true });
  }, 30_000);

  afterAll(async () => { await m?.conn.dropDatabase().catch(() => {}); });

  it('toifasiz chiqim — «Boshqa xarajat»; toifasiz kirim — toifasiz', async () => {
    const out = await record(m, owner, { type: 'expense', amount: 1000, description: 'x', source: 'mobile' });
    expect(out).toMatchObject({ ok: true, category: 'Boshqa xarajat' });
    const inc = await record(m, owner, { type: 'income', amount: 500, description: 'y', source: 'finance' });
    expect(inc).toMatchObject({ ok: true, category: undefined });
  });

  it('tizim toifasi va noma\'lum toifa — rad; izoh bo\'sh bo\'lsa toifa nomi', async () => {
    expect(await record(m, owner, { type: 'expense', amount: 1, category: 'Kassadan olindi', source: 'finance' })).toEqual({ ok: false, error: { code: 'badCategory' } });
    expect(await record(m, owner, { type: 'expense', amount: 1, category: 'Yo\'q', source: 'finance' })).toEqual({ ok: false, error: { code: 'badCategory' } });
    const r = await record(m, owner, { type: 'expense', amount: 10, category: 'Ijara', source: 'quick' });
    if (!r.ok) throw new Error('kutilmagan');
    expect((await m.CashFlow.findById(r.id).lean()).description).toBe('Ijara');
  });

  it('filialda ochiq smena — smenaga bog\'lanadi, chiqim kassadagi puldan oshmaydi', async () => {
    const shift = await m.CashShift.create({ branchId, shiftNo: 'SM-1', status: 'open', openedAt: new Date(Date.now() - 60_000), openingCash: 5000, openedBy: 'ega' });
    const tooMuch = await record(m, owner, { type: 'expense', amount: 6000, category: 'Ijara', branchId: String(branchId), source: 'quick' });
    expect(tooMuch).toEqual({ ok: false, error: { code: 'opTooMuch', current: 5000 } });
    const ok = await record(m, owner, { type: 'expense', amount: 3000, category: 'Ijara', branchId: String(branchId), source: 'quick' });
    expect(ok).toMatchObject({ ok: true, shiftNo: 'SM-1' });
    if (!ok.ok) throw new Error('kutilmagan');
    expect(String((await m.CashFlow.findById(ok.id).lean()).shiftId)).toBe(String(shift._id));
  });

  it('nofaol / noma\'lum filial — rad', async () => {
    expect(await record(m, owner, { type: 'income', amount: 1, branchId: String(new Types.ObjectId()), source: 'finance' })).toEqual({ ok: false, error: { code: 'badBranch' } });
  });
});
