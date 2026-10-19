import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateMobile } from '@/lib/mobileAuth';
import { mobilePermissionDenied, userCan } from '@/lib/permissionGuard';
import { getTenantModels } from '@/lib/tenantDb';
import { getMobileFeatures } from '@/lib/mobileOrg';
import { applyOfflineSale, type OfflineSaleResult } from '@/lib/posSync';
import { markOnboardingStep } from '@/lib/onboarding';
import { readJsonInput, zDate, zId, zQty, zMoney, zText, zField } from '@/lib/validation';

/** Bir so'rovda eng ko'p sotuv — qolgani keyingi so'rovda (ilova bo'laklab yuboradi) */
const MAX_BATCH = 100;

const BAD = { badJson: 'Noto\'g\'ri so\'rov.', fallback: 'Noto\'g\'ri so\'rov.' };

const saleSchema = z.object({
  // Qurilma bergan noyob kalit: UUID yoki shunga o'xshash 8–64 belgili [A-Za-z0-9-]
  clientSaleId: zField((v, ctx) => {
    const s = String(v ?? '').trim();
    if (!/^[A-Za-z0-9-]{8,64}$/.test(s)) {
      ctx.addIssue({ code: 'custom', message: 'clientSaleId noto\'g\'ri.' });
      return z.NEVER;
    }
    return s;
  }),
  productId: zId('Mahsulot noto\'g\'ri.'),
  qty: zQty('Son noto\'g\'ri.'), // kg/m… uchun kasr; birlikka mosligi posSync'da
  totalAmount: zMoney('Summa noto\'g\'ri.', { min: 1 }),
  soldAt: zDate('Sotuv vaqti noto\'g\'ri.'),
  notes: zText(500, 'Izoh juda uzun.'),
});

/**
 * Oflayn qilingan naqd sotuvlarni yozish. Har sotuv uchun alohida natija:
 *   ok | duplicate (allaqachon yozilgan) | conflict (omborda qolmagan) | rejected (huquq/mahsulot)
 * Ilova ok/duplicate'ni navbatdan o'chiradi, conflict/rejected'ni foydalanuvchiga ko'rsatadi.
 */
export async function POST(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  { const denied = await mobilePermissionDenied(user, 'sale.create'); if (denied) return denied; }
  const features = await getMobileFeatures(user.organizationId);
  if (!features?.sales) return NextResponse.json({ error: 'Sotuv moduli yoqilmagan.' }, { status: 403 });

  const input = await readJsonInput(req, z.object({
    sales: z.array(saleSchema).min(1, 'Sotuvlar ro\'yxati bo\'sh.').max(MAX_BATCH, `Bir martada ${MAX_BATCH} tadan ko'p emas.`),
  }), BAD);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  const { Product, Sale } = await getTenantModels(user.dbName);
  const perms = {
    canDiscount: await userCan(user, 'sale.discount'),
    canEditPrice: await userCan(user, 'sale.editPrice'),
  };

  // Ketma-ket (parallel emas): bir mahsulotning oxirgi donasi uchun ikki sotuv bo'lsa — tartib saqlanadi
  const results: OfflineSaleResult[] = [];
  const sorted = [...input.data.sales].sort((a, b) => a.soldAt.getTime() - b.soldAt.getTime());
  for (const item of sorted) {
    results.push(await applyOfflineSale({ Product, Sale }, user, item, perms));
  }

  if (results.some((r) => r.status === 'ok')) await markOnboardingStep(user.organizationId, 'saleMade');
  return NextResponse.json({ results });
}
