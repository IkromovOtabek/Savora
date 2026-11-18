import { productionCtxFromSession } from '@/lib/production/session';
import { productionMeta } from '@/lib/production/catalog';
import { getRecipe } from '@/lib/production/recipes';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import BackLink from '@/components/ui/BackLink';
import RecipeEditor from '@/components/production/recipes/RecipeEditor';
import RequirementsCalc from '@/components/production/recipes/RequirementsCalc';
import NewOrderButton from '@/components/production/orders/NewOrderButton';
import { qtyText } from '@/components/production/common/ui';
import { pickBranch, productsByCode } from '../../_lib/data';

export async function generateMetadata() {
  return { title: (await getDict()).production.common.recipe };
}

/**
 * Texkarta: muharrir (chap), yon ustunda — taxminiy tannarx (`production.viewCost`), ehtiyoj hisoblagich, versiyalar
 * tarixi. `?b=` — ombor (qidiruv, qoldiq, tannarx).
 */
export default async function RecipePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ b?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ctx = await productionCtxFromSession();
  const d = ctx.d;
  const t = d.production.recipes;
  const units = d.stock.fields.units;
  const meta = await productionMeta(ctx);
  if (!meta.ok) return <p className="t-note t-note--warn" role="alert">{meta.error}</p>;
  const m = meta.data;
  const branchId = pickBranch(sp.b, m.branches, m.defaultBranchId);

  const res = await getRecipe(ctx, id, { branchId });
  if (!res.ok) {
    return (
      <>
        <BackLink href="/app/production/recipes">{t.back}</BackLink>
        <p className="t-note t-note--warn" role="alert">{res.error}</p>
      </>
    );
  }
  const { recipe, cost } = res.data;
  const found = await productsByCode(ctx, [recipe.outputCode, ...recipe.items.map((i) => i.code)], branchId);
  const products = Object.fromEntries(found);
  const branchName = m.branches.find((b) => b.id === branchId)?.name ?? '';

  return (
    <>
      <BackLink href="/app/production/recipes">{t.back}</BackLink>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{recipe.name}</h1>
          <p className="t-page-sub">
            {recipe.outputName} · {qtyText(recipe.outputQty, recipe.unit, units)} · {tr(t.versionShort, { v: recipe.version })}
            {!recipe.active && <> · <span className="t-pill t-pill--warn">{t.archived}</span></>}
          </p>
        </div>
        {m.can.manageProduction && recipe.active && (
          <div className="t-page-actions">
            <NewOrderButton
              recipes={[{ id: recipe.id, name: recipe.name, outputName: recipe.outputName, outputQty: recipe.outputQty, unit: recipe.unit }]}
              branches={m.branches}
              defaultBranchId={m.defaultBranchId}
              scoped={ctx.user.role !== 'admin'}
              initialRecipeId={recipe.id}
              label={t.openOrder}
              tinted
            />
          </div>
        )}
      </div>

      <div className="pr-split">
        <RecipeEditor
          key={recipe.updatedAt ?? String(recipe.version)}
          recipe={recipe}
          products={products}
          branches={m.branches}
          branchId={branchId}
          canManage={m.can.manageRecipes}
        />

        <aside className="pr-side" aria-label={t.requirements}>
          {cost && (
            <section className="pr-card" aria-labelledby="pr-cost-h">
              <div>
                <h2 className="pr-h" id="pr-cost-h">{t.costTitle}</h2>
                <p className="pr-hint">{t.costHint}{m.branches.length > 1 && branchName ? ` · ${branchName}` : ''}</p>
              </div>
              <dl className="pr-kv">
                <div><dt>{d.production.reports.materials}</dt><dd>{fmtMoney(cost.materials)} {d.common.sum}</dd></div>
                <div><dt>{d.production.reports.labor}</dt><dd>{fmtMoney(cost.labor)} {d.common.sum}</dd></div>
                <div><dt>{d.production.reports.overhead}</dt><dd>{fmtMoney(cost.overhead)} {d.common.sum}</dd></div>
                <div className="is-total"><dt>{d.production.common.unitCost}</dt><dd>{fmtMoney(cost.total)} {d.common.sum}</dd></div>
              </dl>
              {cost.missing.length > 0 && <p className="pr-error">{tr(t.costMissing, { n: cost.missing.length })}</p>}
            </section>
          )}

          <RequirementsCalc
            recipeId={recipe.id}
            unit={recipe.unit}
            outputQty={recipe.outputQty}
            branches={m.branches}
            branchId={branchId}
            canReceive={m.features.purchasing && m.can.receive}
            canPurchase={m.features.purchasing && m.can.managePo}
          />

          <section className="pr-card" aria-labelledby="pr-ver-h">
            <h2 className="pr-h" id="pr-ver-h">{t.versions}</h2>
            <ul className="pr-vers">
              <li className="is-cur">
                <span className="pr-vers-n">{tr(t.versionShort, { v: recipe.version })}</span>
                <b>{t.versionCurrent}</b>
                <small>
                  {tr(t.versionLine, { items: recipe.items.length, ops: recipe.operations.length, qty: qtyText(recipe.outputQty, recipe.unit, units) })}
                  {recipe.updatedAt ? ` · ${fmtDateTime(recipe.updatedAt)} · ${recipe.updatedBy ?? recipe.createdBy}` : ''}
                </small>
              </li>
              {(recipe.versions ?? []).map((v) => (
                <li key={v.version}>
                  <span className="pr-vers-n">{tr(t.versionShort, { v: v.version })}</span>
                  <b>{v.changedAt ? fmtDateTime(v.changedAt) : '—'} · {v.changedBy}</b>
                  <small>{tr(t.versionLine, { items: v.items, ops: v.operations, qty: qtyText(v.outputQty, recipe.unit, units) })}</small>
                </li>
              ))}
            </ul>
            {(recipe.versions ?? []).length === 0 && <p className="pr-hint">{t.versionsEmpty}</p>}
          </section>
        </aside>
      </div>
    </>
  );
}
