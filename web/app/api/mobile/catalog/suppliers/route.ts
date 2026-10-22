import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { mobilePermissionDenied } from '@/lib/permissionGuard';
import { getTenantModels } from '@/lib/tenantDb';
import { recordAudit } from '@/lib/audit';

/** Yetkazib beruvchilar ro'yxati (tovar formasida tanlash uchun) */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  const { Supplier } = await getTenantModels(auth.dbName);
  const items = await Supplier.find({}, { name: 1, phone: 1, company: 1 }).sort({ name: 1 }).limit(1000).lean();
  return NextResponse.json({
    items: items.map((s) => ({ id: String(s._id), name: s.name, phone: s.phone ?? null, company: s.company ?? null })),
  });
}

/** Yangi yetkazib beruvchi (nom + ixtiyoriy telefon) */
export async function POST(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  { const denied = await mobilePermissionDenied(user, 'suppliers.manage'); if (denied) return denied; }

  let body: { name?: unknown; phone?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Noto\'g\'ri so\'rov.' }, { status: 400 }); }
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  const phone = String(body.phone ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Nomini kiriting.' }, { status: 400 });
  if (name.length > 120 || phone.length > 40) return NextResponse.json({ error: 'Matn maydoni juda uzun.' }, { status: 400 });

  const { Supplier } = await getTenantModels(user.dbName);
  const s = await Supplier.create({ name, phone: phone || undefined, createdBy: user.username });
  await recordAudit(user, { action: 'supplier.create', entity: 'supplier', entityId: String(s._id), summary: `Yetkazib beruvchi qo'shildi: ${name} (mobil)` });
  return NextResponse.json({ id: String(s._id), name: s.name, phone: s.phone ?? null, company: null }, { status: 201 });
}
