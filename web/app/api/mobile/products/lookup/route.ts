import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { mobilePermissionDenied } from '@/lib/permissionGuard';
import { getTenantModels } from '@/lib/tenantDb';
import { branchFilter } from '@/lib/branchScope';
import { lookupBarcode } from '@/lib/barcodeLookup';

/**
 * Yangi mahsulot formasida shtrix-kod bo'yicha: ?code=4780000000007
 * → { existing: { id, name, status } | null, suggestion: { name, brand, source } | null }
 */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  { const denied = await mobilePermissionDenied(auth, 'product.create'); if (denied) return denied; }

  const code = new URL(req.url).searchParams.get('code') ?? '';
  const { Product } = await getTenantModels(auth.dbName);
  return NextResponse.json(await lookupBarcode(Product, code, branchFilter(auth)));
}
