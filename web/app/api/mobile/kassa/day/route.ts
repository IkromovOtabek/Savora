import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { mobilePermissionDenied } from '@/lib/permissionGuard';
import { getTenantModels } from '@/lib/tenantDb';
import { getMobileFeatures } from '@/lib/mobileOrg';
import { isBranchScoped } from '@/lib/branchScope';
import { isDayPeriod, periodRange, toDayKey } from '@/lib/period';
import { loadRealization, sumMoney } from '@/lib/realization';
import { scopeMoneyRows, sumByKind } from '@/lib/dayFlow';

/** Ekranga yuboriladigan qatorlar (eng yangisi birinchi) */
const ROW_LIMIT = 300;

/**
 * Kunlik kirim-chiqim — web /app/kassa/kunlik bilan bir manba (Realizatsiya): sotuv va qarz/nasiya to'lovlari,
 * bank tushumi, Moliya kirim/xarajatlari, qaytarishlar, yetkazib beruvchiga to'lovlar.
 * `?date=YYYY-MM-DD` (telefon kuni; yo'q bo'lsa — bugun). Filial login — faqat o'z filiali.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  const features = await getMobileFeatures(user.organizationId);
  if (!features?.kassa) return NextResponse.json({ error: 'Kassa moduli yoqilmagan.' }, { status: 403 });
  { const noPerm = await mobilePermissionDenied(user, 'kassa.view'); if (noPerm) return noPerm; }

  const raw = new URL(req.url).searchParams.get('date');
  const day = isDayPeriod(raw) ? raw : toDayKey(new Date());
  const { start, end } = periodRange(day);

  const m = await getTenantModels(user.dbName);
  const { money, branchNames } = await loadRealization(m, start, end);
  const scoped = isBranchScoped(user);
  const rows = scopeMoneyRows(money, scoped ? String(user.branchId) : null);

  return NextResponse.json({
    date: day,
    scoped,
    totals: sumMoney(rows),
    byKind: sumByKind(rows),
    count: rows.length,
    rows: rows.slice(0, ROW_LIMIT).map((r, i) => ({
      id: `${r.at.getTime()}-${i}`,
      at: r.at,
      kind: r.kind,
      dir: r.amountIn > 0 ? 'in' : 'out',
      amount: r.amountIn > 0 ? r.amountIn : r.amountOut,
      title: r.title,
      detail: r.detail || null,
      branch: r.branchId ? branchNames.get(r.branchId) ?? null : null,
      method: r.method ?? null,
      // Mobil sotuv detali (/sale/[id]) — faqat sotuvga oid qatorlar
      saleId: r.href?.startsWith('/app/sales/') ? r.href.slice('/app/sales/'.length) : null,
    })),
  });
}
