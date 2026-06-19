import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { SessionData, sessionOptions } from '@/lib/session';
import { getMasterModels } from '@/lib/masterDb';
import { getTenantModels } from '@/lib/tenantDb';
import { isFeatureEnabled } from '@/lib/features';

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

  const { Product } = await getTenantModels(user.dbName);
  const products = await Product.find().sort({ createdAt: -1 }).lean();

  const header = 'IMEI,Nom,Rang,Holat,Kelish,Sotuv,Izoh';
  const rows = products.map((p) =>
    [p.imei, p.name, p.color ?? '', p.status, p.purchasePrice, p.salePrice, p.notes ?? '']
      .map(csvEscape).join(',')
  );

  const csv = '\uFEFF' + [header, ...rows].join('\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="ombor.csv"',
    },
  });
}
