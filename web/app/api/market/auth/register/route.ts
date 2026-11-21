import { apiDict, apiJson, readBody } from '@/lib/ecom/api';
import { createBuyerToken, registerBuyer } from '@/lib/ecom/buyerAuth';
import { buyerPhoneKey } from '@/lib/ecom/group';
import { clientIpFrom } from '@/lib/security';
import { consumeTgTicket, verifyTgTicket } from '@/lib/tgSignup';

/**
 * POST /api/market/auth/register { name, phone, password, tgTicket? } → { token, buyer } (mobil xaridor).
 * `tgTicket` — Telegram orqali tasdiqlangan raqam (lib/tgSignup.ts): telefon unga mos bo'lishi shart.
 */
export async function POST(req: Request) {
  const t = apiDict(req).ecom.market.auth.errors;
  const body = await readBody(req);
  const tg = body?.tgTicket ? await verifyTgTicket(body.tgTicket) : null;
  if (body?.tgTicket && !tg) return apiJson({ error: t.tgExpired, code: 'tgExpired' }, 400);
  if (tg && buyerPhoneKey(body?.phone) !== tg.p) return apiJson({ error: t.tgPhoneMismatch, code: 'tgPhoneMismatch' }, 400);
  const r = await registerBuyer(
    { name: body?.name, phone: body?.phone, password: body?.password, telegramUserId: tg?.tg },
    clientIpFrom(req.headers),
  );
  if (!r.ok) {
    const status = r.error === 'rateLimited' ? 429 : r.error === 'exists' ? 409 : 400;
    return apiJson({ error: t[r.error as keyof typeof t] ?? t.invalid, code: r.error }, status);
  }
  const b = r.buyer;
  if (tg) await consumeTgTicket(tg);
  return apiJson({ token: await createBuyerToken(b), buyer: { id: String(b._id), name: b.name, phone: b.phone } }, 201);
}
