'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTenantSession } from '@/lib/tenantSession';
import { recordAudit } from '@/lib/audit';
import { userCan } from '@/lib/permissionGuard';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { isOwnUploadUrl } from '@/lib/fileUrl';
import { z } from 'zod';
import { formToObject, parseInput, zId, zText } from '@/lib/validation';
import { canonicalPhone } from '@/lib/phone';

/** Mijoz maydonlari — majburiylik xabarlari action ichida (eski tartib saqlanadi) */
const customerFields = (tooLong: string) => z.object({
  fullName: zText(120, tooLong),
  phone: zText(40, tooLong),
  address: zText(200, tooLong),
  notes: zText(1000, tooLong),
  photoUrl: zText(500, tooLong),
  returnTo: zText(20, tooLong),
});

type State = { error?: string; success?: string } | null;

export async function createCustomerAction(_prev: State, formData: FormData): Promise<State> {
  const { user, features, Customer } = await getTenantSession();
  const d = await getDict();
  if (!(await userCan(user, 'customers.manage'))) {
    return { error: tr(d.catalog.permissionDeniedNamed, { label: d.catalog.permissions['customers.manage'].label }) };
  }

  const parsed = parseInput(customerFields(d.common.tooLong), formToObject(formData), d.common.invalidInput);
  if (!parsed.ok) return { error: parsed.error };
  const { fullName, phone, address, notes, photoUrl, returnTo } = parsed.data;
  if (photoUrl) {
    // Tashqi/`javascript:` havola saqlanmasin; rasm — faqat mediaUpload modulida
    if (!features.mediaUpload) return { error: tr(d.crm.featureDisabled, { label: d.catalog.features.mediaUpload.label }) };
    if (!isOwnUploadUrl(photoUrl)) return { error: d.crm.customers.errPhotoUrl };
  }

  if (!fullName) return { error: d.crm.customers.errName };
  if (!phone) return { error: d.crm.customers.errPhone };

  try {
    const customer = await Customer.create({
      fullName,
      phone: canonicalPhone(phone),
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
  const { user, features, Customer } = await getTenantSession();
  const d = await getDict();
  if (!(await userCan(user, 'customers.manage'))) {
    return { error: tr(d.catalog.permissionDeniedNamed, { label: d.catalog.permissions['customers.manage'].label }) };
  }

  const parsed = parseInput(
    customerFields(d.common.tooLong).extend({ customerId: zId(d.crm.customers.errNotFound) }),
    formToObject(formData),
    d.common.invalidInput,
  );
  if (!parsed.ok) return { error: parsed.error };
  const { customerId, fullName, phone, address, notes, photoUrl } = parsed.data;
  if (photoUrl) {
    // Tashqi/`javascript:` havola saqlanmasin; rasm — faqat mediaUpload modulida
    if (!features.mediaUpload) return { error: tr(d.crm.featureDisabled, { label: d.catalog.features.mediaUpload.label }) };
    if (!isOwnUploadUrl(photoUrl)) return { error: d.crm.customers.errPhotoUrl };
  }

  if (!customerId || !fullName || !phone) return { error: d.crm.customers.errNameAndPhone };

  const customer = await Customer.findById(customerId);
  if (!customer) return { error: d.crm.customers.errNotFound };

  customer.fullName = fullName;
  customer.phone = canonicalPhone(phone);
  customer.address = address || undefined;
  customer.notes = notes || undefined;
  customer.photoUrl = photoUrl || undefined;
  await customer.save();

  revalidatePath('/app/customers');
  revalidatePath('/app/sales/new');
  return { success: d.crm.customers.updated };
}

/**
 * Mijozni o'chirish — faqat do'kon egasi va faqat tarixsiz mijoz (sotuv, daftar, bron yo'q):
 * masalan, xato kiritilgan yozuv. Tarixi bor mijoz o'chirilmaydi — sotuvlar va akt-sverka unga bog'langan.
 */
export async function deleteCustomerAction(_prev: State, formData: FormData): Promise<State> {
  const { user, Customer, Sale, LedgerEntry, Reservation } = await getTenantSession();
  const d = await getDict();
  const t = d.crm.customers.deleteBox;
  if (user.role !== 'admin') return { error: t.ownerOnly };
  const parsed = parseInput(zId(d.crm.customers.errNotFound), formData.get('customerId'));
  if (!parsed.ok) return { error: parsed.error };
  const id = parsed.data;

  const [hasSales, hasLedger, hasReservations] = await Promise.all([
    Sale.exists({ customerId: id }),
    LedgerEntry.exists({ customerId: id }),
    Reservation.exists({ customerId: id }),
  ]);
  if (hasSales || hasLedger || hasReservations) return { error: t.blocked };

  const removed = await Customer.findOneAndDelete({ _id: id }).lean();
  if (!removed) return { error: d.crm.customers.errNotFound };
  await recordAudit(user, {
    action: 'customer.delete',
    entity: 'customer',
    entityId: id,
    summary: `Mijoz o'chirildi: ${removed.fullName}${removed.phone ? ` (${removed.phone})` : ''}`,
  });
  revalidatePath('/app/customers');
  redirect('/app/customers');
}
