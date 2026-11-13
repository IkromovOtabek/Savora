import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateMobile } from '@/lib/mobileAuth';
import { getMasterModels } from '@/lib/masterDb';
import { hitRateLimit } from '@/lib/rateLimit';
import { readJsonInput } from '@/lib/validation';
import { isExpoPushToken } from '@/lib/push';

/** Bitta foydalanuvchiga eng ko'p qurilma — eski (uzoq ochilmagan) qurilmalar olib tashlanadi */
const MAX_DEVICES_PER_USER = 10;

const tokenSchema = z.string().trim().refine(isExpoPushToken, 'Push token noto\'g\'ri.');
const registerSchema = z.object({ token: tokenSchema, platform: z.enum(['ios', 'android']) });
const unregisterSchema = z.object({ token: tokenSchema });
const MSG = { badJson: "Noto'g'ri so'rov.", fallback: 'Push token noto\'g\'ri.' };

/** Ilova kirganda/ochilganda: qurilmani push bildirishnoma uchun yozadi (yoki yangilaydi) */
export async function POST(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user?.dbName || !user.organizationId) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });

  const input = await readJsonInput(req, registerSchema, MSG);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  const rl = await hitRateLimit(`push-register:${user.id}`, 30, 60 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "Juda ko'p so'rov." }, { status: 429 });

  const { PushDevice } = await getMasterModels();
  // Token unikal: telefonda boshqa foydalanuvchi kirsa, yozuv unga o'tadi
  await PushDevice.updateOne(
    { token: input.data.token },
    {
      $set: {
        platform: input.data.platform,
        dbName: user.dbName,
        userId: user.id,
        organizationId: user.organizationId,
        tokenVersion: user.tokenVersion ?? 0,
        lastSeenAt: new Date(),
      },
    },
    { upsert: true },
  );

  const extra = await PushDevice.find({ dbName: user.dbName, userId: user.id })
    .sort({ lastSeenAt: -1 }).skip(MAX_DEVICES_PER_USER).select('_id').lean();
  if (extra.length) await PushDevice.deleteMany({ _id: { $in: extra.map((d) => d._id) } });

  return NextResponse.json({ ok: true });
}

/** Chiqishda: shu qurilmaga endi push bormaydi */
export async function DELETE(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user?.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });

  const input = await readJsonInput(req, unregisterSchema, MSG);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  const { PushDevice } = await getMasterModels();
  await PushDevice.deleteOne({ token: input.data.token, dbName: user.dbName, userId: user.id });
  return NextResponse.json({ ok: true });
}
