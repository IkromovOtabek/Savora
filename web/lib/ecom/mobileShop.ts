import { NextResponse } from 'next/server';
import { authenticateMobile } from '../mobileAuth';
import { getMasterModels } from '../masterDb';
import { getTenantModels } from '../tenantDb';
import type { SessionUser } from '../session';
import { apiDict, apiJson } from './api';

/** Mobil biznes API: faqat do'kon egasi (admin) — e-commerce boshqaruvi */
export async function mobileEcomAdmin(req: Request): Promise<
  | { user: SessionUser & { dbName: string; organizationId: string }; m: Awaited<ReturnType<typeof getTenantModels>>; org: { _id: string; slug: string } }
  | NextResponse
> {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== 'admin' || !auth.dbName || !auth.organizationId) {
    return apiJson({ error: apiDict(req).ecom.orders.errors.failed, code: 'forbidden' }, 403);
  }
  const { Organization } = await getMasterModels();
  const org = await Organization.findById(auth.organizationId).select('slug').lean();
  if (!org) return apiJson({ error: 'Avtorizatsiya kerak.' }, 401);
  return {
    user: auth as SessionUser & { dbName: string; organizationId: string },
    m: await getTenantModels(auth.dbName),
    org: { _id: String(org._id), slug: org.slug },
  };
}
