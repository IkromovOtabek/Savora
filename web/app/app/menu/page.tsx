import Link from 'next/link';
import { redirect } from 'next/navigation';
import Icon from '@/components/icons/Icon';
import MenuBoard from '@/components/restaurant/menu/MenuBoard';
import { restaurantCtxFromSession } from '@/lib/restaurant/session';
import { menuAdminView } from '@/lib/restaurant/menuAdmin';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata() {
  return { title: (await getDict()).menu.title };
}

const VIEW_PERMS = ['product.create', 'product.edit', 'menu.stopList'] as const;

/** Menyu: taomlar (retsept, porsiya, tannarx), tayyor tovarlar va xizmatlar — admin uchun ?branch=<id> */
export default async function MenuPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
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
  const branchQ = v.branches.length > 1 ? `branch=${v.branchId}` : '';
  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{t.title}</h1>
          <p className="t-page-sub">{t.sub}</p>
        </div>
        <div className="t-page-actions mn-head-actions">
          {v.can.edit && (
            <Link href={`/app/menu/new?type=goods${branchQ ? `&${branchQ}` : ''}`} className="btn btn-tinted btn-with-icon">
              <Icon name="box" size={18} /> {t.addGoods}
            </Link>
          )}
          {v.can.create && (
            <Link href={`/app/menu/new${branchQ ? `?${branchQ}` : ''}`} className="btn btn-primary btn-with-icon">
              <Icon name="plus" size={18} /> {t.addDish}
            </Link>
          )}
        </div>
      </div>
      <MenuBoard key={v.branchId} view={v} />
    </>
  );
}
