import { redirect } from 'next/navigation';
import DishForm from '@/components/restaurant/menu/DishForm';
import { restaurantCtxFromSession } from '@/lib/restaurant/session';
import { dishFormData, MENU_ITEM_TYPES, type MenuItemType } from '@/lib/restaurant/menuAdmin';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata() {
  return { title: (await getDict()).menu.form.newTitle };
}

/** Taom qo'shish (?type=goods — ombordagi tovarni menyuga, ?product=<id> — tanlangan tovar; admin — ?branch=<id>) */
export default async function NewDishPage({ searchParams }: { searchParams: Promise<{ branch?: string; type?: string; product?: string }> }) {
  const ctx = await restaurantCtxFromSession();
  if (!ctx.perms.has('product.create') && !ctx.perms.has('product.edit')) redirect('/app/locked?p=product.create');
  const sp = await searchParams;
  const ok = (v?: string) => (typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v) ? v : undefined);
  let r = await dishFormData(ctx, { branchId: ok(sp.branch) });
  if (!r.ok && sp.branch) r = await dishFormData(ctx);
  if (!r.ok) return <p className="t-note t-note--warn" role="alert">{r.error}</p>;
  const type = MENU_ITEM_TYPES.includes(sp.type as MenuItemType) ? (sp.type as MenuItemType) : undefined;
  return (
    <DishForm
      key={r.data.branchId}
      data={r.data}
      initialType={type}
      initialProductId={ok(sp.product)}
      mediaEnabled={!!ctx.features.mediaUpload}
    />
  );
}
