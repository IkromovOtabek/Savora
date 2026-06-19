import { redirect } from 'next/navigation';
import { getAppZone } from '@/lib/tenantContext';
import { getCurrentUser } from '@/lib/auth';
import RegisterForm from './RegisterForm';

export const metadata = { title: 'Ro\'yxatdan o\'tish — Savora' };

export default async function RegisterPage() {
  const zone = await getAppZone();
  if (zone !== 'root') redirect('/login');

  const user = await getCurrentUser();
  if (user) redirect(user.role === 'super_admin' ? '/super' : '/app');

  return <RegisterForm />;
}
