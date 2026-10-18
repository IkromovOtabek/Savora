import { getTenantSession } from '@/lib/tenantSession';
import { ensureFinanceCategories } from '@/lib/financeCategories';
import { toggleFinanceCategoryAction } from '@/app/actions/finance';
import { FinanceCategoryForm } from '@/components/tenant/FinanceForms';
import { getDict } from '@/lib/i18n/server';
import '@/components/tenant/styles/finance.css';

export async function generateMetadata() {
  return { title: (await getDict()).sales.fin.catMeta };
}

export default async function FinanceCategoriesPage() {
  const { FinanceCategory } = await getTenantSession();
  const f = (await getDict()).sales.fin;
  await ensureFinanceCategories(FinanceCategory);
  const cats = await FinanceCategory.find().sort({ type: 1, active: -1, name: 1 }).lean();

  const col = (type: 'expense' | 'income') => (
    <section className="fx-card">
      <h2 className="fx-h">{type === 'expense' ? f.expense : f.income}</h2>
      <ul className="fx-catlist">
        {cats.filter((c) => c.type === type).map((c) => (
          <li key={String(c._id)} className={c.active ? '' : 'is-off'}>
            <span>{c.name}{c.system && <em className="fx-tag">{f.catSystem}</em>}{!c.active && <em className="fx-tag">{f.catOff}</em>}</span>
            {!c.system && (
              <form action={toggleFinanceCategoryAction}>
                <input type="hidden" name="categoryId" value={String(c._id)} />
                <input type="hidden" name="active" value={c.active ? '0' : '1'} />
                <button type="submit" className="btn btn-sm btn-ghost">{c.active ? f.catDisable : f.catEnable}</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{f.catTitle}</h1>
          <p className="t-page-sub">{f.catSub}</p>
        </div>
      </div>
      <div className="fx-card fx-add"><FinanceCategoryForm /></div>
      <div className="fx-catgrid">
        {col('expense')}
        {col('income')}
      </div>
    </>
  );
}
