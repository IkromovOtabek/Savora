import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateMobile } from '@/lib/mobileAuth';
import { getMasterModels } from '@/lib/masterDb';
import { getTenantModels } from '@/lib/tenantDb';
import { getShopSettings, saveShopSettingsPart } from '@/lib/shopSettings';
import { recordAudit } from '@/lib/audit';
import { readJsonInput } from '@/lib/validation';
import type { SessionUser } from '@/lib/session';

/**
 * Bildirishnoma sozlamalari (web «Sozlamalar → Bildirishnomalar» bilan bir xil):
 * qaysi xabarlar Telegram'ga va ilovaga yuborilsin. Faqat biznes egasi (admin).
 */

const schema = z.object({ shiftDiff: z.boolean(), dailySummary: z.boolean(), newSale: z.boolean() });
const MSG = { badJson: "Noto'g'ri so'rov.", fallback: "Noto'g'ri so'rov." };

function deny(user: SessionUser | null): NextResponse | null {
  if (!user || !user.dbName || !user.organizationId) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Faqat biznes egasi uchun.' }, { status: 403 });
  return null;
}

export async function GET(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const denied = deny(auth);
  if (denied) return denied;
  const user = auth as SessionUser & { dbName: string; organizationId: string };

  const [{ ShopSettings }, { Organization }] = await Promise.all([getTenantModels(user.dbName), getMasterModels()]);
  const [settings, org] = await Promise.all([
    getShopSettings(ShopSettings),
    Organization.findById(user.organizationId).select('telegramChatId').lean(),
  ]);
  return NextResponse.json({ notify: settings.notify, telegram: !!org?.telegramChatId });
}

export async function PUT(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const denied = deny(auth);
  if (denied) return denied;
  const user = auth as SessionUser & { dbName: string; organizationId: string };

  const input = await readJsonInput(req, schema, MSG);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
  const value = input.data;

  const { ShopSettings } = await getTenantModels(user.dbName);
  await saveShopSettingsPart(ShopSettings, 'notify', value, user.username);
  await recordAudit(user, {
    action: 'settings.notify', entity: 'branch',
    summary: `Bildirishnomalar (mobil): smena farqi ${value.shiftDiff ? 'yoqildi' : "o'chirildi"}, kunlik yakun ${value.dailySummary ? 'yoqildi' : "o'chirildi"}, yangi sotuv ${value.newSale ? 'yoqildi' : "o'chirildi"}`,
  });
  return NextResponse.json({ ok: true, notify: value });
}
