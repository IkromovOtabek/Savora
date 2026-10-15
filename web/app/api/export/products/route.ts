import { NextResponse } from 'next/server';
import { getApiTenantContext } from '@/lib/auth';
import { getTenantModels } from '@/lib/tenantDb';
import { isFeatureEnabled } from '@/lib/features';
import { loadUserPermissions } from '@/lib/permissionGuard';
import { branchFilter } from '@/lib/branchScope';
import { csvCell } from '@/lib/security';

const MAX_ROWS = 20000;

export async function GET() {
  // To'liq tekshiruv: sessiya + tokenVersion/faol user + do'kon holati (sessiya do'koni)
  const ctx = await getApiTenantContext();
  if (!ctx) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  const { user, org } = ctx;
  if (!isFeatureEnabled(org, 'export')) {
    return NextResponse.json({ error: 'Export moduli faol emas' }, { status: 403 });
  }
  const perms = await loadUserPermissions(user);
  if (!perms.has('export.data')) return NextResponse.json({ error: 'Eksport huquqi yo\'q' }, { status: 403 });

  const { Product } = await getTenantModels(user.dbName!);
  // Filial login faqat o'z filiali mahsulotlarini yuklab oladi
  const cursor = Product.find(branchFilter(user)).sort({ createdAt: -1 }).limit(MAX_ROWS).lean().cursor();

  const header = 'IMEI,Nom,Rang,Holat,Kelish,Sotuv,Izoh';
  const canViewCost = perms.has('product.viewCost');
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('﻿' + header));
      try {
        for await (const p of cursor) {
          const row = [p.imei, p.name, p.color ?? '', p.status, canViewCost ? p.purchasePrice : '', p.salePrice, p.notes ?? '']
            .map(csvCell).join(',');
          controller.enqueue(encoder.encode('\n' + row));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    async cancel() {
      await cursor.close();
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="ombor.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
