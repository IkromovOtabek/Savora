import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { authenticateMobile } from '@/lib/mobileAuth';
import { getTenantModels } from '@/lib/tenantDb';
import { getMobileFeatures } from '@/lib/mobileOrg';
import { mobilePermissionDenied } from '@/lib/permissionGuard';
import { branchFilter } from '@/lib/branchScope';
import { softDeleteOne } from '@/lib/softDelete';

type Ctx = { params: Promise<{ id: string }> };

async function load(req: Request, { params }: Ctx) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  const features = await getMobileFeatures(auth.organizationId);
  if (!features?.daftar) return NextResponse.json({ error: 'Daftar moduli yoqilmagan.' }, { status: 403 });
  const denied = await mobilePermissionDenied(auth, 'daftar.manage');
  if (denied) return denied;
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Yozuv topilmadi.' }, { status: 404 });
  const { LedgerEntry } = await getTenantModels(auth.dbName);
  return { user: auth, LedgerEntry, filter: { _id: new Types.ObjectId(id), ...branchFilter(auth) } };
}

/** Holat: { status: 'returned' | 'open' } — qaytarildi deb belgilash yoki xato belgilashni bekor qilish */
export async function PATCH(req: Request, ctx: Ctx) {
  const r = await load(req, ctx);
  if (r instanceof NextResponse) return r;
  let body: { status?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Noto\'g\'ri so\'rov.' }, { status: 400 }); }
  if (body.status !== 'returned' && body.status !== 'open') return NextResponse.json({ error: 'Holat noto\'g\'ri.' }, { status: 400 });
  const update = body.status === 'returned'
    ? { $set: { status: 'returned', returnedAt: new Date() } }
    : { $set: { status: 'open' }, $unset: { returnedAt: '' } };
  const prev = await r.LedgerEntry.findOneAndUpdate(r.filter, update).lean();
  if (!prev) return NextResponse.json({ error: 'Yozuv topilmadi.' }, { status: 404 });
  return NextResponse.json({ ok: true, status: body.status });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const r = await load(req, ctx);
  if (r instanceof NextResponse) return r;
  const removed = await softDeleteOne(r.LedgerEntry, r.filter, r.user.username);
  if (!removed) return NextResponse.json({ error: 'Yozuv topilmadi.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
