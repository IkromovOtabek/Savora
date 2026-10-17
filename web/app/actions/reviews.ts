'use server';

import { revalidatePath } from 'next/cache';
import { getTenantSession } from '@/lib/tenantSession';
import { getMasterModels } from '@/lib/masterDb';
import { Types } from 'mongoose';
import { branchFilter } from '@/lib/branchScope';
import { hitRateLimit } from '@/lib/rateLimit';
import { getDict } from '@/lib/i18n/server';

type State = { error?: string; success?: string } | null;

export async function submitReviewAction(_prev: State, formData: FormData): Promise<State> {
  const m = (await getDict()).sales.actions;
  let org, user, Sale;
  try {
    const session = await getTenantSession();
    org = session.org;
    user = session.user;
    Sale = session.Sale;
  } catch {
    return { error: m.noSession };
  }

  const rating = parseInt(String(formData.get('rating') || ''), 10);
  const comment = String(formData.get('comment') || '').trim();
  const authorName = String(formData.get('authorName') || '').trim();
  const branchName = String(formData.get('branchName') || '').trim();
  const saleId = String(formData.get('saleId') || '').trim();

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: m.pickRating };
  if (comment.length > 600) return { error: m.commentTooLong };
  if (authorName.length > 80 || branchName.length > 80) return { error: m.nameTooLong };

  // Sharh landing'ga chiqadi — faqat shu do'konning haqiqiy (bekor qilinmagan) sotuviga,
  // filial xodimi esa faqat o'z filiali sotuviga. Sotuvsiz sharh — spam/defeys kanali edi.
  if (!saleId || !Types.ObjectId.isValid(saleId)) return { error: m.reviewSaleOnly };
  const sale = await Sale.findOne({ _id: saleId, status: { $ne: 'cancelled' }, ...branchFilter(user) })
    .select('customerSnapshot.fullName')
    .lean();
  if (!sale) return { error: m.saleNotFound };
  // Bir do'kon kuniga ko'pi bilan 10 sharh
  if (!hitRateLimit(`review:${org._id}`, 10, 24 * 60 * 60 * 1000).ok) {
    return { error: m.reviewLimit };
  }
  const resolvedAuthor = sale.customerSnapshot?.fullName?.trim() || authorName;

  try {
    const { Review } = await getMasterModels();

    // Bitta sotuvga bitta baho
    const exists = await Review.findOne({ saleId, organizationId: org._id }).select('_id').lean();
    if (exists) return { success: m.reviewExists };

    await Review.create({
      organizationId: org._id,
      shopName: org.name,
      shopSlug: org.slug,
      rating,
      comment: comment || undefined,
      authorName: resolvedAuthor || undefined,
      branchName: branchName || undefined,
      saleId,
      approved: true,
    });

    // Landing yangilansin
    revalidatePath('/');
    return { success: m.reviewThanks };
  } catch {
    return { error: m.reviewFailed };
  }
}
