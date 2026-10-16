'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getSession, extendSession } from '@/lib/session';
import { getMasterModels } from '@/lib/masterDb';
import { getAppZone, getTenantSlug, resolveTenant } from '@/lib/tenantContext';
import { getTenantModels } from '@/lib/tenantDb';
import { clearRouteCookies, setRouteCookies } from '@/lib/routeCookies';
import { rootUrl } from '@/lib/urls';
import { sendTelegramTo, sendTelegram, tgEscape } from '@/lib/telegram';
import { clientIpFrom, hashToken, loginRateKeys, randomNumericCode, safeEqual } from '@/lib/security';
import { hitRateLimit, clearRateLimit } from '@/lib/rateLimit';
import { lookupUser, reserveUsername } from '@/lib/userDirectory';
import { recordSecurityEvent, requestMeta } from '@/lib/securityEvents';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';

type State = { error?: string } | null;
type ResetState = { error?: string; success?: string; step?: 'code' | 'done'; username?: string } | null;

type LoginZone = 'super' | 'tenant' | 'root';

function resolveLoginZone(formData: FormData, headerZone: LoginZone): LoginZone {
  const fromForm = String(formData.get('loginZone') || '');
  if (fromForm === 'super' || fromForm === 'tenant') return fromForm;
  if (headerZone === 'super' || headerZone === 'tenant') return headerZone;
  return 'root';
}

async function resolveTenantOrg(slug: string) {
  const { Organization } = await getMasterModels();
  return Organization.findOne({ slug }).lean();
}

export async function loginAction(_prev: State, formData: FormData): Promise<State> {
  const username = String(formData.get('username') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const { errors: e } = (await getDict()).auth;
  if (!username || !password) return { error: e.loginRequired };

  const headerZone = await getAppZone();
  const zone = resolveLoginZone(formData, headerZone);
  const rawSlug = String(formData.get('tenantSlug') || '').trim();
  // Foydalanuvchi "dokon1", "dokon1.savora.uz" yoki to'liq URL yozishi mumkin — slug'ni ajratib olamiz
  const cleanedSlug = rawSlug
    .replace(/^https?:\/\//i, '')
    .split(/[/.]/)[0]
    .toLowerCase();
  const tenantSlug = cleanedSlug || (await getTenantSlug());

  // Brute-force himoyasi — 15 daqiqada 6 ta noto'g'ri urinishdan keyin bloklash.
  // Kalit slug/zonaga bog'liq EMAS (tenantSlug'ni almashtirib chetlab o'tib bo'lmaydi):
  // username bo'yicha + IP bo'yicha (ko'p loginni sinab ko'rish) alohida.
  const hdrs = await headers();
  const ip = clientIpFrom(hdrs);
  const userAgent = hdrs.get('user-agent') || '';
  const keys = loginRateKeys(username, ip);
  const rlKey = keys.user;
  const rl = hitRateLimit(rlKey);
  const rlIp = hitRateLimit(keys.ip, 30);
  if (!rl.ok || !rlIp.ok) {
    const min = Math.ceil((Math.max(rl.retryAfterSec ?? 0, rlIp.retryAfterSec ?? 0)) / 60);
    // Monitoring: bloklangan urinish (brute-force belgisi)
    recordSecurityEvent('login_blocked', { username, ip, userAgent, zone, slug: tenantSlug || undefined });
    return { error: tr(e.tooManyAttemptsMin, { min }) };
  }

  try {
    if (zone === 'super') {
      const { SuperAdmin } = await getMasterModels();
      const sa = await SuperAdmin.findOne({ username }).exec();
      if (!sa || !(await sa.comparePassword(password))) {
        recordSecurityEvent('super_login_fail', { username, ip, userAgent, zone: 'super' });
        return { error: e.badCredentials };
      }
      clearRateLimit(rlKey);
      recordSecurityEvent('super_login_ok', { username, ip, userAgent, zone: 'super' });
      const session = await getSession('super');
      session.user = { id: String(sa._id), username: sa.username, role: 'super_admin', tokenVersion: sa.tokenVersion ?? 0 };
      await session.save();
      await setRouteCookies('super');
      redirect('/super');
    } else {
      // Do'kon foydalanuvchisi — slug'siz kirish: username orqali qaysi do'kon ekanini topamiz.
      // Tartib: 1) global registr (asosiy yo'l), 2) slug (subdomen/legacy zaxira), 3) header zonasi.
      const { Organization } = await getMasterModels();
      const dir = await lookupUser(username);
      const org = dir
        ? await Organization.findById(dir.organizationId).lean()
        : tenantSlug
          ? await resolveTenantOrg(tenantSlug)
          : headerZone === 'tenant'
            ? await resolveTenant()
            : null;
      // Do'kon topilmasa ham "login yoki parol noto'g'ri" — mavjudlikni oshkor qilmaymiz.
      if (!org) {
        recordSecurityEvent('login_fail', { username, ip, userAgent, zone: 'tenant', slug: tenantSlug || undefined, note: "do'kon topilmadi" });
        return { error: e.badCredentials };
      }
      // Suspended — qattiq blok. Muddati tugagan — kiradi, lekin to'lov sahifasiga tushadi.
      if (org.status === 'suspended') return { error: e.storeSuspended };

      const { User } = await getTenantModels(org.dbName);
      const user = await User.findOne({ username }).exec();
      if (!user || !user.active || !(await user.comparePassword(password))) {
        recordSecurityEvent('login_fail', { username, ip, userAgent, zone: 'tenant', slug: org.slug });
        return { error: e.badCredentials };
      }
      clearRateLimit(rlKey);
      recordSecurityEvent('login_ok', { username, ip, userAgent, zone: 'tenant', slug: org.slug });
      // Self-heal: registrda bo'lmagan (migratsiyadan oldingi) login birinchi muvaffaqiyatli
      // kirishda avtomatik qo'shiladi. Boshqa do'konda band bo'lsa — e'tiborsiz.
      if (!dir) {
        try {
          await reserveUsername({
            username: user.username,
            organizationId: String(org._id),
            dbName: org.dbName,
            role: user.role,
            branchId: user.branchId ? String(user.branchId) : undefined,
          });
        } catch {
          /* takror username — registr o'zgarmaydi, sessiya baribir ochiladi */
        }
      }
      const session = await getSession('tenant');
      session.user = {
        id: String(user._id),
        username: user.username,
        role: user.role,
        tokenVersion: user.tokenVersion ?? 0,
        organizationId: String(org._id),
        dbName: org.dbName,
        branchId: user.branchId ? String(user.branchId) : undefined,
      };
      // «Eslab qolish» — faqat do'kon foydalanuvchilari uchun (super admin doim 8 soat)
      const remember = formData.get('remember') === '1';
      if (remember) extendSession(session, 'tenant');
      await session.save();
      await setRouteCookies('tenant', org.slug, remember ? 30 * 24 * 60 * 60 - 60 : undefined);
      if (user.mustChangePassword) redirect('/app/profile?setup=1');
      redirect('/app');
    }
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    return { error: e.server };
  }
  return null;
}

const RESET_CODE_TTL_MS = 15 * 60 * 1000; // 15 daqiqa
const RESET_MAX_ATTEMPTS = 5;

/** Tiklash uchun do'konni topish: global registr → slug → header zaxira */
async function resolveResetOrg(username: string, tenantSlug: string) {
  const dir = await lookupUser(username);
  const { Organization } = await getMasterModels();
  return dir
    ? Organization.findById(dir.organizationId).lean()
    : tenantSlug
      ? resolveTenantOrg(tenantSlug)
      : resolveTenant();
}

/**
 * Parolni tiklash 1-qadam — bir martalik 6 xonali kod (15 daqiqa) do'konning ulangan
 * Telegram'iga yuboriladi. Parol HALI o'zgarmaydi: eski parol kod ishlatilguncha amal qiladi
 * (begona odam "unutdim" bosib egani bloklay olmaydi).
 * Username mavjudligini oshkor qilmaslik uchun har doim bir xil javob qaytaradi.
 */
export async function requestPasswordResetAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const username = String(formData.get('username') || '').trim().toLowerCase();
  const tenantSlug = String(formData.get('tenantSlug') || '').trim() || (await getTenantSlug());
  const { errors: e, reset: r } = (await getDict()).auth;

  if (!username) return { error: e.usernameRequired };

  // Spam himoyasi — 15 daqiqada login bo'yicha 4 ta, IP bo'yicha 10 ta so'rovgacha
  const keys = loginRateKeys(username, clientIpFrom(await headers()), 'reset');
  const rl = hitRateLimit(keys.user, 4);
  const rlIp = hitRateLimit(keys.ip, 10);
  if (!rl.ok || !rlIp.ok) {
    return { error: e.tooManyRequests };
  }

  const next: ResetState = { success: r.codeSent, step: 'code', username };
  recordSecurityEvent('reset_request', { username, ...requestMeta(await headers()), zone: 'tenant', slug: tenantSlug || undefined });

  try {
    const org = await resolveResetOrg(username, tenantSlug);
    if (!org) return next;

    const { User } = await getTenantModels(org.dbName);
    const user = await User.findOne({ username, active: true }).exec();
    if (!user) return next;

    // Kod QAYERGA boradi: avval xodimning SHAXSIY Telegram'i (TelegramAccount), bo'lmasa —
    // faqat admin uchun do'kon chati. Do'kon chatini xodimlar/guruh a'zolari ham ko'rishi
    // mumkin edi — kod u yerga ketsa istalgan a'zo admin hisobini egallay olardi.
    const { TelegramAccount } = await getMasterModels();
    const personal = await TelegramAccount.findOne({ dbName: org.dbName, userId: String(user._id) })
      .select('telegramUserId')
      .lean();
    const personalChat = personal?.telegramUserId ? String(personal.telegramUserId) : '';
    const targetChat = personalChat || (user.role === 'admin' && org.telegramChatId ? String(org.telegramChatId) : '');

    if (!targetChat) {
      // Xodimga shaxsiy Telegram ulanmagan — do'kon egasiga xabar (qo'lda tiklaydi),
      // do'kon ham ulanmagan bo'lsa — super adminga
      const note =
        `<b>Savora — parol tiklash so'rovi</b>\nDo'kon: ${tgEscape(org.name)}\nFoydalanuvchi: <code>${tgEscape(username)}</code>\n` +
        `Shaxsiy Telegram ulanmagan — parolni qo'lda tiklang (Xodimlar bo'limi).`;
      if (org.telegramChatId) await sendTelegramTo(String(org.telegramChatId), note);
      else await sendTelegram(note);
      return next;
    }

    const code = randomNumericCode(6);
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          resetCodeHash: hashToken(`${String(user._id)}:${code}`),
          resetCodeExpiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
          resetAttempts: 0,
        },
      }
    );

    await sendTelegramTo(
      targetChat,
      `<b>Savora — parolni tiklash</b>\n` +
        `Do'kon: ${tgEscape(org.name)}\n` +
        `Login: <code>${tgEscape(username)}</code>\n` +
        `Tasdiqlash kodi: <code>${code}</code> (15 daqiqa amal qiladi)\n\n` +
        `Agar siz so'ramagan bo'lsangiz — e'tibor bermang, parolingiz o'zgarmaydi.`
    );

    return next;
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    return { error: e.server };
  }
}

/**
 * Parolni tiklash 2-qadam — kod + yangi parol. Kod bir martalik, 15 daqiqa, 5 ta noto'g'ri
 * urinishdan keyin bekor bo'ladi. Muvaffaqiyatda eski sessiyalar bekor qilinadi.
 */
export async function confirmPasswordResetAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const username = String(formData.get('username') || '').trim().toLowerCase();
  const tenantSlug = String(formData.get('tenantSlug') || '').trim() || (await getTenantSlug());
  const code = String(formData.get('code') || '').replace(/\s/g, '');
  const newPassword = String(formData.get('newPassword') || '');
  const confirmPassword = String(formData.get('confirmPassword') || '');
  const keep = { step: 'code' as const, username };
  const { errors: e, reset: r } = (await getDict()).auth;

  if (!username) return { error: e.usernameRequired };
  if (!/^\d{6}$/.test(code)) return { ...keep, error: e.codeFormat };
  if (newPassword.length < 6) return { ...keep, error: e.newPasswordShort };
  if (newPassword !== confirmPassword) return { ...keep, error: e.passwordMismatch };

  const keys = loginRateKeys(username, clientIpFrom(await headers()), 'reset-confirm');
  const rl = hitRateLimit(keys.user, 6);
  const rlIp = hitRateLimit(keys.ip, 20);
  if (!rl.ok || !rlIp.ok) {
    return { ...keep, error: e.tooManyAttempts };
  }

  const invalid = { ...keep, error: e.codeInvalid };

  try {
    const org = await resolveResetOrg(username, tenantSlug);
    if (!org || org.status === 'suspended') return invalid;

    const { User } = await getTenantModels(org.dbName);
    const user = await User.findOne({ username, active: true })
      .select('+resetCodeHash +resetCodeExpiresAt +resetAttempts')
      .exec();
    if (!user || !user.resetCodeHash || !user.resetCodeExpiresAt) return invalid;

    if (user.resetCodeExpiresAt.getTime() < Date.now() || (user.resetAttempts ?? 0) >= RESET_MAX_ATTEMPTS) {
      await User.updateOne({ _id: user._id }, { $unset: { resetCodeHash: '', resetCodeExpiresAt: '', resetAttempts: '' } });
      return invalid;
    }

    if (!safeEqual(hashToken(`${String(user._id)}:${code}`), user.resetCodeHash)) {
      await User.updateOne({ _id: user._id }, { $inc: { resetAttempts: 1 } });
      return invalid;
    }

    // Kodni atomik "iste'mol" qilamiz — parallel so'rov bir kodni ikki marta ishlata olmaydi
    const claimed = await User.updateOne(
      { _id: user._id, resetCodeHash: user.resetCodeHash },
      { $unset: { resetCodeHash: '', resetCodeExpiresAt: '', resetAttempts: '' } }
    );
    if (claimed.modifiedCount !== 1) return invalid;

    user.password = newPassword;
    user.mustChangePassword = false;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1; // eski sessiyalarni bekor qiladi
    user.resetCodeHash = undefined;
    user.resetCodeExpiresAt = undefined;
    user.resetAttempts = undefined;
    await user.save();
    clearRateLimit(loginRateKeys(username, '').user);
    recordSecurityEvent('reset_done', { username, ...requestMeta(await headers()), zone: 'tenant', slug: org.slug });

    return { success: r.done, step: 'done' };
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    return { ...keep, error: e.server };
  }
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  await session.destroy();
  await clearRouteCookies();
  redirect(rootUrl('/'));
}
