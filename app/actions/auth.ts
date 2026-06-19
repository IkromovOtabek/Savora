'use server';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getMasterModels } from '@/lib/masterDb';
import { getAppZone, getTenantSlug, resolveTenant } from '@/lib/tenantContext';
import { getTenantModels } from '@/lib/tenantDb';
import { isOrganizationActive } from '@/lib/models/master/Organization';
import { clearRouteCookies, setRouteCookies } from '@/lib/routeCookies';
import { rootUrl } from '@/lib/urls';
import { generateTempPassword } from '@/lib/credentials';
import { sendTelegramTo, sendTelegram } from '@/lib/telegram';

type State = { error?: string } | null;
type ResetState = { error?: string; success?: string } | null;

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
  if (!username || !password) return { error: 'Login va parol kiritilishi shart.' };

  const headerZone = await getAppZone();
  const zone = resolveLoginZone(formData, headerZone);
  const tenantSlug = String(formData.get('tenantSlug') || '').trim() || (await getTenantSlug());

  try {
    if (zone === 'super') {
      const { SuperAdmin } = await getMasterModels();
      const sa = await SuperAdmin.findOne({ username }).exec();
      if (!sa || !(await sa.comparePassword(password))) {
        return { error: "Login yoki parol noto'g'ri." };
      }
      const session = await getSession();
      session.user = { id: String(sa._id), username: sa.username, role: 'super_admin', tokenVersion: sa.tokenVersion ?? 0 };
      await session.save();
      await setRouteCookies('super');
      redirect('/super');
    } else if (zone === 'tenant') {
      const org = tenantSlug
        ? await resolveTenantOrg(tenantSlug)
        : await resolveTenant();
      if (!org) return { error: "Do'kon topilmadi." };
      if (!isOrganizationActive(org)) return { error: "Do'kon obunasi to'xtatilgan yoki muddati tugagan." };

      const { User } = await getTenantModels(org.dbName);
      const user = await User.findOne({ username }).exec();
      if (!user || !user.active || !(await user.comparePassword(password))) {
        return { error: "Login yoki parol noto'g'ri." };
      }
      const session = await getSession();
      session.user = {
        id: String(user._id),
        username: user.username,
        role: user.role,
        tokenVersion: user.tokenVersion ?? 0,
        organizationId: String(org._id),
        dbName: org.dbName,
      };
      await session.save();
      await setRouteCookies('tenant', org.slug);
      if (user.mustChangePassword) redirect('/app/profile?setup=1');
      redirect('/app');
    } else {
      return { error: "Kirish: /super/login (Super Admin) yoki /t/dokon-slug/login (do'kon)." };
    }
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    return { error: 'Server xatosi. Qayta urinib ko\'ring.' };
  }
  return null;
}

/**
 * Parolni tiklash — yangi vaqtinchalik parol do'konning ulangan Telegram'iga yuboriladi.
 * Username mavjudligini oshkor qilmaslik uchun har doim bir xil javob qaytaradi.
 */
export async function requestPasswordResetAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const username = String(formData.get('username') || '').trim().toLowerCase();
  const tenantSlug = String(formData.get('tenantSlug') || '').trim() || (await getTenantSlug());

  const generic =
    'Agar bunday foydalanuvchi mavjud bo\'lsa va do\'kon Telegram\'i ulangan bo\'lsa, yangi vaqtinchalik parol Telegram\'ga yuborildi.';

  if (!username) return { error: 'Login kiritilishi shart.' };

  try {
    const org = tenantSlug ? await resolveTenantOrg(tenantSlug) : await resolveTenant();
    if (!org) return { error: 'Do\'kon topilmadi.' };

    const { User } = await getTenantModels(org.dbName);
    const user = await User.findOne({ username, active: true }).exec();

    // Telegram ulanmagan bo'lsa — super adminga xabar (qo'lda tiklash uchun)
    if (!org.telegramChatId) {
      if (user) {
        await sendTelegram(
          `<b>Savora — parol tiklash so'rovi</b>\nDo'kon: ${org.name}\nFoydalanuvchi: ${username}\nTelegram ulanmagan — qo'lda tiklang.`
        );
      }
      return { success: generic };
    }

    if (user) {
      const tempPassword = generateTempPassword();
      user.password = tempPassword;
      user.mustChangePassword = true;
      user.tokenVersion = (user.tokenVersion ?? 0) + 1; // eski sessiyalarni bekor qiladi
      await user.save();

      await sendTelegramTo(
        org.telegramChatId,
        `<b>Savora — parolni tiklash</b>\n` +
          `Do'kon: ${org.name}\n` +
          `Login: <code>${username}</code>\n` +
          `Yangi vaqtinchalik parol: <code>${tempPassword}</code>\n\n` +
          `Kirgach, tizim parolni o'zgartirishni so'raydi.`
      );
    }

    return { success: generic };
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    return { error: 'Server xatosi. Qayta urinib ko\'ring.' };
  }
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  await session.destroy();
  await clearRouteCookies();
  redirect(rootUrl('/'));
}
