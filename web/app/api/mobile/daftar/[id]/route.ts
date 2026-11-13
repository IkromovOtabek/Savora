import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { authenticateMobile } from '@/lib/mobileAuth';
import { getTenantModels } from '@/lib/tenantDb';
import { getMobileFeatures } from '@/lib/mobileOrg';
import { mobilePermissionDenied } from '@/lib/permissionGuard';
import { addLedgerPayment, deleteLedgerEntry, undoLastLedgerPayment } from '@/lib/daftarOps';
import { getDictionary } from '@/lib/i18n/dict';

const k = getDictionary('uz').sales.daftar;
const VIA = ' (mobil)';

type Ctx = { params: Promise<{ id: string }> };

async function load(req: Request, { params }: Ctx, perm: 'daftar.manage' | 'daftar.delete' = 'daftar.manage') {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  const features = await getMobileFeatures(auth.organizationId);
  if (!features?.daftar) return NextResponse.json({ error: 'Daftar moduli yoqilmagan.' }, { status: 403 });
  const denied = await mobilePermissionDenied(auth, perm);
  if (denied) return denied;
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Yozuv topilmadi.' }, { status: 404 });
  return { user: auth, features, models: await getTenantModels(auth.dbName), id };
}

/**
 * Holat: { status: 'returned' | 'open' } — qaytdi deb belgilash yoki oxirgi qaytarishni bekor qilish.
 * Qaytarishda ixtiyoriy: `amount` (qisman; yo'q bo'lsa — butun qoldiq), `toKassa` (yo'q bo'lsa — yozuv
 * kassa orqali ochilgan bo'lsa, qaytgan pul ham o'sha kassaga), `kassaBranchId` (admin).
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const r = await load(req, ctx);
  if (r instanceof NextResponse) return r;
  let body: { status?: unknown; amount?: unknown; toKassa?: unknown; kassaBranchId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Noto\'g\'ri so\'rov.' }, { status: 400 }); }
  if (body.status !== 'returned' && body.status !== 'open') return NextResponse.json({ error: 'Holat noto\'g\'ri.' }, { status: 400 });

  if (body.status === 'open') {
    const res = await undoLastLedgerPayment(r.user, r.models, k, { id: r.id, via: VIA });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 404 });
    return NextResponse.json({ ok: true, status: 'open' });
  }

  let toKassa: boolean;
  if (typeof body.toKassa === 'boolean') toKassa = body.toKassa;
  else {
    const entry = await r.models.LedgerEntry.findOne({ _id: r.id }).select('kassaBranchId').lean();
    toKassa = !!entry?.kassaBranchId;
  }
  const amount = body.amount === undefined || body.amount === null ? undefined : Number(body.amount);
  const res = await addLedgerPayment(r.user, r.models, k, {
    id: r.id,
    amount,
    toKassa: !!r.features.kassa && toKassa,
    kassaBranchId: typeof body.kassaBranchId === 'string' ? body.kassaBranchId : undefined,
    via: VIA,
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  const after = await r.models.LedgerEntry.findOne({ _id: r.id }).select('status').lean();
  return NextResponse.json({ ok: true, status: after?.status ?? 'returned' });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const r = await load(req, ctx, 'daftar.delete');
  if (r instanceof NextResponse) return r;
  const res = await deleteLedgerEntry(r.user, r.models, k, { id: r.id, via: VIA });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 404 });
  return NextResponse.json({ ok: true });
}
