import { notFound } from 'next/navigation';
import CustomerForm from '@/components/tenant/CustomerForm';
import { getTenantSession } from '@/lib/tenantSession';

export const metadata = { title: 'Mijoz — Savora' };

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { Customer, features } = await getTenantSession();
  const customer = await Customer.findById(id).lean();
  if (!customer) notFound();

  return (
    <CustomerForm
      mode="edit"
      mediaEnabled={features.mediaUpload}
      initial={{
        id: String(customer._id),
        fullName: customer.fullName,
        phone: customer.phone,
        address: customer.address ?? '',
        notes: customer.notes ?? '',
        photoUrl: customer.photoUrl,
      }}
    />
  );
}
