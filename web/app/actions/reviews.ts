'use server';

import { revalidatePath } from 'next/cache';
import { getTenantSession } from '@/lib/tenantSession';
import { getMasterModels } from '@/lib/masterDb';

type State = { error?: string; success?: string } | null;

export async function submitReviewAction(_prev: State, formData: FormData): Promise<State> {
  let org;
  try {
    const session = await getTenantSession();
    org = session.org;
  } catch {
    return { error: 'Sessiya topilmadi.' };
  }

  const rating = parseInt(String(formData.get('rating') || ''), 10);
  const comment = String(formData.get('comment') || '').trim();
  const authorName = String(formData.get('authorName') || '').trim();
  const branchName = String(formData.get('branchName') || '').trim();
  const saleId = String(formData.get('saleId') || '').trim();

  if (!rating || rating < 1 || rating > 5) return { error: 'Bahoni tanlang (1–5 yulduz).' };
  if (comment.length > 600) return { error: 'Izoh juda uzun (600 belgigacha).' };

  try {
    const { Review } = await getMasterModels();

    // Bitta sotuvga bitta baho
    if (saleId) {
      const exists = await Review.findOne({ saleId }).select('_id').lean();
      if (exists) return { success: 'Baho allaqachon berilgan. Rahmat!' };
    }

    await Review.create({
      organizationId: org._id,
      shopName: org.name,
      shopSlug: org.slug,
      rating,
      comment: comment || undefined,
      authorName: authorName || undefined,
      branchName: branchName || undefined,
      saleId: saleId || undefined,
      approved: true,
    });

    // Landing yangilansin
    revalidatePath('/');
    return { success: 'Bahoyingiz uchun rahmat!' };
  } catch {
    return { error: 'Baho saqlanmadi. Qayta urinib ko\'ring.' };
  }
}
