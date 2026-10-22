import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { mobilePermissionDenied } from '@/lib/permissionGuard';
import { getTenantModels } from '@/lib/tenantDb';
import { findOrCreateBrand } from '@/lib/catalogStore';
import { BRAND_NAME_MAX } from '@/lib/models/tenant/Brand';

/** Brendlar ro'yxati (tovar formasida tanlash uchun) */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  const { Brand } = await getTenantModels(auth.dbName);
  const items = await Brand.find({}, { name: 1 }).sort({ name: 1 }).limit(1000).lean();
  return NextResponse.json({ items: items.map((b) => ({ id: String(b._id), name: b.name })) });
}

/** Yangi brend. Shu nomli brend bo'lsa — mavjudini qaytaradi (takror yaratilmaydi). */
export async function POST(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  { const denied = await mobilePermissionDenied(user, 'product.create'); if (denied) return denied; }

  let body: { name?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Noto\'g\'ri so\'rov.' }, { status: 400 }); }
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return NextResponse.json({ error: 'Brend nomini kiriting.' }, { status: 400 });
  if (name.length > BRAND_NAME_MAX) return NextResponse.json({ error: 'Brend nomi juda uzun.' }, { status: 400 });

  const { Brand } = await getTenantModels(user.dbName);
  const b = await findOrCreateBrand(Brand, name, user.username);
  return NextResponse.json({ id: b.id, name: b.name }, { status: b.created ? 201 : 200 });
}
