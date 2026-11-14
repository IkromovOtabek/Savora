import { getTenantSession } from '@/lib/tenantSession';
import { ensureFinanceCategories } from '@/lib/financeCategories';
import { toggleFinanceCategoryAction, toggleFinanceCategoryProfitAction } from '@/app/actions/finance';
import { categoryInProfit } from '@/lib/models/tenant/FinanceCategory';
import { FinanceCategoryEdit, FinanceCategoryForm } from '@/components/tenant/FinanceForms';
import { getDict } from '@/lib/i18n/server';
import FinanceTabs from '@/components/tenant/FinanceTabs';
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
        {cats.filter((c) => c.type === type).map((c) => {
          const inProfit = categoryInProfit(c);
          return (
            <li key={String(c._id)} className={c.active ? '' : 'is-off'}>
              <span>
                {c.name}
                {c.system && <em className="fx-tag">{f.catSystem}</em>}
                {!c.active && <em className="fx-tag">{f.catOff}</em>}
                {!inProfit && <em className="fx-tag">{f.catNotInProfit}</em>}
              </span>
              {!c.system && (
                <span className="fx-cat-acts">
                  <form action={toggleFinanceCategoryProfitAction}>
                    <input type="hidden" name="categoryId" value={String(c._id)} />
                    <input type="hidden" name="inProfit" value={inProfit ? '0' : '1'} />
                    <button type="submit" className="btn btn-sm btn-ghost">{inProfit ? f.catProfitOff : f.catProfitOn}</button>
                  </form>
                  {/* Yashirish — savatcha ikonkasi orqali (yozuvi bor toifa yashiriladi); bu yerda faqat qayta yoqish */}
                  {!c.active && (
                    <form action={toggleFinanceCategoryAction}>
                      <input type="hidden" name="categoryId" value={String(c._id)} />
                      <input type="hidden" name="active" value="1" />
                      <button type="submit" className="btn btn-sm btn-ghost">{f.catEnable}</button>
                    </form>
                  )}
                  {/* O'ng tomonda: tahrirlash va o'chirish (yozuvi bor toifa — yashiriladi) */}
                  <FinanceCategoryEdit name={c.name} type={c.type} />
                </span>
              )}
            </li>
          );
        })}
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
      <FinanceTabs current="cat" />
      <div className="fx-card fx-add"><FinanceCategoryForm /></div>
      <div className="fx-catgrid">
        {col('expense')}
        {col('income')}
      </div>
    </>
  );
}
