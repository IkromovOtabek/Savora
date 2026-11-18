import { productionCtxFromSession } from '@/lib/production/session';
import { productionMeta } from '@/lib/production/catalog';
import { getDict } from '@/lib/i18n/server';
import BackLink from '@/components/ui/BackLink';
import RecipeEditor from '@/components/production/recipes/RecipeEditor';
import { pickBranch } from '../../_lib/data';

export async function generateMetadata() {
  return { title: (await getDict()).production.recipes.add };
}

/** Yangi texkarta (`recipe.manage`); `?b=` — mahsulot qidiriladigan ombor */
export default async function NewRecipePage({ searchParams }: { searchParams: Promise<{ b?: string }> }) {
  const sp = await searchParams;
  const ctx = await productionCtxFromSession();
  const t = ctx.d.production.recipes;
  const meta = await productionMeta(ctx);
  if (!meta.ok) return <p className="t-note t-note--warn" role="alert">{meta.error}</p>;
  const m = meta.data;
  const branchId = pickBranch(sp.b, m.branches, m.defaultBranchId);

  return (
    <>
      <BackLink href="/app/production/recipes">{t.back}</BackLink>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{t.add}</h1>
          <p className="t-page-sub">{t.sub}</p>
        </div>
      </div>
      {!m.can.manageRecipes ? (
        <p className="t-note t-note--warn" role="alert">{t.readOnly}</p>
      ) : (
        <div style={{ maxWidth: 920 }}>
          <RecipeEditor recipe={null} products={{}} branches={m.branches} branchId={branchId} canManage />
        </div>
      )}
    </>
  );
}
