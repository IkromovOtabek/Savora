import { apiDict, apiJson, readBody } from '@/lib/ecom/api';
import { createBuyerToken, loginBuyer } from '@/lib/ecom/buyerAuth';
import { clientIpFrom } from '@/lib/security';

/** POST /api/market/auth/login { phone, password } → { token, buyer } (mobil xaridor) */
export async function POST(req: Request) {
  const t = apiDict(req).ecom.market.auth.errors;
  const body = await readBody(req);
  const r = await loginBuyer({ phone: body?.phone, password: body?.password }, clientIpFrom(req.headers));
  if (!r.ok) return apiJson({ error: t[r.error as keyof typeof t] ?? t.invalid, code: r.error }, r.error === 'rateLimited' ? 429 : 401);
  const b = r.buyer;
  return apiJson({ token: await createBuyerToken(b), buyer: { id: String(b._id), name: b.name, phone: b.phone, address: b.address } });
}
