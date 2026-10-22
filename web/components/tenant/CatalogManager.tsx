'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons/Icon';
import { toast } from '@/lib/toast';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { flattenCategories, categorySubtreeIds, type CategoryItem } from '@/lib/productCatalog';
import { createBrandAction, createCategoryAction } from '@/app/actions/products';
import {
  deleteBrandAction,
  deleteCategoryAction,
  moveCategoryAction,
  renameBrandAction,
  renameCategoryAction,
} from '@/app/actions/catalog';

type Cat = CategoryItem & { count: number };
type BrandRow = { id: string; name: string; count: number };
type Mode = { id: string; kind: 'rename' | 'move' } | null;
type Res = { ok: true } | { ok: false; error: string };

export default function CatalogManager({ categories, brands }: { categories: Cat[]; brands: BrandRow[] }) {
  const d = useDict();
  const t = d.stock.catalog;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<Mode>(null);
  const [draft, setDraft] = useState('');
  const [newCat, setNewCat] = useState('');
  const [newCatParent, setNewCatParent] = useState('');
  const [newBrand, setNewBrand] = useState('');

  const tree = useMemo(() => flattenCategories(categories), [categories]);
  const countOf = useMemo(() => new Map(categories.map((c) => [c.id, c.count])), [categories]);
  const parentOf = useMemo(() => new Map(categories.map((c) => [c.id, c.parentId ?? ''])), [categories]);

  /** Amalni bajarib, natijani xabarnoma bilan ko'rsatadi; muvaffaqiyatda ro'yxat yangilanadi */
  function run(fn: () => Promise<Res>, okMsg: string, after?: () => void) {
    start(async () => {
      const res = await fn();
      if (!res.ok) { toast(res.error, 'error'); return; }
      toast(okMsg);
      setMode(null);
      after?.();
      router.refresh();
    });
  }

  function open(id: string, kind: 'rename' | 'move', initial: string) {
    setMode({ id, kind });
    setDraft(initial);
  }

  const editing = (id: string, kind: 'rename' | 'move') => mode?.id === id && mode.kind === kind;

  return (
    <div className="cat-grid">
      <section className="cat-card" aria-labelledby="cat-h-cats">
        <h2 id="cat-h-cats" className="cat-h">{t.categories} <span className="cat-n">{categories.length}</span></h2>
        <form
          className="cat-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newCat.trim()) return;
            run(async () => {
              const r = await createCategoryAction(newCat, newCatParent || null);
              return r.ok ? { ok: true } : r;
            }, t.saved, () => setNewCat(''));
          }}
        >
          <input className="input" value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder={d.stock.form.newCategoryPlaceholder} aria-label={t.addCategory} maxLength={60} disabled={pending} />
          <select className="input" value={newCatParent} onChange={(e) => setNewCatParent(e.target.value)} aria-label={t.moveTo} disabled={pending}>
            <option value="">{t.root}</option>
            {tree.map((c) => <option key={c.id} value={c.id}>{c.path}</option>)}
          </select>
          <button type="submit" className="btn btn-primary btn-with-icon" disabled={pending || !newCat.trim()}>
            <Icon name="plus" size={16} /> {t.add}
          </button>
        </form>

        {tree.length === 0 ? <p className="cat-empty">{t.emptyCategories}</p> : (
          <ul className="cat-list">
            {tree.map((c) => {
              const n = countOf.get(c.id) ?? 0;
              const blocked = categorySubtreeIds(categories, c.id);
              return (
                <li key={c.id} className="cat-row" style={{ paddingInlineStart: 12 + c.depth * 22 }}>
                  {editing(c.id, 'rename') ? (
                    <form className="cat-inline" onSubmit={(e) => { e.preventDefault(); run(() => renameCategoryAction(c.id, draft), t.saved); }}>
                      <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus maxLength={60} aria-label={t.rename} disabled={pending} />
                      <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{t.save}</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode(null)}>{t.cancel}</button>
                    </form>
                  ) : editing(c.id, 'move') ? (
                    <form className="cat-inline" onSubmit={(e) => { e.preventDefault(); run(() => moveCategoryAction(c.id, draft || null), t.saved); }}>
                      <b className="cat-name">{c.name}</b>
                      <select className="input" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus aria-label={t.moveTo} disabled={pending}>
                        <option value="">{t.root}</option>
                        {/* O'zi va o'z ichidagi turkumlarga ko'chirib bo'lmaydi */}
                        {tree.filter((o) => !blocked.has(o.id)).map((o) => <option key={o.id} value={o.id}>{o.path}</option>)}
                      </select>
                      <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{t.save}</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode(null)}>{t.cancel}</button>
                    </form>
                  ) : (
                    <>
                      <span className="cat-main">
                        {c.depth > 0 && <span className="cat-branch" aria-hidden="true" />}
                        <b className="cat-name">{c.name}</b>
                        <small className="cat-count">{tr(t.products, { n })}</small>
                      </span>
                      <span className="cat-actions">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => open(c.id, 'rename', c.name)} title={t.rename} aria-label={`${t.rename}: ${c.name}`}>
                          <Icon name="edit" size={15} />
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => open(c.id, 'move', parentOf.get(c.id) ?? '')} title={t.move} aria-label={`${t.move}: ${c.name}`}>
                          <Icon name="repeat" size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          title={t.remove}
                          aria-label={`${t.remove}: ${c.name}`}
                          disabled={pending}
                          onClick={() => { if (confirm(tr(t.confirmDeleteCategory, { name: c.name, n }))) run(() => deleteCategoryAction(c.id), t.deleted); }}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </span>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="cat-card" aria-labelledby="cat-h-brands">
        <h2 id="cat-h-brands" className="cat-h">{t.brands} <span className="cat-n">{brands.length}</span></h2>
        <form
          className="cat-add cat-add--brand"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newBrand.trim()) return;
            run(async () => {
              const r = await createBrandAction(newBrand);
              return r.ok ? { ok: true } : r;
            }, t.saved, () => setNewBrand(''));
          }}
        >
          <input className="input" value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder={d.stock.form.newBrandPlaceholder} aria-label={t.addBrand} maxLength={60} disabled={pending} />
          <button type="submit" className="btn btn-primary btn-with-icon" disabled={pending || !newBrand.trim()}>
            <Icon name="plus" size={16} /> {t.add}
          </button>
        </form>

        {brands.length === 0 ? <p className="cat-empty">{t.emptyBrands}</p> : (
          <ul className="cat-list">
            {brands.map((b) => (
              <li key={b.id} className="cat-row">
                {editing(b.id, 'rename') ? (
                  <form className="cat-inline" onSubmit={(e) => { e.preventDefault(); run(() => renameBrandAction(b.id, draft), t.saved); }}>
                    <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus maxLength={60} aria-label={t.rename} disabled={pending} />
                    <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{t.save}</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode(null)}>{t.cancel}</button>
                  </form>
                ) : (
                  <>
                    <span className="cat-main">
                      <b className="cat-name">{b.name}</b>
                      <small className="cat-count">{tr(t.products, { n: b.count })}</small>
                    </span>
                    <span className="cat-actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => open(b.id, 'rename', b.name)} title={t.rename} aria-label={`${t.rename}: ${b.name}`}>
                        <Icon name="edit" size={15} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        title={t.remove}
                        aria-label={`${t.remove}: ${b.name}`}
                        disabled={pending}
                        onClick={() => { if (confirm(tr(t.confirmDeleteBrand, { name: b.name }))) run(() => deleteBrandAction(b.id), t.deleted); }}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
