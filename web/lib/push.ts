import { Types } from 'mongoose';
import { getMasterModels } from './masterDb';
import { getTenantModels } from './tenantDb';
import { logError, logWarn } from './logger';

/**
 * Mobil ilovaga push bildirishnomalar — Expo Push Service orqali (u APNs / FCM ga yetkazadi).
 * Qurilma tokenlari master `push_devices` da (POST /api/mobile/push).
 *
 * Telegram kabi "best effort": xato chaqiruvchi amalni (sotuv, smena, cron) to'xtatmaydi.
 * Ovoz: iOS — `sound: 'default'`; Android — ilovadagi `savora` kanali (yuqori muhimlik + ovoz).
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo bitta so'rovda 100 tagacha xabar qabul qiladi */
const CHUNK = 100;

/** Android bildirishnoma kanali — mobile/lib/push.ts dagi bilan bir xil bo'lishi shart */
export const PUSH_CHANNEL_ID = 'savora';

export interface PushMessage {
  title: string;
  body: string;
  /** Bosilganda ochiladigan ilova ekrani (expo-router yo'li), masalan '/shifts' */
  url?: string;
}

const TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$/;

export function isExpoPushToken(t: unknown): t is string {
  return typeof t === 'string' && TOKEN_RE.test(t);
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function buildExpoMessages(tokens: string[], msg: PushMessage) {
  return tokens.map((to) => ({
    to,
    title: clip(msg.title, 120),
    body: clip(msg.body, 600),
    sound: 'default' as const,
    priority: 'high' as const,
    channelId: PUSH_CHANNEL_ID,
    ...(msg.url ? { data: { url: msg.url } } : {}),
  }));
}

interface ExpoTicket { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } }

/**
 * Tokenlarga yuboradi. `dead` — ilova o'chirilgan/token bekor bo'lgan qurilmalar (DeviceNotRegistered),
 * ularni bazadan olib tashlash kerak.
 */
export async function sendExpoPush(
  tokens: string[],
  msg: PushMessage,
  fetchImpl: typeof fetch = fetch,
): Promise<{ sent: number; dead: string[] }> {
  const unique = [...new Set(tokens.filter(isExpoPushToken))];
  let sent = 0;
  const dead: string[] = [];
  if (unique.length === 0) return { sent, dead };

  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
  // Expo "Enhanced push security" yoqilgan bo'lsa majburiy; aks holda ixtiyoriy
  const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  for (const part of chunk(unique, CHUNK)) {
    try {
      const res = await fetchImpl(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(buildExpoMessages(part, msg)),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const body = (await res.text().catch(() => '')).slice(0, 300);
        logWarn('push: Expo so\'rovni rad etdi', { status: res.status, body });
        continue;
      }
      const json = (await res.json()) as { data?: ExpoTicket[] };
      (json.data ?? []).forEach((t, i) => {
        if (t.status === 'ok') sent++;
        else if (t.details?.error === 'DeviceNotRegistered') dead.push(part[i]);
        else logWarn('push: xabar yuborilmadi', { error: t.details?.error, message: t.message });
      });
    } catch (e) {
      logError('push: Expo bilan bog\'lanib bo\'lmadi', e);
    }
  }
  return { sent, dead };
}

export type PushAudience = { admins: true } | { userIds: string[] };

/**
 * Do'kon foydalanuvchilariga push: adminlarga (egasi) yoki aniq foydalanuvchilarga.
 * Faol bo'lmagan xodimga va sessiyasi bekor qilingan (parol almashgan) qurilmaga bormaydi.
 * `exceptUserId` — amalni bajargan odamning o'ziga yubormaslik uchun.
 */
export async function pushToShop(
  dbName: string,
  audience: PushAudience,
  msg: PushMessage,
  opts: { exceptUserId?: string } = {},
): Promise<number> {
  try {
    const { PushDevice } = await getMasterModels();
    const devices = await PushDevice.find({ dbName }).select('token userId tokenVersion').lean();
    if (devices.length === 0) return 0;

    const { User } = await getTenantModels(dbName);
    const filter = 'admins' in audience
      ? { role: 'admin', active: true }
      : { _id: { $in: audience.userIds.filter((id) => Types.ObjectId.isValid(id)) }, active: true };
    const users = await User.find(filter).select('tokenVersion').lean();
    const versions = new Map(users.map((u) => [String(u._id), u.tokenVersion ?? 0]));
    if (opts.exceptUserId) versions.delete(opts.exceptUserId);

    const tokens = devices
      .filter((d) => versions.has(d.userId) && versions.get(d.userId) === (d.tokenVersion ?? 0))
      .map((d) => d.token);
    if (tokens.length === 0) return 0;

    const { sent, dead } = await sendExpoPush(tokens, msg);
    if (dead.length) await PushDevice.deleteMany({ token: { $in: dead } });
    return sent;
  } catch (e) {
    logError('pushToShop', e, { dbName });
    return 0;
  }
}

/** Kamida bitta qurilma ulangan do'konlar — cron'lar Telegram ulanmagan do'konni ham o'tkazib yubormasligi uchun */
export async function orgIdsWithPush(): Promise<Set<string>> {
  try {
    const { PushDevice } = await getMasterModels();
    const ids = await PushDevice.distinct('organizationId');
    return new Set(ids.map(String));
  } catch (e) {
    logError('orgIdsWithPush', e);
    return new Set();
  }
}
