import { notFound, redirect } from 'next/navigation';
import DishForm from '@/components/restaurant/menu/DishForm';
import { restaurantCtxFromSession } from '@/lib/restaurant/session';
import { dishFormData } from '@/lib/restaurant/menuAdmin';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata() {
  return { title: (await getDict()).menu.form.editTitle };
}

/** Taomni tahrirlash: turi, narx, rasm, stansiya, retsept, MXIK, modifikatorlar (`product.edit`) */
export default async function EditDishPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await restaurantCtxFromSession();
  if (!ctx.perms.has('product.edit')) redirect('/app/locked?p=product.edit');
  const { id } = await params;
  const r = await dishFormData(ctx, { id });
  if (!r.ok) {
    if (r.status === 404) notFound();
    return <p className="t-note t-note--warn" role="alert">{r.error}</p>;
  }
  return <DishForm key={id} data={r.data} mediaEnabled={!!ctx.features.mediaUpload} />;
}
