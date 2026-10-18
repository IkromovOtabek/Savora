import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateMobile } from '@/lib/mobileAuth';
import { mobilePermissionDenied, userCan } from '@/lib/permissionGuard';
import { getTenantModels } from '@/lib/tenantDb';
import { getMobileFeatures } from '@/lib/mobileOrg';
import { isBranchScoped } from '@/lib/branchScope';
import { openShift, closeShift, shiftCashOp, shiftTotalsNow } from '@/lib/cashShiftOps';
import { getDictionary } from '@/lib/i18n/dict';
import { readJsonInput, zId, zMoney, zOneOf, zText } from '@/lib/validation';
import type { SessionUser } from '@/lib/session';

/** Mobil xatolar — boshqa mobil API'lar kabi o'zbekcha */
const k = getDictionary('uz').sales.shifts;
const VIA = ' (mobil)';

async function authorize(req: Request): Promise<NextResponse | SessionUser> {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth || !auth.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  const features = await getMobileFeatures(auth.organizationId);
  if (!features?.kassa) return NextResponse.json({ error: 'Kassa moduli yoqilmagan.' }, { status: 403 });
  return auth;
}

/** Kassa smenalari: filiallar, ochiq smenalar (joriy kassa bilan) va oxirgi yopilganlar — web /app/shifts bilan bir xil */
export async function GET(req: Request) {
  const user = await authorize(req);
  if (user instanceof NextResponse) return user;
  { const noPerm = await mobilePermissionDenied(user, 'kassa.view'); if (noPerm) return noPerm; }

  const m = await getTenantModels(user.dbName!);
  const scoped = isBranchScoped(user);
  const branches = (await m.Branch.find({ active: true }).sort({ createdAt: 1 }).select('name').lean())
    .filter((b) => !scoped || String(b._id) === user.branchId);
  const branchIds = branches.map((b) => b._id);
  const branchName = new Map(branches.map((b) => [String(b._id), b.name]));

  const [open, closed, canShift] = await Promise.all([
    m.CashShift.find({ status: 'open', branchId: { $in: branchIds } }).sort({ openedAt: 1 }).lean(),
    m.CashShift.find({ status: 'closed', branchId: { $in: branchIds } }).sort({ closedAt: -1 }).limit(20).lean(),
    userCan(user, 'kassa.shift'),
  ]);
  const now = new Date();
  const openRows = await Promise.all(open.map(async (s) => ({ s, t: await shiftTotalsNow(m, s, now) })));
  const openIds = new Set(open.map((s) => String(s.branchId)));

  return NextResponse.json({
    canShift,
    freeBranches: branches.filter((b) => !openIds.has(String(b._id))).map((b) => ({ id: String(b._id), name: b.name })),
    open: openRows.map(({ s, t }) => ({
      id: String(s._id), shiftNo: s.shiftNo, branch: branchName.get(String(s.branchId)) ?? '—',
      openedAt: s.openedAt, openedBy: s.openedBy, openingCash: s.openingCash, ...t,
    })),
    closed: closed.map((s) => ({
      id: String(s._id), shiftNo: s.shiftNo, branch: branchName.get(String(s.branchId)) ?? '—',
      openedAt: s.openedAt, closedAt: s.closedAt, closedBy: s.closedBy,
      expectedCash: s.expectedCash ?? 0, countedCash: s.countedCash ?? 0, difference: s.difference ?? 0,
    })),
  });
}

const BAD = { badJson: "Noto'g'ri so'rov.", fallback: k.badAmount };

/** Smena amallari: { op: 'open' | 'close' | 'cash', ... } */
export async function POST(req: Request) {
  const user = await authorize(req);
  if (user instanceof NextResponse) return user;
  { const noPerm = await mobilePermissionDenied(user, 'kassa.shift'); if (noPerm) return noPerm; }

  const input = await readJsonInput(req, z.discriminatedUnion('op', [
    z.object({ op: z.literal('open'), branchId: zId(k.badBranch), openingCash: zMoney(k.badAmount, { min: 0 }) }),
    z.object({ op: z.literal('close'), shiftId: zId(k.notFound), countedCash: zMoney(k.badAmount, { min: 0 }), note: zText(300) }),
    z.object({
      op: z.literal('cash'), shiftId: zId(k.notFound), type: zOneOf(['income', 'expense'] as const, k.badAmount),
      amount: zMoney(k.badAmount, { min: 1 }), note: zText(300),
    }),
  ]), BAD);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  const m = await getTenantModels(user.dbName!);
  const data = input.data;
  const res = data.op === 'open'
    ? await openShift(user, m, k, { ...data, via: VIA })
    : data.op === 'close'
      ? await closeShift(user, m, k, { ...data, via: VIA })
      : await shiftCashOp(user, m, k, { ...data, via: VIA });

  if ('error' in res) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true, message: res.success });
}
