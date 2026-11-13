import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { getTenantModels } from '@/lib/tenantDb';
import { getMobileFeatures } from '@/lib/mobileOrg';
import { mobilePermissionDenied } from '@/lib/permissionGuard';
import { branchFilter } from '@/lib/branchScope';
import { parseLedgerInput } from '@/lib/daftarInput';
import { createLedgerEntry } from '@/lib/daftarOps';
import { ledgerRemaining } from '@/lib/models/tenant/LedgerEntry';
import { getDictionary } from '@/lib/i18n/dict';
import type { SessionUser } from '@/lib/session';

const k = getDictionary('uz').sales.daftar;
const VIA = ' (mobil)';

/** Daftar (shaxsiy qarz oldi-berdi) — web /app/daftar bilan bir xil doira va huquq (daftar.manage) */
async function guard(req: Request): Promise<NextResponse | SessionUser> {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  const features = await getMobileFeatures(auth.organizationId);
  if (!features?.daftar) return NextResponse.json({ error: 'Daftar moduli yoqilmagan.' }, { status: 403 });
  const denied = await mobilePermissionDenied(auth, 'daftar.manage');
  return denied ?? auth;
}

export async function GET(req: Request) {
  const user = await guard(req);
  if (user instanceof NextResponse) return user;
  const { LedgerEntry } = await getTenantModels(user.dbName!);
  const entries = await LedgerEntry.find({ ...branchFilter(user) }).sort({ status: 1, dueDate: 1 }).limit(300).lean();

  const today = new Date(); today.setHours(0, 0, 0, 0);
  let givenSum = 0, takenSum = 0, overdue = 0;
  for (const e of entries) {
    if (e.status !== 'open') continue;
    const left = ledgerRemaining(e);
    if (e.type === 'given') givenSum += left; else takenSum += left;
    if (new Date(e.dueDate) < today) overdue++;
  }
  return NextResponse.json({
    givenSum,
    takenSum,
    balance: givenSum - takenSum,
    overdue,
    items: entries.map((e) => ({
      id: String(e._id),
      type: e.type,
      personName: e.personName,
      personPhone: e.personPhone,
      amount: e.amount,
      paidAmount: e.paidAmount || 0,
      remaining: ledgerRemaining(e),
      viaKassa: !!e.kassaBranchId,
      customerId: e.customerId ? String(e.customerId) : null,
      dueDate: e.dueDate,
      note: e.note ?? null,
      status: e.status,
      returnedAt: e.returnedAt ?? null,
      createdAt: e.createdAt,
    })),
  });
}

export async function POST(req: Request) {
  const user = await guard(req);
  if (user instanceof NextResponse) return user;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Noto\'g\'ri so\'rov.' }, { status: 400 }); }
  const parsed = parseLedgerInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // Kassa: ixtiyoriy `toKassa: true` (+ admin uchun `kassaBranchId`); eski ilova yubormaydi — kassaga yozilmaydi
  const o = (body ?? {}) as { toKassa?: unknown; kassaBranchId?: unknown };
  const features = await getMobileFeatures(user.organizationId);
  const m = await getTenantModels(user.dbName!);
  const r = await createLedgerEntry(user, m, k, {
    ...parsed.data,
    toKassa: !!features?.kassa && o.toKassa === true,
    kassaBranchId: typeof o.kassaBranchId === 'string' ? o.kassaBranchId : undefined,
    via: VIA,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ id: r.id }, { status: 201 });
}
