'use server';

import { revalidatePath } from 'next/cache';
import { getTenantSession } from '@/lib/tenantSession';
import { featureDisabledError } from '@/lib/featureAction';
import { checkPermission } from '@/lib/permissionGuard';
import { recordAudit } from '@/lib/audit';
import { runAnalysis } from '@/lib/ai/report';
import { AI_DAILY_LIMIT } from '@/lib/ai/types';

type State = { error?: string; success?: string } | null;

/** «Qayta tahlil» — yangi snapshot; ma'lumot o'zgarmagan bo'lsa kesh, kunlik limit bilan */
export async function rerunAiAnalysisAction(_prev: State, _formData: FormData): Promise<State> {
  void _formData;
  const models = await getTenantSession();
  const { user, org, features } = models;
  if (!features.ai) return featureDisabledError('ai');
  { const denied = await checkPermission(user, 'ai.view'); if (denied) return denied; }

  try {
    const out = await runAnalysis(models, user, { businessType: org.businessType });
    if (out.status === 'limited') {
      return { error: `Bugungi tahlil limiti tugadi (${AI_DAILY_LIMIT} ta). Ertaga qayta urinib ko'ring.` };
    }
    if (out.status === 'cached') {
      return { success: 'Ma\'lumotlar o\'zgarmagan — oxirgi tahlil dolzarb.' };
    }
    await recordAudit(user, {
      action: 'ai.analyze',
      entity: 'ai',
      entityId: String(out.report._id),
      summary: `AI tahlil: ${out.report.source === 'ai' ? out.report.model : 'qoidalar asosida'}`,
    });
  } catch {
    return { error: 'Tahlil qilishda xatolik. Keyinroq urinib ko\'ring.' };
  }
  revalidatePath('/app/ai');
  revalidatePath('/app');
  return { success: 'Tahlil yangilandi.' };
}
