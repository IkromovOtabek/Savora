import { redirect } from 'next/navigation';
import { getAppZone } from '@/lib/tenantContext';
import { getCurrentUser } from '@/lib/auth';
import { getPlanPresetEffective } from '@/lib/platformSettings';
import type { PlanPreset } from '@/lib/plans';
import { getDict } from '@/lib/i18n/server';
import RegisterForm from './RegisterForm';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.auth.register.metaTitle };
}

// Signup'da tanlanadigan ommaviy tariflar (kelishuv tarifi faqat super admin uchun)
const PUBLIC_TIERS = ['free', 'starter', 'pro', 'business'] as const;

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  // Mobil ilovadan ochilgan: faqat bepul tarif (App Store qoidasi — ilova orqali pullik tarif ko'rsatilmaydi)
  const fromApp = (await searchParams).from === 'app';
  const zone = await getAppZone();
  if (zone !== 'root') redirect('/login');

  const user = await getCurrentUser();
  if (user) redirect(user.role === 'super_admin' ? '/super' : '/app');

  // Super admin narxlarni o'zgartirgan bo'lsa — shu yerda ko'rinadi
  const plans: PlanPreset[] = await Promise.all((fromApp ? (['free'] as const) : PUBLIC_TIERS).map((t) => getPlanPresetEffective(t)));

  return <RegisterForm plans={plans} fromApp={fromApp} />;
}
