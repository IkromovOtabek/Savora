import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { getTenantModels } from '@/lib/tenantDb';
import { getMobileFeatures } from '@/lib/mobileOrg';
import { mobilePermissionDenied } from '@/lib/permissionGuard';
import { getLatestReport, toReportView } from '@/lib/ai/report';

/**
 * Oxirgi AI hisobot — FAQAT keshdan (yangi tahlil boshlanmaydi, AI chaqirilmaydi).
 * Hisobot yo'q bo'lsa: { report: null }. Yangi tahlil — web'dagi /app/ai sahifasida.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  const features = await getMobileFeatures(user.organizationId);
  if (!features?.ai) return NextResponse.json({ error: 'AI yordamchi moduli yoqilmagan.' }, { status: 403 });
  { const denied = await mobilePermissionDenied(user, 'ai.view'); if (denied) return denied; }

  const { AiReport } = await getTenantModels(user.dbName);
  const r = await getLatestReport({ AiReport }, user);
  if (!r) return NextResponse.json({ report: null });
  const v = toReportView(r);
  return NextResponse.json({
    report: {
      id: v.id,
      source: v.source,
      createdAt: v.createdAt,
      health: v.result.health,
      summary: v.result.summary,
      insights: v.result.insights.slice(0, 4),
      recommendations: v.result.recommendations.slice(0, 3),
      tasks: v.result.tasks.slice(0, 5),
    },
  });
}
