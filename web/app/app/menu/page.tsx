import { redirect } from 'next/navigation';
import MenuBoard from '@/components/restaurant/menu/MenuBoard';
import MenuAddActions from '@/components/restaurant/menu/MenuAddActions';
import { restaurantCtxFromSession } from '@/lib/restaurant/session';
import { menuAdminView } from '@/lib/restaurant/menuAdmin';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata() {
  return { title: (await getDict()).menu.title };
}

const VIEW_PERMS = ['product.create', 'product.edit', 'menu.stopList'] as const;

/** Menyu: taomlar (retsept, porsiya, tannarx), tayyor tovarlar va xizmatlar — admin uchun ?branch=<id>; ?section=bar — Bar bo'limi */
export default async function MenuPage({ searchParams }: { searchParams: Promise<{ branch?: string; section?: string }> }) {
  const ctx = await restaurantCtxFromSession();
  if (!VIEW_PERMS.some((k) => ctx.perms.has(k))) redirect('/app/locked?p=product.edit');
  const sp = await searchParams;
  const branch = typeof sp.branch === 'string' && /^[a-f0-9]{24}$/i.test(sp.branch) ? sp.branch : undefined;
  let r = await menuAdminView(ctx, { branchId: branch });
  // Eskirgan/boshqa filial havolasi — standart filial
  if (!r.ok && branch) r = await menuAdminView(ctx);
  const t = ctx.d.menu;
  if (!r.ok) return <p className="t-note t-note--warn" role="alert">{r.error}</p>;
  const v = r.data;
  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{t.title}</h1>
          <p className="t-page-sub">{t.sub}</p>
        </div>
        <MenuAddActions branchId={v.branches.length > 1 ? v.branchId : null} canCreate={v.can.create} canEdit={v.can.edit} barMenu={v.barMenu} />
      </div>
      <MenuBoard key={v.branchId} view={v} section={v.barMenu && sp.section === 'bar' ? 'bar' : 'kitchen'} />
    </>
  );
}
