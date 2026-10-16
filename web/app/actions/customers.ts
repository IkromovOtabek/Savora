'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTenantSession } from '@/lib/tenantSession';
import { userCan } from '@/lib/permissionGuard';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';

type State = { error?: string; success?: string } | null;

export async function createCustomerAction(_prev: State, formData: FormData): Promise<State> {
  const { user, Customer } = await getTenantSession();
  const d = await getDict();
  if (!(await userCan(user, 'customers.manage'))) {
    return { error: tr(d.catalog.permissionDeniedNamed, { label: d.catalog.permissions['customers.manage'].label }) };
  }

  const fullName = String(formData.get('fullName') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const address = String(formData.get('address') || '').trim();
  const notes = String(formData.get('notes') || '').trim();
  const photoUrl = String(formData.get('photoUrl') || '').trim();
  const returnTo = String(formData.get('returnTo') || '');

  if (!fullName) return { error: d.crm.customers.errName };
  if (!phone) return { error: d.crm.customers.errPhone };

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
    return { error: d.crm.customers.errCreate };
  }
}

export async function updateCustomerAction(_prev: State, formData: FormData): Promise<State> {
  const { user, Customer } = await getTenantSession();
  const d = await getDict();
  if (!(await userCan(user, 'customers.manage'))) {
    return { error: tr(d.catalog.permissionDeniedNamed, { label: d.catalog.permissions['customers.manage'].label }) };
  }

  const customerId = String(formData.get('customerId') || '');
  const fullName = String(formData.get('fullName') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const address = String(formData.get('address') || '').trim();
  const notes = String(formData.get('notes') || '').trim();
  const photoUrl = String(formData.get('photoUrl') || '').trim();

  if (!customerId || !fullName || !phone) return { error: d.crm.customers.errNameAndPhone };

  const customer = await Customer.findById(customerId);
  if (!customer) return { error: d.crm.customers.errNotFound };

  customer.fullName = fullName;
  customer.phone = phone;
  customer.address = address || undefined;
  customer.notes = notes || undefined;
  customer.photoUrl = photoUrl || undefined;
  await customer.save();

  revalidatePath('/app/customers');
  revalidatePath('/app/sales/new');
  return { success: d.crm.customers.updated };
}
