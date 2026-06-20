import { redirect } from 'next/navigation';
import { getAppZone } from '@/lib/tenantContext';
import { getCurrentUser } from '@/lib/auth';
import { getPlanPresetEffective } from '@/lib/platformSettings';
import type { PlanPreset } from '@/lib/plans';
import RegisterForm from './RegisterForm';

export const metadata = { title: 'Ro\'yxatdan o\'tish — Savora' };

// Signup'da tanlanadigan ommaviy tariflar (kelishuv tarifi faqat super admin uchun)
const PUBLIC_TIERS = ['free', 'starter', 'pro', 'business'] as const;

export default async function RegisterPage() {
  const zone = await getAppZone();
  if (zone !== 'root') redirect('/login');

  const user = await getCurrentUser();
  if (user) redirect(user.role === 'super_admin' ? '/super' : '/app');

  // Super admin narxlarni o'zgartirgan bo'lsa — shu yerda ko'rinadi
  const plans: PlanPreset[] = await Promise.all(PUBLIC_TIERS.map((t) => getPlanPresetEffective(t)));

  return <RegisterForm plans={plans} />;
}
