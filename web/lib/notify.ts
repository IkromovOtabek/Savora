/**
 * Ilova ichidagi bildirishnomalar (web qo'ng'iroqcha + mobil ro'yxat + push).
 *
 * SHARTNOMA (interfeys) — boshqa modullar faqat `notify()` ni chaqiradi; ichki saqlash, push va ro'yxat shu faylda.
 * Matn bazaga yozilmaydi: `kind` + `params` saqlanadi, matn ko'ruvchining tilida lug'atdan (`d.notify`) chiqadi;
 * push matni — uz (mavjud cron bildirishnomalari kabi).
 *
 * `notify()` hech qachon xato tashlamaydi (xatoni log qiladi) — chaqiruvchi amalni (taom yuborish, QR chaqiruv) to'xtatmaydi.
 *
 * Ichki qoidalar (batafsil — docs/RESTORAN_API.md §15):
 *  - Kim ko'radi — O'QISHDA (joriy huquq bilan) filtrlanadi: `audience.userIds` ichida; YOKI filial xodimi va huquqlaridan
 *    biri `audience.anyPermission` da; YOKI `audience.admins` va u do'kon egasi. Filial xodimi faqat o'z filiali
 *    (yoki filialsiz) xabarini ko'radi; `anyPermission` faqat xodimlarga (egasi — `admins` yoki `userIds` orqali).
 *  - Hech kim mos kelmasa (ofitsant yo'q, xodim yo'q) — xabar egasiga (`admins`) o'tadi: kimdir albatta ko'rsin.
 *  - Takrorlanmaslik: `dedupeKey` + tur bo'yicha oyna (`NOTIFY_DEDUPE_MS`); bir vaqtdagi ikki so'rov — noyob `dedupeSlot`.
 *  - Push: oluvchilar userId'larga aylantiriladi (faol, filial mos, huquq — loadUserPermissions bilan bir xil hisob),
 *    fonda yuboriladi (chaqiruvchi Expo javobini kutmaydi).
 *  - Chaqiruv «Ko'rdim» bilan yopilsa (`resolveNotifications`) — hammada o'qilgan bo'ladi, keyingi chaqiruv darhol yangi xabar.
 */
import { Types } from 'mongoose';
import { z } from 'zod';
import type { PermissionKey } from './permissions';
import { effectivePermissionsWithRole, isPermissionKey, withEnabledModules } from './permissions';
import { getTenantModels } from './tenantDb';
import { getMasterModels } from './masterDb';
import { resolveOrgFeatures, type OrgFeatures } from './features';
import { pushToShop } from './push';
import { getDictionary, type Dict } from './i18n/dict';
import { logError } from './logger';
import { NOTIFY_DEDUPE_MS, cleanParams, isNotifyKind, notifyText, safeAppUrl, type NotificationList, type NotificationView } from './notifyView';
import type { NotificationDoc } from './models/tenant/Notification';

export type NotifyKind =
  /** Xom ashyo minimal qoldiqdan tushdi — params: { product, qty, unit?, min, branch? } */
  | 'lowStock'
  /** Taomga oz porsiya qoldi yoki tugadi — params: { dish, portions, branch? } */
  | 'dishLow'
  /** Mijoz QR orqali ofitsantni chaqirdi — params: { table } */
  | 'waiterCall'
  /** Mijoz QR orqali hisob so'radi — params: { table } */
  | 'billCall'
  /** Bron yaqinlashdi — params: { table, time, name, guests } */
  | 'reservationSoon';

export type NotifyParams = Record<string, string | number | null | undefined>;

export interface NotifyInput {
  kind: NotifyKind;
  /** Filial: xabar shu filial xodimlariga boradi (do'kon egasi — har doim). Yo'q — butun do'kon */
  branchId?: string | null;
  /** Matn parametrlari (yuqoridagi `NotifyKind` izohlari) */
  params: NotifyParams;
  /** Bosilganda ochiladigan web yo'li, masalan '/app/tables' (mobil o'z ekraniga moslaydi) */
  url?: string;
  /**
   * Kimga: aniq foydalanuvchilar (`userIds`) va/yoki shu huquqlardan biri bor xodimlar (`anyPermission`, filial bo'yicha).
   * `admins: true` — do'kon egasi(lar)i ham.
   */
  audience: { userIds?: string[]; anyPermission?: PermissionKey[]; admins?: boolean };
  /** Takrorlanmaslik kaliti: shu kalitli xabar yaqinda yaratilgan bo'lsa — yangisi yaratilmaydi */
  dedupeKey?: string;
}

/** Do'kon: `id` — Organization _id, `dbName` — tenant baza nomi */
export interface NotifyOrg { id: string; dbName: string }

export async function notify(org: NotifyOrg, input: NotifyInput): Promise<void> {
  try {
    await createNotification(org, input);
  } catch (e) {
    logError('notify', e, { kind: input?.kind, dbName: org?.dbName });
  }
}

/* ───────────────────────────── ichki qism ───────────────────────────── */

type TenantModels = Awaited<ReturnType<typeof getTenantModels>>;
type AudienceModels = Pick<TenantModels, 'User' | 'Role'>;

const validId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);
const isDupKey = (e: unknown) => (e as { code?: number } | null)?.code === 11000;

/**
 * Fon vazifalari (push, taom yuborilgandan keyingi ombor tekshiruvi): chaqiruvchi kutmaydi, xato yutiladi (log).
 * `settleNotifications()` — hammasi tugashini kutish (testlar va ehtiyotkor to'xtatish uchun).
 */
const pending = new Set<Promise<unknown>>();

export function notifyInBackground(task: () => Promise<unknown>, label = 'notify background'): void {
  const p: Promise<unknown> = Promise.resolve()
    .then(task)
    .catch((e) => logError(label, e))
    .finally(() => pending.delete(p));
  pending.add(p);
}

export async function settleNotifications(): Promise<void> {
  while (pending.size) await Promise.allSettled([...pending]);
}

async function orgFeatures(dbName: string): Promise<OrgFeatures | null> {
  const { Organization } = await getMasterModels();
  const org = await Organization.findOne({ dbName }).select('plan features businessType').lean();
  return org ? resolveOrgFeatures(org) : null;
}

export interface StoredAudience { userIds: string[]; anyPermission: PermissionKey[]; admins: boolean }

/**
 * Oluvchilar (push uchun): faol foydalanuvchilar — egasi (`admins` yoki `userIds`), filial xodimi (filial mos bo'lsa:
 * `userIds` yoki amaldagi huquqlaridan biri `anyPermission` da). Huquq hisobi — permissionGuard.loadUserPermissions
 * bilan bir xil: rol (bo'lsa) yoki shaxsiy ro'yxat, o'chiq modul huquqlari kesiladi. Modul ma'lum bo'lmasa — faqat `userIds`.
 */
export async function resolveRecipients(
  m: AudienceModels,
  features: OrgFeatures | null,
  audience: StoredAudience,
  branchId: string | null,
): Promise<string[]> {
  const userIds = new Set(audience.userIds);
  if (!userIds.size && !audience.anyPermission.length && !audience.admins) return [];
  const users = await m.User.find({ active: true }).select('role branchId permissions permVersion roleId').lean();
  const roleIds = audience.anyPermission.length
    ? [...new Set(users.map((u) => (u.roleId ? String(u.roleId) : '')).filter(Boolean))]
    : [];
  const roles = roleIds.length ? await m.Role.find({ _id: { $in: roleIds } }).select('permissions permVersion').lean() : [];
  const roleById = new Map(roles.map((r) => [String(r._id), r]));

  const out: string[] = [];
  for (const u of users) {
    const id = String(u._id);
    if (u.role === 'admin') {
      if (audience.admins || userIds.has(id)) out.push(id);
      continue;
    }
    // Filialsiz xodim — hech narsa (branchFilter kabi «fail-closed»); boshqa filial xodimi — yo'q
    if (u.role !== 'user' || !u.branchId) continue;
    if (branchId && String(u.branchId) !== branchId) continue;
    if (userIds.has(id)) {
      out.push(id);
      continue;
    }
    if (!audience.anyPermission.length || !features) continue;
    const role = u.roleId ? roleById.get(String(u.roleId)) ?? null : null;
    const perms = withEnabledModules(effectivePermissionsWithRole(u, role), features);
    if (audience.anyPermission.some((k) => perms.has(k))) out.push(id);
  }
  return out;
}

export interface NotifyResult {
  created: boolean;
  id?: string;
  /** Push oluvchilar (userId) */
  recipients: string[];
  reason?: 'duplicate' | 'invalid';
}

/** `notify()` ning ichki qismi (xato tashlashi mumkin; natija — testlar uchun) */
export async function createNotification(org: NotifyOrg, input: NotifyInput, opts: { now?: Date } = {}): Promise<NotifyResult> {
  if (!org?.dbName || !input || !isNotifyKind(input.kind)) return { created: false, recipients: [], reason: 'invalid' };
  const m = await getTenantModels(org.dbName);
  const now = opts.now ?? new Date();
  const windowMs = NOTIFY_DEDUPE_MS[input.kind];
  const dedupeKey = typeof input.dedupeKey === 'string' && input.dedupeKey.trim() ? input.dedupeKey.trim().slice(0, 120) : undefined;
  if (dedupeKey) {
    const recent = await m.Notification.exists({ dedupeKey, resolvedAt: null, createdAt: { $gt: new Date(now.getTime() - windowMs) } });
    if (recent) return { created: false, recipients: [], reason: 'duplicate' };
  }

  const branchId = input.branchId && validId(String(input.branchId)) ? String(input.branchId) : null;
  const audience: StoredAudience = {
    userIds: [...new Set((input.audience?.userIds ?? []).map(String).filter(validId))].slice(0, 50),
    anyPermission: [...new Set((input.audience?.anyPermission ?? []).filter(isPermissionKey))],
    admins: !!input.audience?.admins,
  };
  const features = await orgFeatures(org.dbName);
  let recipients = await resolveRecipients(m, features, audience, branchId);
  if (!recipients.length && !audience.admins) {
    // Hech kim mos kelmadi (ofitsant ishdan ketgan, filialda xodim yo'q) — egasi ko'rsin
    audience.admins = true;
    recipients = await resolveRecipients(m, features, { userIds: [], anyPermission: [], admins: true }, branchId);
  }

  const params = cleanParams(input.params);
  const url = safeAppUrl(input.url) ?? undefined;
  let id: string;
  try {
    const doc = await m.Notification.create({
      kind: input.kind,
      params,
      branchId: branchId ? new Types.ObjectId(branchId) : null,
      url,
      audience,
      ...(dedupeKey ? { dedupeKey, dedupeSlot: `${dedupeKey}@${Math.floor(now.getTime() / windowMs)}` } : {}),
      readBy: [],
      createdAt: now,
    });
    id = String(doc._id);
  } catch (e) {
    // Shu oynada parallel so'rov allaqachon yaratdi
    if (isDupKey(e)) return { created: false, recipients: [], reason: 'duplicate' };
    throw e;
  }

  if (recipients.length) {
    const { title, body } = notifyText(getDictionary('uz'), input.kind, params);
    notifyInBackground(() => pushToShop(org.dbName, { userIds: recipients }, { title, body, ...(url ? { url } : {}) }), 'notify push');
  }
  return { created: true, id, recipients };
}

/**
 * Chaqiruv hal qilindi («Ko'rdim»): shu kalitli ochiq xabarlar hammada o'qilgan bo'ladi va takrorlanmaslik
 * oynasi bo'shaydi — mijoz yana chaqirsa, darhol yangi xabar. Xato tashlamaydi.
 */
export async function resolveNotifications(dbName: string, dedupeKeys: string[]): Promise<number> {
  const keys = dedupeKeys.filter((k) => typeof k === 'string' && k);
  if (!dbName || !keys.length) return 0;
  try {
    const { Notification } = await getTenantModels(dbName);
    const r = await Notification.updateMany(
      { dedupeKey: { $in: keys }, resolvedAt: null },
      { $set: { resolvedAt: new Date() }, $unset: { dedupeSlot: '' } },
    );
    return r.modifiedCount;
  } catch (e) {
    logError('resolveNotifications', e, { dbName });
    return 0;
  }
}

/* ───────────────────────────── o'qish (ro'yxat, o'qildi) ───────────────────────────── */

export interface NotifyViewer { id: string; role: string; branchId?: string }

/** Hech narsaga mos kelmaydigan filtr (fail-closed) */
const NOTHING = { _id: { $in: [] as Types.ObjectId[] } };

/**
 * Ko'ruvchi ko'radigan xabarlar (Mongo filtri). `perms` — amaldagi huquqlar (loadUserPermissions: o'chiq modul kesilgan).
 *  - egasi: `userIds` ichida yoki `admins`;
 *  - filial xodimi: o'z filiali yoki filialsiz xabar VA (`userIds` ichida yoki huquqlaridan biri `anyPermission` da).
 */
export function visibleFilter(viewer: NotifyViewer, perms: ReadonlySet<PermissionKey>): Record<string, unknown> {
  if (!validId(viewer.id)) return NOTHING;
  if (viewer.role === 'admin') return { $or: [{ 'audience.userIds': viewer.id }, { 'audience.admins': true }] };
  if (viewer.role !== 'user' || !validId(viewer.branchId)) return NOTHING;
  const or: Record<string, unknown>[] = [{ 'audience.userIds': viewer.id }];
  const keys = [...perms];
  if (keys.length) or.push({ 'audience.anyPermission': { $in: keys } });
  return { branchId: { $in: [null, new Types.ObjectId(viewer.branchId)] }, $or: or };
}

function toView(n: NotificationDoc, viewerId: string, d: Dict): NotificationView {
  const params = cleanParams(n.params);
  const handled = !!n.resolvedAt;
  return {
    id: String(n._id),
    kind: n.kind,
    params,
    url: safeAppUrl(n.url),
    createdAt: new Date(n.createdAt).toISOString(),
    read: handled || (n.readBy ?? []).includes(viewerId),
    handled,
    ...notifyText(d, n.kind, params),
  };
}

export const NOTIFY_LIST_MAX = 50;
const NOTIFY_LIST_DEFAULT = 30;

/** Ro'yxat so'rovi: `after` (ISO) — faqat shundan keyin yaratilganlar (polling), `limit` 0–50 (0 — faqat son) */
export const notifyListQuery = z.object({
  after: z.string().max(40).optional().refine((v) => v === undefined || Number.isFinite(Date.parse(v))),
  limit: z.coerce.number().int().min(0).max(NOTIFY_LIST_MAX).optional(),
});

/** O'qildi: bittasi (`id`) yoki hammasi (`all: true`) */
export const notifyReadBody = z.union([
  z.object({ id: z.string().regex(/^[a-f0-9]{24}$/i) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);

/** Ro'yxat (yangisi tepada) + o'qilmaganlar soni */
export async function listNotifications(
  dbName: string,
  viewer: NotifyViewer,
  perms: ReadonlySet<PermissionKey>,
  d: Dict,
  opts: { after?: string | Date; limit?: number } = {},
): Promise<NotificationList> {
  const { Notification } = await getTenantModels(dbName);
  const vis = visibleFilter(viewer, perms);
  const limit = Math.max(0, Math.min(NOTIFY_LIST_MAX, Math.floor(opts.limit ?? NOTIFY_LIST_DEFAULT)));
  const after = opts.after ? new Date(opts.after) : null;
  const serverTime = new Date().toISOString();
  const [docs, unread] = await Promise.all([
    limit
      ? Notification.find({ ...vis, ...(after && Number.isFinite(after.getTime()) ? { createdAt: { $gte: after } } : {}) })
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .lean<NotificationDoc[]>()
      : Promise.resolve([] as NotificationDoc[]),
    Notification.countDocuments({ ...vis, readBy: { $ne: viewer.id }, resolvedAt: null }),
  ]);
  return { serverTime, unread, items: docs.map((n) => toView(n, viewer.id, d)) };
}

/** O'qildi belgisi (faqat ko'ruvchiga ko'rinadigan xabarlar). `found: false` — id topilmadi yoki ko'rish huquqi yo'q */
export async function markNotificationsRead(
  dbName: string,
  viewer: NotifyViewer,
  perms: ReadonlySet<PermissionKey>,
  input: { id: string } | { all: true },
): Promise<{ found: boolean; updated: number; unread: number }> {
  const { Notification } = await getTenantModels(dbName);
  const vis = visibleFilter(viewer, perms);
  let found = true;
  let updated = 0;
  if ('id' in input) {
    if (!validId(input.id)) found = false;
    else {
      // $and — `vis` ning o'z `_id` sharti (fail-closed) ustidan yozilib ketmasin
      const r = await Notification.updateOne({ $and: [vis, { _id: new Types.ObjectId(input.id) }] }, { $addToSet: { readBy: viewer.id } });
      found = r.matchedCount > 0;
      updated = r.modifiedCount;
    }
  } else {
    const r = await Notification.updateMany({ ...vis, readBy: { $ne: viewer.id } }, { $addToSet: { readBy: viewer.id } });
    updated = r.modifiedCount;
  }
  const unread = await Notification.countDocuments({ ...vis, readBy: { $ne: viewer.id }, resolvedAt: null });
  return { found, updated, unread };
}
