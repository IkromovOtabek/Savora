import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { authenticateMobile } from '@/lib/mobileAuth';
import { mobilePermissionDenied } from '@/lib/permissionGuard';
import { getTenantModels } from '@/lib/tenantDb';
import { categoryLevelInDb, findOrCreateCategory } from '@/lib/catalogStore';
import { CATEGORY_MAX_DEPTH, CATEGORY_NAME_MAX } from '@/lib/models/tenant/ProductCategory';

/** Bitta so'rovda yaratiladigan turkumlar soni chegarasi */
const MAX_NODES = 50;

interface NodeInput { name: string; children: NodeInput[] }

/** Turkumlar — tekis ro'yxat (id, nom, ota), mobil daraxtni o'zi quradi */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  const { ProductCategory } = await getTenantModels(auth.dbName);
  const items = await ProductCategory.find({}, { name: 1, parentId: 1 }).sort({ name: 1 }).limit(2000).lean();
  return NextResponse.json({
    items: items.map((c) => ({ id: String(c._id), name: c.name, parentId: c.parentId ? String(c.parentId) : null })),
  });
}

/** Xom JSON → tekshirilgan daraxt; xato bo'lsa matn qaytaradi */
function parseTree(raw: unknown, depth: number, counter: { n: number }): NodeInput | string {
  const o = (raw ?? {}) as { name?: unknown; children?: unknown };
  const name = String(o.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return 'Turkum nomini kiriting.';
  if (name.length > CATEGORY_NAME_MAX) return 'Turkum nomi juda uzun.';
  if (depth > CATEGORY_MAX_DEPTH) return `Ichma-ichlik ${CATEGORY_MAX_DEPTH} darajadan oshmasin.`;
  if (++counter.n > MAX_NODES) return 'Bir vaqtda juda ko\'p turkum.';
  const kidsRaw = Array.isArray(o.children) ? o.children : [];
  const children: NodeInput[] = [];
  for (const k of kidsRaw) {
    const r = parseTree(k, depth + 1, counter);
    if (typeof r === 'string') return r;
    children.push(r);
  }
  return { name, children };
}

/**
 * Turkum (va ichidagi subturkumlar) yaratish.
 * Body: { name, parentId?, children?: [{ name, children: [...] }] }
 */
export async function POST(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  { const denied = await mobilePermissionDenied(user, 'product.create'); if (denied) return denied; }

  let body: { parentId?: unknown } & Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Noto\'g\'ri so\'rov.' }, { status: 400 }); }

  const { ProductCategory } = await getTenantModels(user.dbName);

  // Ota turkum berilgan bo'lsa — mavjudligi va chuqurligi
  let parentId: Types.ObjectId | null = null;
  let parentDepth = 0;
  if (body.parentId) {
    const level = await categoryLevelInDb(ProductCategory, String(body.parentId));
    if (!level) return NextResponse.json({ error: 'Turkum topilmadi.' }, { status: 400 });
    parentId = new Types.ObjectId(String(body.parentId));
    parentDepth = level;
  }

  const tree = parseTree(body, parentDepth + 1, { n: 0 });
  if (typeof tree === 'string') return NextResponse.json({ error: tree }, { status: 400 });

  // Shu darajada shu nomli turkum bo'lsa — qayta ishlatamiz (takror yaratilmaydi)
  async function upsert(node: NodeInput, parent: Types.ObjectId | null): Promise<Types.ObjectId> {
    const id = await findOrCreateCategory(ProductCategory, node.name, parent, user.username);
    for (const k of node.children) await upsert(k, id);
    return id;
  }
  const rootId = await upsert(tree, parentId);

  return NextResponse.json({ id: String(rootId), name: tree.name, parentId: parentId ? String(parentId) : null }, { status: 201 });
}
