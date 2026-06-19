import type { Model } from 'mongoose';
import type { IBranch } from '@/lib/models/tenant/Branch';

/** Markaziy ombor — birinchi yaratilgan faol filial */
export async function resolveWarehouseBranchId(
  Branch: Model<IBranch>
): Promise<string | null> {
  const first = await Branch.findOne({ active: true }).sort({ createdAt: 1 }).lean();
  return first ? String(first._id) : null;
}
