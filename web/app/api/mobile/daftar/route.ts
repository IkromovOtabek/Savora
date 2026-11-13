import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { getTenantModels } from '@/lib/tenantDb';
import { getMobileFeatures } from '@/lib/mobileOrg';
import { mobilePermissionDenied } from '@/lib/permissionGuard';
import { branchFilter, isBranchScoped } from '@/lib/branchScope';
import { parseLedgerInput } from '@/lib/daftarInput';
import { createLedgerEntry } from '@/lib/daftarOps';
import { ledgerRemaining } from '@/lib/models/tenant/LedgerEntry';
import { getDictionary } from '@/lib/i18n/dict';
import type { SessionUser } from '@/lib/session';

const k = getDictionary('uz').sales.daftar;
const VIA = ' (mobil)';

type Guarded = { user: SessionUser; kassaOn: boolean };

/** Daftar (shaxsiy qarz oldi-berdi) — web /app/daftar bilan bir xil doira va huquq (daftar.manage) */
async function guard(req: Request): Promise<NextResponse | Guarded> {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  const features = await getMobileFeatures(auth.organizationId);
  if (!features?.daftar) return NextResponse.json({ error: 'Daftar moduli yoqilmagan.' }, { status: 403 });
  const denied = await mobilePermissionDenied(auth, 'daftar.manage');
  return denied ?? { user: auth, kassaOn: !!features.kassa };
}

/**
 * Kassa savoli uchun: kassa moduli yoqilganmi va (admin uchun) qaysi filial kassalari bor.
 * Filial xodimiga ro'yxat kerak emas — server o'z filiali kassasini oladi.
 */
async function kassaMeta(g: Guarded, Branch: Awaited<ReturnType<typeof getTenantModels>>['Branch']) {
  if (!g.kassaOn) return { enabled: false, branches: [] as { id: string; name: string }[] };
  const branches = isBranchScoped(g.user) ? [] : await Branch.find({ active: true }).select('name').sort({ createdAt: 1 }).lean();
  return { enabled: true, branches: branches.map((b) => ({ id: String(b._id), name: b.name })) };
}

export async function GET(req: Request) {
  const g = await guard(req);
  if (g instanceof NextResponse) return g;
  const { user } = g;
  const { LedgerEntry, Branch } = await getTenantModels(user.dbName!);
  const kassa = await kassaMeta(g, Branch);
  // Yangi yozuv / qaytarish ekrani uchun — faqat kassa ma'lumoti (ro'yxatsiz)
  if (new URL(req.url).searchParams.get('meta') === '1') return NextResponse.json({ kassa });
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
    kassa,
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
      kassaBranchId: e.kassaBranchId ? String(e.kassaBranchId) : null,
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
  const g = await guard(req);
  if (g instanceof NextResponse) return g;
  const { user } = g;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Noto\'g\'ri so\'rov.' }, { status: 400 }); }
  const parsed = parseLedgerInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // Kassa: ixtiyoriy `toKassa: true` (+ admin uchun `kassaBranchId`); eski ilova yubormaydi — kassaga yozilmaydi
  const o = (body ?? {}) as { toKassa?: unknown; kassaBranchId?: unknown };
  const m = await getTenantModels(user.dbName!);
  const r = await createLedgerEntry(user, m, k, {
    ...parsed.data,
    toKassa: g.kassaOn && o.toKassa === true,
    kassaBranchId: typeof o.kassaBranchId === 'string' ? o.kassaBranchId : undefined,
    via: VIA,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ id: r.id }, { status: 201 });
}
