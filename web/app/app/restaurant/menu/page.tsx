import { menuEditorView, settingsPageContext } from '@/lib/restaurant/settingsExtra';
import BranchPicker from '@/components/restaurant/settings/BranchPicker';
import MenuEditor from '@/components/restaurant/settings/MenuEditor';

/** Restoran sozlamalari → Menyu: stansiya, modifikatorlar, MXIK, stop-list (admin — ?branch=<id>) */
export default async function RestaurantMenuPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const sp = await searchParams;
  const { ctx } = await settingsPageContext();
  const r = await menuEditorView(ctx, { branchId: sp.branch || undefined });
  if (!r.ok) return <p className="t-note t-note--warn" role="alert">{r.error}</p>;
  return (
    <>
      <BranchPicker branches={r.data.branches} value={r.data.branchId} />
      <MenuEditor
        key={r.data.branchId}
        view={r.data}
        canEdit={ctx.perms.has('product.edit')}
        canStop={ctx.perms.has('menu.stopList')}
      />
    </>
  );
}
