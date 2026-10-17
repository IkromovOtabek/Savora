'use server';

import { revalidatePath } from 'next/cache';
import { getTenantSession } from '@/lib/tenantSession';
import { userCan } from '@/lib/permissionGuard';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { recordAudit } from '@/lib/audit';
import { runAnalysis } from '@/lib/ai/report';
import { AI_DAILY_LIMIT } from '@/lib/ai/types';

type State = { error?: string; success?: string } | null;

/** «Qayta tahlil» — yangi snapshot; ma'lumot o'zgarmagan bo'lsa kesh, kunlik limit bilan */
export async function rerunAiAnalysisAction(_prev: State, _formData: FormData): Promise<State> {
  void _formData;
  const models = await getTenantSession();
  const { user, org, features } = models;
  const d = await getDict();
  if (!features.ai) return { error: tr(d.crm.featureDisabled, { label: d.catalog.features.ai.label }) };
  if (!(await userCan(user, 'ai.view'))) return { error: tr(d.catalog.permissionDeniedNamed, { label: d.catalog.permissions['ai.view'].label }) };

  try {
    const out = await runAnalysis(models, user, { businessType: org.businessType });
    if (out.status === 'limited') {
      return { error: tr(d.crm.ai.limitReached, { n: AI_DAILY_LIMIT }) };
    }
    if (out.status === 'cached') {
      return { success: d.crm.ai.cached };
    }
    await recordAudit(user, {
      action: 'ai.analyze',
      entity: 'ai',
      entityId: String(out.report._id),
      summary: `AI tahlil: ${out.report.source === 'ai' ? out.report.model : 'qoidalar asosida'}`,
    });
  } catch {
    return { error: d.crm.ai.errAnalyze };
  }
  revalidatePath('/app/ai');
  revalidatePath('/app');
  return { success: d.crm.ai.updated };
}
