import { getMasterModels } from './masterDb';

export interface PublicReview {
  id: string;
  shopName: string;
  rating: number;
  comment: string;
  authorName: string;
  createdAt: string;
}

/** Landing uchun — oxirgi tasdiqlangan, izohli baholar */
export async function getLatestReviews(limit = 6): Promise<PublicReview[]> {
  try {
    const { Review } = await getMasterModels();
    const docs = await Review.find({ approved: true, comment: { $exists: true, $ne: '' } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return docs.map((d) => ({
      id: String(d._id),
      shopName: d.shopName,
      rating: d.rating,
      comment: d.comment ?? '',
      authorName: d.authorName ?? '',
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : '',
    }));
  } catch {
    return [];
  }
}
