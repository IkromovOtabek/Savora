import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { SessionData, sessionOptions } from '@/lib/session';
import { getMasterModels } from '@/lib/masterDb';
import { getTenantModels } from '@/lib/tenantDb';
import { isFeatureEnabled } from '@/lib/features';
import { PAYMENT_TYPE_LABELS } from '@/lib/models/tenant/Sale';

function csvEscape(v: string | number) {
  const s = String(v);
  return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  const user = session.user;
  if (!user?.dbName || !user.organizationId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { Organization } = await getMasterModels();
  const org = await Organization.findById(user.organizationId).lean();
  if (!org || !isFeatureEnabled(org, 'export')) {
    return NextResponse.json({ error: 'Export moduli faol emas' }, { status: 403 });
  }

  const { Sale } = await getTenantModels(user.dbName);
  const sales = await Sale.find().sort({ createdAt: -1 }).limit(5000).lean();

  const header = 'SotuvNo,Sana,Mijoz,Telefon,IMEI,Mahsulot,To\'lov,Bank,Jami,To\'langan,Qoldiq,Holat';
  const rows = sales.map((s) =>
    [
      s.saleNo,
      new Date(s.createdAt!).toISOString().slice(0, 10),
      s.customerSnapshot?.fullName ?? '—',
      s.customerSnapshot?.phone ?? '—',
      s.productSnapshot.imei,
      s.productSnapshot.name,
      PAYMENT_TYPE_LABELS[s.paymentType],
      s.bankName ?? '',
      s.totalAmount,
      s.paidAmount,
      s.remainingAmount,
      s.status,
    ].map(csvEscape).join(',')
  );

  const csv = '\uFEFF' + [header, ...rows].join('\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="sotuvlar.csv"',
    },
  });
}
