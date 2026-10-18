'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTenantSession } from '@/lib/tenantSession';
import { checkPermission } from '@/lib/permissionGuard';
import { recordAudit } from '@/lib/audit';
import { logError } from '@/lib/logger';
import { loadSupplierBalances } from '@/lib/suppliers';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { z } from 'zod';
import { formToObject, parseInput, zId, zMoney, zOneOf, zReqText, zText } from '@/lib/validation';
import { softDeleteOne } from '@/lib/softDelete';

type State = { error?: string; success?: string } | null;
type Dict = Awaited<ReturnType<typeof getDict>>;

function supplierFieldsSchema(d: Dict) {
  const m = d.stock.suppliers.msg;
  return z.object({
    name: zReqText(120, m.nameRequired, d.common.tooLong),
    phone: zText(40, d.common.tooLong),
    company: zText(120, d.common.tooLong),
    notes: zText(500, d.common.tooLong),
  });
}

export async function createSupplierAction(_prev: State, formData: FormData): Promise<State> {
  const { user, Supplier } = await getTenantSession();
  { const denied = await checkPermission(user, 'suppliers.manage'); if (denied) return denied; }
  const d = await getDict();
  const m = d.stock.suppliers.msg;
  const parsed = parseInput(supplierFieldsSchema(d), formToObject(formData), d.common.invalidInput);
  if (!parsed.ok) return { error: parsed.error };
  const f = parsed.data;

  try {
    const s = await Supplier.create({
      name: f.name,
      phone: f.phone || undefined,
      company: f.company || undefined,
      notes: f.notes || undefined,
      createdBy: user.username,
    });
    await recordAudit(user, { action: 'supplier.create', entity: 'supplier', entityId: String(s._id), summary: `Yetkazib beruvchi qo'shildi: ${f.name}` });
    revalidatePath('/app/suppliers');
    redirect(`/app/suppliers/${s._id}`);
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    logError('createSupplierAction failed', err, { user: user.username, dbName: user.dbName });
    return { error: m.failed };
  }
}

export async function updateSupplierAction(_prev: State, formData: FormData): Promise<State> {
  const { user, Supplier } = await getTenantSession();
  { const denied = await checkPermission(user, 'suppliers.manage'); if (denied) return denied; }
  const d = await getDict();
  const m = d.stock.suppliers.msg;
  const parsed = parseInput(supplierFieldsSchema(d).extend({ supplierId: zId(m.notFound) }), formToObject(formData), d.common.invalidInput);
  if (!parsed.ok) return { error: parsed.error };
  const { supplierId: id, ...f } = parsed.data;

  const res = await Supplier.updateOne(
    { _id: id },
    {
      $set: { name: f.name, phone: f.phone || undefined, company: f.company || undefined, notes: f.notes || undefined },
    }
  );
  if (res.matchedCount === 0) return { error: m.notFound };

  revalidatePath('/app/suppliers');
  revalidatePath(`/app/suppliers/${id}`);
  return { success: m.updated };
}

export async function deleteSupplierAction(_prev: State, formData: FormData): Promise<State> {
  const { user, Supplier, SupplierEntry, Product } = await getTenantSession();
  { const denied = await checkPermission(user, 'suppliers.manage'); if (denied) return denied; }
  const m = (await getDict()).stock.suppliers.msg;

  const parsed = parseInput(zId(m.notFound), formData.get('supplierId'));
  if (!parsed.ok) return { error: parsed.error };
  const id = parsed.data;

  // Hisob-kitob tarixi yoki mahsuloti bor yetkazib beruvchi o'chirilmaydi (tarix yo'qolmasin)
  const [hasEntries, hasProducts] = await Promise.all([
    SupplierEntry.exists({ supplierId: id }),
    Product.exists({ supplierId: id }),
  ]);
  if (hasEntries || hasProducts) return { error: m.deleteBlocked };

  const s = await softDeleteOne(Supplier, { _id: id }, user.username);
  if (!s) return { error: m.notFound };
  await recordAudit(user, { action: 'supplier.delete', entity: 'supplier', entityId: id, summary: `Yetkazib beruvchi o'chirildi: ${s.name}` });

  revalidatePath('/app/suppliers');
  redirect('/app/suppliers');
}

export async function addSupplierEntryAction(_prev: State, formData: FormData): Promise<State> {
  const { user, Supplier, SupplierEntry } = await getTenantSession();
  { const denied = await checkPermission(user, 'suppliers.manage'); if (denied) return denied; }
  const d = await getDict();
  const m = d.stock.suppliers.msg;
  const parsed = parseInput(z.object({
    supplierId: zId(m.notFound),
    type: zOneOf(['purchase', 'payment'] as const, m.badType),
    amount: zMoney(m.badAmount, { min: 1 }),
    note: zText(300, d.common.tooLong),
  }), formToObject(formData), m.badAmount);
  if (!parsed.ok) return { error: parsed.error };
  const { supplierId: id, type, amount, note } = parsed.data;

  const supplier = await Supplier.findById(id).lean();
  if (!supplier) return { error: m.notFound };

  if (type === 'payment') {
    const debt = (await loadSupplierBalances(SupplierEntry, [supplier._id])).get(id)?.debt ?? 0;
    if (amount > debt) return { error: tr(m.overpay, { sum: Math.max(0, debt).toLocaleString('uz-UZ') }) };
  }

  try {
    const e = await SupplierEntry.create({ supplierId: supplier._id, type, amount, note: note || undefined, at: new Date(), by: user.username });
    await recordAudit(user, {
      action: type === 'purchase' ? 'supplier.purchase' : 'supplier.payment',
      entity: 'supplier',
      entityId: id,
      summary: `${supplier.name}: ${type === 'purchase' ? 'tovar olindi' : "to'lov qilindi"} · ${amount.toLocaleString('uz-UZ')} so'm`,
      meta: { entryId: String(e._id), amount, note },
    });
  } catch (err) {
    logError('addSupplierEntryAction failed', err, { user: user.username, dbName: user.dbName });
    return { error: m.failed };
  }

  revalidatePath('/app/suppliers');
  revalidatePath(`/app/suppliers/${id}`);
  return { success: m.entryAdded };
}

export async function deleteSupplierEntryAction(_prev: State, formData: FormData): Promise<State> {
  const { user, Supplier, SupplierEntry } = await getTenantSession();
  { const denied = await checkPermission(user, 'suppliers.manage'); if (denied) return denied; }
  const m = (await getDict()).stock.suppliers.msg;

  const parsed = parseInput(zId(m.entryNotFound), formData.get('entryId'));
  if (!parsed.ok) return { error: parsed.error };
  const entryId = parsed.data;

  const e = await softDeleteOne(SupplierEntry, { _id: entryId }, user.username);
  if (!e) return { error: m.entryNotFound };
  const supplier = await Supplier.findById(e.supplierId, { name: 1 }).lean();
  await recordAudit(user, {
    action: 'supplier.entryDelete',
    entity: 'supplier',
    entityId: String(e.supplierId),
    summary: `${supplier?.name ?? '—'}: yozuv o'chirildi (${e.type === 'purchase' ? 'tovar' : "to'lov"} · ${e.amount.toLocaleString('uz-UZ')} so'm)`,
    meta: { type: e.type, amount: e.amount, note: e.note, at: e.at },
  });

  revalidatePath('/app/suppliers');
  revalidatePath(`/app/suppliers/${e.supplierId}`);
  return { success: m.entryDeleted };
}
