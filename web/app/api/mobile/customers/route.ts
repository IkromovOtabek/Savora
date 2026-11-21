import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { mobilePermissionDenied } from '@/lib/permissionGuard';
import { getMobileFeatures } from '@/lib/mobileOrg';
import { getTenantModels } from '@/lib/tenantDb';
import { searchSaleCustomers } from '@/lib/saleCustomer';
import { logError } from '@/lib/logger';

/**
 * Sotuvdagi mijoz F.I.O katagi (web searchSaleCustomersAction bilan bir xil):
 * ?q= bo'sh — so'nggi mijozlar; ism — so'zlar tartibsiz; 3+ raqam — telefon bo'yicha → { hits: [{ id, name, phone }], more }
 */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  { const denied = await mobilePermissionDenied(auth, 'sale.create'); if (denied) return denied; }
  const features = await getMobileFeatures(auth.organizationId);
  if (!features?.sales) return NextResponse.json({ error: 'Sotuv moduli yoqilmagan.' }, { status: 403 });

  const q = new URL(req.url).searchParams.get('q') ?? '';
  try {
    const { Customer } = await getTenantModels(auth.dbName);
    const r = await searchSaleCustomers({ Customer }, q);
    return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    logError('mobile.customers.search', err);
    return NextResponse.json({ error: 'Mijozlarni yuklab bo\'lmadi.' }, { status: 500 });
  }
}
