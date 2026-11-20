import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { loadUserPermissions, mobilePermissionDeniedAny } from '@/lib/permissionGuard';
import { permissionDeniedError } from '@/lib/permissions';
import { getTenantModels } from '@/lib/tenantDb';
import { getMasterModels } from '@/lib/masterDb';
import { getDictionary } from '@/lib/i18n/dict';
import { mobileLocale } from '@/lib/restaurant/session';
import { cleanLabelIds, labelScope, loadLabelData } from '@/lib/labels/data';
import { expandCopies, labelDocument, labelWarnings } from '@/lib/labels/render';
import { LABEL_LIMITS } from '@/lib/labels/settings';

/**
 * Barkod yorlig'i (mobil): GET ?ids=a,b&copies=2&perUnit=1
 *
 * Web'dagi «Barkod chop etish» oynasi bilan bir xil: huquq va filial — lib/labels/data.ts, yorliq HTML'i —
 * lib/labels/render.ts (preview = chop etiladigan narsa). Ilova tayyor HTML'ni expo-print bilan yorliq
 * o'lchamidagi sahifalarga chop etadi. `copies` berilmasa — do'kon sozlamasidagi nusxa soni.
 * Faqat o'qish: obunasi tugagan do'konda ham ishlaydi (web'dagi kabi).
 */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user.dbName || !user.organizationId) {
    return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  }
  const t = getDictionary(mobileLocale(req)).labels;

  const scope = labelScope(user, await loadUserPermissions(user));
  if (!scope) {
    return (await mobilePermissionDeniedAny(user, ['products.view', 'product.create']))
      ?? NextResponse.json(permissionDeniedError('products.view'), { status: 403 });
  }

  const url = new URL(req.url);
  const ids = cleanLabelIds((url.searchParams.get('ids') ?? '').split(','));
  if (!ids.length) return NextResponse.json({ error: t.print.none }, { status: 400 });

  const { Organization } = await getMasterModels();
  const org = await Organization.findById(user.organizationId).select('name businessType').lean();
  if (!org) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  const { Product, ShopSettings } = await getTenantModels(user.dbName);
  const data = await loadLabelData({ user, org, scope, Product, ShopSettings }, ids);
  if (!data.items.length) return NextResponse.json({ error: t.print.none }, { status: 404 });

  const rawCopies = Math.round(Number(url.searchParams.get('copies')));
  const copies = Number.isFinite(rawCopies) && rawCopies >= 1 ? Math.min(LABEL_LIMITS.maxCopies, rawCopies) : data.settings.copies;
  const perUnit = url.searchParams.get('perUnit') === '1';
  const labels = expandCopies(data.items, copies, perUnit);
  const warn = labelWarnings(data.items, data.settings);
  const html = labelDocument(
    labels,
    data.settings,
    { shopName: data.shopName, texts: { sum: t.paper.sum, warranty: t.paper.warranty } },
    t.print.title,
  );

  return NextResponse.json(
    {
      settings: data.settings,
      items: data.items.map((i) => ({
        id: i.id, name: i.name, code: i.code, codeKind: i.codeKind, available: i.available, imeiPending: !!i.imeiPending,
      })),
      copies,
      perUnit,
      total: labels.length,
      warnings: { imeiPending: warn.imeiPending, noCode: warn.noCode?.name ?? null, tight: warn.tight },
      html,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
