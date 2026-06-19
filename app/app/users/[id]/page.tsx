import { notFound } from 'next/navigation';
import { getTenantAdminSession } from '@/lib/tenantSession';
import EmployeeForm from '@/components/tenant/EmployeeForm';

export const metadata = { title: 'Xodim — Savora' };

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { User } = await getTenantAdminSession();
  const u = await User.findById(id).lean();
  if (!u) notFound();

  return (
    <EmployeeForm
      mode="edit"
      initial={{
        id: String(u._id),
        username: u.username,
        fullName: u.fullName ?? '',
        role: u.role,
        active: u.active,
      }}
    />
  );
}
