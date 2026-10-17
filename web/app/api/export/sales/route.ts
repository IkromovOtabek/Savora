import { NextResponse } from 'next/server';
import { getApiTenantContext } from '@/lib/auth';
import { getTenantModels } from '@/lib/tenantDb';
import { isFeatureEnabled } from '@/lib/features';
import { loadUserPermissions } from '@/lib/permissionGuard';
import { branchFilter } from '@/lib/branchScope';
import { csvCell } from '@/lib/security';
import { getDict } from '@/lib/i18n/server';

const MAX_ROWS = 5000;

export async function GET() {
  // To'liq tekshiruv: sessiya + tokenVersion/faol user + do'kon holati (sessiya do'koni)
  const ctx = await getApiTenantContext();
  const x = (await getDict()).stock.export;
  if (!ctx) return NextResponse.json({ error: x.authRequired }, { status: 401 });
  const { user, org } = ctx;
  if (!isFeatureEnabled(org, 'export')) {
    return NextResponse.json({ error: x.moduleOff }, { status: 403 });
  }
  const perms = await loadUserPermissions(user);
  if (!perms.has('export.data')) return NextResponse.json({ error: x.noPermission }, { status: 403 });

  const { Sale } = await getTenantModels(user.dbName!);
  // Filial login faqat o'z filiali sotuvlarini yuklab oladi
  const cursor = Sale.find(branchFilter(user)).sort({ createdAt: -1 }).limit(MAX_ROWS).lean().cursor();

  // Ustun sarlavhalari va to'lov turi nomlari — tilga qarab (d.stock.export)
  const header = x.salesHeader.join(',');
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('﻿' + header));
      try {
        for await (const s of cursor) {
          const row = [
            s.saleNo,
            s.createdAt ? new Date(s.createdAt).toISOString().slice(0, 10) : '',
            s.customerSnapshot?.fullName ?? '—',
            s.customerSnapshot?.phone ?? '—',
            s.productSnapshot?.imei ?? '',
            s.productSnapshot?.name ?? '',
            x.paymentTypes[s.paymentType],
            s.bankName ?? '',
            s.totalAmount,
            s.paidAmount,
            s.remainingAmount,
            s.status,
          ].map(csvCell).join(',');
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
      'Content-Disposition': 'attachment; filename="sotuvlar.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
