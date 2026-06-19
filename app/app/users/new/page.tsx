import EmployeeForm from '@/components/tenant/EmployeeForm';

export const metadata = { title: 'Yangi foydalanuvchi — Savora' };

export default function NewUserPage() {
  return <EmployeeForm mode="create" />;
}
