import { apiDict, apiJson, readBody } from '@/lib/ecom/api';
import { createBuyerToken, registerBuyer } from '@/lib/ecom/buyerAuth';
import { clientIpFrom } from '@/lib/security';

/** POST /api/market/auth/register { name, phone, password } → { token, buyer } (mobil xaridor) */
export async function POST(req: Request) {
  const t = apiDict(req).ecom.market.auth.errors;
  const body = await readBody(req);
  const r = await registerBuyer({ name: body?.name, phone: body?.phone, password: body?.password }, clientIpFrom(req.headers));
  if (!r.ok) {
    const status = r.error === 'rateLimited' ? 429 : r.error === 'exists' ? 409 : 400;
    return apiJson({ error: t[r.error as keyof typeof t] ?? t.invalid, code: r.error }, status);
  }
  const b = r.buyer;
  return apiJson({ token: await createBuyerToken(b), buyer: { id: String(b._id), name: b.name, phone: b.phone } }, 201);
}
