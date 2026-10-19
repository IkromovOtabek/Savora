import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateMobile } from '@/lib/mobileAuth';
import { getMasterModels } from '@/lib/masterDb';
import { getTenantModels } from '@/lib/tenantDb';
import { recordAudit } from '@/lib/audit';
import { sendTelegram, tgEscape } from '@/lib/telegram';
import { hitRateLimit } from '@/lib/rateLimit';
import { readJsonInput } from '@/lib/validation';

/**
 * Hisobni (do'konni) o'chirish so'rovi — App Store 5.1.1(v): ilovada hisob ochish bo'lsa, o'chirish ham bo'lishi shart.
 * Faqat do'kon egasi, parolni qayta tasdiqlab. Do'kon darhol to'xtatiladi va barcha kirishlar bekor qilinadi;
 * ma'lumotlarni butunlay o'chirish platforma egasi tomonidan zaxiradan keyin bajariladi (oferta shartlari bo'yicha).
 */
export async function POST(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user?.dbName || !user.organizationId) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  if (user.role !== 'admin') {
    return NextResponse.json({ error: "Do'konni faqat uning egasi o'chira oladi." }, { status: 403 });
  }

  const input = await readJsonInput(req, z.object({ password: z.string().min(1, 'Parolni kiriting.').max(128) }),
    { badJson: "Noto'g'ri so'rov.", fallback: 'Parolni kiriting.' });
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  const rl = await hitRateLimit(`account-delete:${user.id}`, 5, 60 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "Juda ko'p urinish. Keyinroq urinib ko'ring." }, { status: 429 });

  const { User } = await getTenantModels(user.dbName);
  const owner = await User.findById(user.id).exec();
  if (!owner || !(await owner.comparePassword(input.data.password))) {
    return NextResponse.json({ error: "Parol noto'g'ri." }, { status: 401 });
  }

  const { Organization } = await getMasterModels();
  const org = await Organization.findOneAndUpdate(
    { _id: user.organizationId },
    { $set: { status: 'suspended', deletionRequestedAt: new Date() } },
    { new: true },
  ).lean();
  if (!org) return NextResponse.json({ error: "Do'kon topilmadi." }, { status: 404 });

  // Barcha xodimlarning tokenlari va sessiyalari bekor bo'ladi (tokenVersion oshadi)
  await User.updateMany({}, { $inc: { tokenVersion: 1 } });

  await recordAudit(user, {
    action: 'org.delete_request', entity: 'auth',
    summary: `Do'kon egasi ilovadan hisobni o'chirishni so'radi — do'kon to'xtatildi`,
  });
  void sendTelegram(`🗑 <b>Hisobni o'chirish so'rovi</b>\nDo'kon: ${tgEscape(org.name)} (${tgEscape(org.slug)})\nEgasi: ${tgEscape(user.username)}\nDo'kon to'xtatildi — ma'lumotlarni zaxiradan keyin o'chiring.`);

  return NextResponse.json({ ok: true });
}
