'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTenantSession } from '@/lib/tenantSession';

type State = { error?: string; success?: string } | null;

export async function createCustomerAction(_prev: State, formData: FormData): Promise<State> {
  const { Customer } = await getTenantSession();

  const fullName = String(formData.get('fullName') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const address = String(formData.get('address') || '').trim();
  const notes = String(formData.get('notes') || '').trim();
  const photoUrl = String(formData.get('photoUrl') || '').trim();
  const returnTo = String(formData.get('returnTo') || '');

  if (!fullName) return { error: 'Mijoz ismi kiritilishi shart.' };
  if (!phone) return { error: 'Telefon raqami kiritilishi shart.' };

  try {
    const customer = await Customer.create({
      fullName,
      phone,
      address: address || undefined,
      notes: notes || undefined,
      photoUrl: photoUrl || undefined,
    });
    revalidatePath('/app/customers');
    revalidatePath('/app/sales/new');
    if (returnTo === 'sale') redirect(`/app/sales/new?customer=${customer._id}`);
    redirect('/app/customers?created=1');
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    return { error: 'Mijoz yaratishda xatolik.' };
  }
}

export async function updateCustomerAction(_prev: State, formData: FormData): Promise<State> {
  const { Customer } = await getTenantSession();

  const customerId = String(formData.get('customerId') || '');
  const fullName = String(formData.get('fullName') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const address = String(formData.get('address') || '').trim();
  const notes = String(formData.get('notes') || '').trim();
  const photoUrl = String(formData.get('photoUrl') || '').trim();

  if (!customerId || !fullName || !phone) return { error: 'Ism va telefon majburiy.' };

  const customer = await Customer.findById(customerId);
  if (!customer) return { error: 'Mijoz topilmadi.' };

  customer.fullName = fullName;
  customer.phone = phone;
  customer.address = address || undefined;
  customer.notes = notes || undefined;
  customer.photoUrl = photoUrl || undefined;
  await customer.save();

  revalidatePath('/app/customers');
  revalidatePath('/app/sales/new');
  return { success: 'Mijoz yangilandi.' };
}
