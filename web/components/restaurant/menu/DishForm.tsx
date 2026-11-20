'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon, { type IconName } from '@/components/icons/Icon';
import BackLink from '@/components/ui/BackLink';
import ImageUploadField from '@/components/ui/ImageUploadField';
import PriceInput from '@/components/ui/PriceInput';
import SegmentSwitch from '@/components/ui/SegmentSwitch';
import SelectAdd from '@/components/ui/SelectAdd';
import LabelPrint from '@/components/tenant/labels/LabelPrint';
import MxikField from '@/components/tenant/MxikField';
import ModifierGroupsEditor, { toDraft, validateGroups, type DraftGroup } from '@/components/restaurant/settings/ModifierGroupsEditor';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { fmtQty } from '@/lib/qty';
import { fmtMoney } from '@/lib/format';
import { toast } from '@/lib/toast';
import { parseMxikInput } from '@/lib/mxik';
import { flattenCategories, LEGACY_CATEGORY_VALUE } from '@/lib/productCatalog';
import type { DishFormData, MenuItemType, StockOption } from '@/lib/restaurant/menuAdmin';
import type { MenuSection } from '@/lib/restaurant/types';
import { createCategoryAction } from '@/app/actions/products';
import { saveMenuDishAction } from '@/app/actions/menu';
import RecipeEditor, { rowBaseQty, toRecipeRows, type RecipeRow } from './RecipeEditor';

const TYPE_ORDER: MenuItemType[] = ['dish', 'goods', 'service'];
const TYPE_ICON: Record<MenuItemType, IconName> = { dish: 'utensils', goods: 'box', service: 'sparkles' };

interface Props {
  data: DishFormData;
  /** Yangi forma: boshlang'ich tur (?type=goods) va tanlangan ombor tovari (?product=) */
  initialType?: MenuItemType;
  initialProductId?: string;
  /** Yangi forma: bo'lim (?section=bar — Bar bo'limidan ochilgan) */
  initialSection?: MenuSection;
  /** «Rasm/kamera» moduli */
  mediaEnabled: boolean;
}

/**
 * Taom qo'shish/tahrirlash (/app/menu/new, /app/menu/<id>): bo'lim (Taomlar / Bar), turi (Taom retsept bilan /
 * Tayyor tovar / Xizmat), nom, kategoriya (shu yerda yangisi), narx, rasm, stansiya, barkod (bar), retsept
 * muharriri, MXIK, modifikatorlar. Barkod yaratilsa — saqlangach yorliq chop etish kartasi (avto-chop etish).
 */
export default function DishForm({ data, initialType, initialProductId, initialSection = 'kitchen', mediaEnabled }: Props) {
  const d = useDict();
  const t = d.menu;
  const f = t.form;
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const { can, dish } = data;
  const editing = !!dish;

  // Tanlash mumkin bo'lgan turlar: tahrirda tovar — faqat tovar, taom/xizmat — o'zaro; yangida — huquq bo'yicha
  const allowed = TYPE_ORDER.filter((x) =>
    editing ? (dish.type === 'goods' ? x === 'goods' : x !== 'goods') : x === 'goods' ? can.edit : can.create);
  const [type, setType] = useState<MenuItemType>(
    dish?.type ?? (initialType && allowed.includes(initialType) ? initialType : allowed[0] ?? 'dish'),
  );
  const [stock, setStock] = useState<StockOption[]>(data.stock);
  const [goodsId, setGoodsId] = useState(!editing && initialProductId && data.stock.some((s) => s.id === initialProductId) ? initialProductId : '');
  const goods = goodsId ? stock.find((s) => s.id === goodsId) ?? null : null;

  const [name, setName] = useState(dish?.name ?? goods?.name ?? '');
  const [price, setPrice] = useState(dish ? String(dish.price) : goods ? String(goods.price || '') : '');
  const [categories, setCategories] = useState(data.categories);
  const legacyCat = dish && !dish.categoryId && dish.categoryName ? dish.categoryName : null;
  const [categoryId, setCategoryId] = useState(dish?.categoryId ?? (legacyCat ? LEGACY_CATEGORY_VALUE : goods?.categoryId ?? ''));
  // Yangi bar bandi — sukut bo'yicha birinchi faol bar stansiyasi
  const [stationId, setStationId] = useState(
    dish?.stationId ?? goods?.stationId
      ?? (!dish && initialSection === 'bar' ? data.stations.find((s) => s.active && s.kind === 'bar')?.id : undefined) ?? '',
  );
  const [cost, setCost] = useState(dish?.cost ? String(dish.cost) : '');
  const [groups, setGroups] = useState<DraftGroup[]>(() => toDraft(dish?.modifierGroups ?? []));
  const [rows, setRows] = useState<RecipeRow[]>(() => toRecipeRows(dish?.recipe ?? [], data.stock));
  const [err, setErr] = useState<{ msg: string; key?: string; row?: string } | null>(null);
  const [extraOpen, setExtraOpen] = useState(!!(dish && (dish.modifierGroups.length || dish.ikpu)));
  const [section, setSection] = useState<MenuSection>(dish?.section ?? initialSection);
  // Barkod kerak: yangi bar bandida — sukut bo'yicha ha; tahrirda — egasi yoqadi
  const [needBarcode, setNeedBarcode] = useState(!editing);
  /** Barkod yaratilgan saqlash — forma o'rniga yorliq kartasi */
  const [done, setDone] = useState<{ id: string; barcode: string } | null>(null);

  const catOptions = flattenCategories(categories);
  const indent = (depth: number) => '   '.repeat(depth) + (depth ? '└ ' : '');
  const stations = data.stations.filter((s) => s.active || s.id === stationId);
  const priceNum = Number(price || 0);
  const branchQ = data.branches.length > 1 ? `?branch=${data.branchId}` : '';
  const backHref = `/app/menu${editing ? '' : branchQ}`;
  const unitLabel = (u: string | null) => d.menu.units[u ?? 'dona'] ?? d.stock.fields.units[u as keyof typeof d.stock.fields.units] ?? u ?? '';
  const stationKind = (id: string) => data.stations.find((s) => s.id === id)?.kind ?? null;
  /** Mavjud barkod (tahrir yoki tanlangan ombor tovari) — bo'lsa yangisi yaratilmaydi */
  const existingBarcode = editing ? dish.barcode : goods?.barcode ?? null;
  const wantBarcode = section === 'bar' && needBarcode && !existingBarcode;

  // Bo'lim almashganda stansiya mos bo'lsin: Bar — birinchi faol bar stansiyasi (tanlanmagan yoki oshxona bo'lsa),
  // Taomlar — bar stansiyasi tanlangan bo'lsa birinchi faol oshxona stansiyasi (yo'q — stansiyasiz)
  function pickSection(next: MenuSection) {
    setSection(next);
    const want = next === 'bar' ? 'bar' : 'kitchen';
    if (stationId && stationKind(stationId) === want) return;
    if (!stationId && next === 'kitchen') return;
    const target = data.stations.find((s) => s.active && s.kind === want)?.id;
    if (target) setStationId(target);
    else if (next === 'kitchen') setStationId('');
  }

  function pickGoods(id: string) {
    const prev = goods;
    const next = stock.find((s) => s.id === id) ?? null;
    setGoodsId(id);
    // Nom va narx — tovardan (foydalanuvchi o'zgartirmagan bo'lsa)
    if (next && (!name || name === prev?.name)) setName(next.name);
    if (next && (!price || price === String(prev?.price ?? ''))) setPrice(next.price ? String(next.price) : '');
    // Tovarning turkumi va stansiyasi saqlanib qolsin (bo'sh yuborilsa — o'chib ketardi)
    if (next && (!categoryId || categoryId === (prev?.categoryId ?? ''))) setCategoryId(next.categoryId ?? '');
    if (next && (!stationId || stationId === (prev?.stationId ?? ''))) setStationId(next.stationId ?? '');
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (type === 'goods' && !editing && !goodsId) { setErr({ msg: d.menu.errors.pickGoods }); return; }
    if (!name.trim()) { setErr({ msg: f.nameMissing }); return; }
    if (price === '') { setErr({ msg: f.priceMissing }); return; }
    let recipe: { productId: string; qty: number }[] | undefined;
    if (type === 'dish') {
      if (!rows.length) { setErr({ msg: d.menu.errors.recipeEmpty }); return; }
      recipe = [];
      for (const r of rows) {
        const s = stock.find((x) => x.id === r.productId);
        const qty = rowBaseQty(r, s?.unit ?? null);
        if (qty === null) { setErr({ msg: tr(t.recipe.badQty, { name: s?.name ?? '—' }), row: r.key }); return; }
        recipe.push({ productId: r.productId, qty });
      }
    }
    const ikpu = String(fd.get('ikpu') ?? '');
    if (parseMxikInput(ikpu) === null) { setExtraOpen(true); setErr({ msg: d.stock.mxik.invalid }); return; }
    const v = validateGroups(groups);
    if (!v.ok) { setExtraOpen(true); setErr({ msg: d.restaurant.settings[v.error], key: v.groupKey }); return; }
    setErr(null);

    const photo = mediaEnabled ? String(fd.get('photoUrl') ?? '') : undefined;
    const input = {
      ...(dish ? { id: dish.id } : { branchId: data.branchId }),
      type,
      ...(type === 'goods' && !editing ? { productId: goodsId } : {}),
      name: name.trim(),
      price: priceNum,
      // Eski (turkumsiz) kategoriya tanlangan bo'lsa yoki ombordagi tovar turkumsiz qo'shilsa — o'zgartirilmaydi
      ...(categoryId === LEGACY_CATEGORY_VALUE || (type === 'goods' && !editing && !categoryId) ? {} : { categoryId: categoryId || null }),
      // Ombordagi tovar qo'shilayotganda bo'sh rasm uning mavjud rasmini o'chirmasin
      ...(photo !== undefined && (editing || photo) ? { photoUrl: photo } : {}),
      stationId: stationId || null,
      section,
      ...(wantBarcode ? { barcode: true } : {}),
      ikpu,
      modifierGroups: v.groups,
      ...(recipe ? { recipe } : {}),
      ...(type === 'service' && can.viewCost ? { cost: cost === '' ? null : Number(cost) } : {}),
    };
    start(async () => {
      try {
        const r = await saveMenuDishAction(input);
        if (!r.ok) { setErr({ msg: r.error }); toast(r.error, 'error'); return; }
        if (r.success) toast(r.success, 'success');
        if (r.data.barcode) {
          // Yangi barkod — yorliq kartasi (chop etish o'zi boshlanadi), ro'yxatga qaytish — foydalanuvchi tanlaydi
          setDone({ id: r.data.id, barcode: r.data.barcode });
          router.refresh();
          return;
        }
        router.push(backHref);
        router.refresh();
      } catch {
        toast(d.common.errorGeneric, 'error');
      }
    });
  }

  const title = editing ? f.editTitle : type === 'goods' ? f.goodsTitle : section === 'bar' ? f.barTitle : f.newTitle;
  const backHrefSection = section === 'bar' && !editing
    ? `/app/menu?${new URLSearchParams({ ...(branchQ ? { branch: data.branchId } : {}), section: 'bar' })}`
    : backHref;

  if (done) {
    const moreQ = new URLSearchParams({ ...(branchQ ? { branch: data.branchId } : {}), section, ...(type === 'goods' ? { type } : {}) });
    return (
      <div className="mn-form">
        <BackLink href={backHrefSection}>{f.back}</BackLink>
        <section className="lb-created" role="status">
          <span className="lb-created-ic" aria-hidden="true"><Icon name="barcode" size={22} /></span>
          <div className="lb-created-t">
            <b>{tr(t.barcode.created, { code: done.barcode })}</b>
            <span>{name.trim()} · {t.barcode.createdHint}</span>
          </div>
          <div className="lb-created-a">
            <LabelPrint ids={[done.id]} variant="primary" label={t.barcode.printNow} auto />
            {!editing && (
              // To'liq yuklash — forma holati (done) tozalansin
              <a href={`/app/menu/new?${moreQ}`} className="btn btn-tinted btn-with-icon">
                <Icon name="plus" size={17} /> {t.barcode.addMore}
              </a>
            )}
            <BackLink href={backHrefSection} className="btn btn-ghost">{t.barcode.back}</BackLink>
          </div>
        </section>
      </div>
    );
  }

  return (
    <form ref={formRef} className="mn-form" onSubmit={submit} noValidate>
      <BackLink href={backHrefSection}>{f.back}</BackLink>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{editing ? dish.name : title}</h1>
          <p className="t-page-sub">{editing ? `${title} · ${t.types[dish.type]}` : t.typeHints[type]}</p>
        </div>
      </div>
      {dish?.stopListed && <p className="t-note t-note--warn rs-note">{f.stopped}</p>}
      {!editing && !can.create && <p className="t-note t-note--info rs-note">{f.noCreatePerm}</p>}

      {/* Bo'lim: Taomlar (oshxona) / Bar */}
      <div className="mn-section-pick">
        <span className="rs-label" id="mn-section-l">{f.section}</span>
        <SegmentSwitch
          label={f.section}
          value={section}
          onChange={pickSection}
          disabled={pending}
          options={[{ value: 'kitchen', label: t.sections.kitchen }, { value: 'bar', label: t.sections.bar }]}
        />
        <small className="rs-hint">{f.sectionHints[section]}</small>
      </div>

      {/* Turi */}
      {allowed.length > 1 && (
        <fieldset className="mn-types-wrap" disabled={pending}>
          <legend className="rs-label">{f.type}</legend>
          <div className="mn-types">
          {allowed.map((x) => (
            <label key={x} className={`mn-type${type === x ? ' is-on' : ''}`}>
              <input type="radio" name="dishType" value={x} checked={type === x} onChange={() => { setType(x); setErr(null); }} />
              <span className="mn-type-ic" aria-hidden="true"><Icon name={TYPE_ICON[x]} size={18} /></span>
              <span className="mn-type-t">
                <b>{t.types[x]}</b>
                <small>{t.typeHints[x]}</small>
              </span>
            </label>
          ))}
          </div>
        </fieldset>
      )}

      <div className="mn-form-grid">
        {/* Asosiy */}
        <section className="rs-card mn-main" aria-label={f.name}>
          {type === 'goods' && !editing && (
            <div className="auth-field">
              <label htmlFor="mn-goods">{f.pickGoods}</label>
              {stock.length ? (
                <select id="mn-goods" value={goodsId} onChange={(e) => pickGoods(e.target.value)} disabled={pending} required>
                  <option value="">{f.pickGoodsPh}</option>
                  {stock.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} — {fmtQty(s.available)} {unitLabel(s.unit)}</option>
                  ))}
                </select>
              ) : (
                <p className="rs-hint">{f.noGoods}</p>
              )}
              <a href="/app/products/new" className="t-link mn-small-link">{f.newGoodsLink}</a>
            </div>
          )}
          {type === 'goods' && (editing ? dish.available !== null : !!goods) && (
            <p className="rs-hint">
              {tr(f.goodsStock, { qty: `${fmtQty(editing ? dish.available ?? 0 : goods?.available ?? 0)} ${unitLabel(editing ? dish.unit : goods?.unit ?? null)}` })}
            </p>
          )}

          <div className="auth-field">
            <label htmlFor="mn-name">{f.name}</label>
            <input id="mn-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={f.namePh} maxLength={120} required disabled={pending} autoComplete="off" />
          </div>
          <div className="rs-grid2">
            <div className="auth-field">
              <label htmlFor="mn-price">{f.price}</label>
              <PriceInput id="mn-price" value={price} onValueChange={setPrice} required disabled={pending} placeholder="0" />
            </div>
            <div className="auth-field">
              <label htmlFor="mn-cat">{f.category}</label>
              <SelectAdd
                id="mn-cat"
                value={categoryId}
                onChange={setCategoryId}
                options={catOptions.map((o) => ({ value: o.id, label: indent(o.depth) + o.name, title: o.path }))}
                extraOptions={legacyCat ? <option value={LEGACY_CATEGORY_VALUE}>{legacyCat}</option> : undefined}
                placeholder={t.noCategory}
                disabled={pending}
                addLabel={d.stock.form.newCategory}
                addPlaceholder={d.stock.form.newCategoryPlaceholder}
                onAdd={async (n) => {
                  const res = await createCategoryAction(n, null);
                  if (!res.ok) return { error: res.error };
                  setCategories((prev) => (prev.some((c) => c.id === res.item.id) ? prev : [...prev, res.item]));
                  return { value: res.item.id, label: res.item.name };
                }}
              />
            </div>
          </div>
          <div className="auth-field">
            <label htmlFor="mn-station">{f.station}</label>
            <select id="mn-station" value={stationId} onChange={(e) => setStationId(e.target.value)} disabled={pending}>
              <option value="">{d.restaurant.common.noStation}</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.active ? '' : ` (${d.common.inactive.toLowerCase()})`}</option>
              ))}
            </select>
            <span className="field-hint">{f.stationHint}</span>
          </div>
          {section === 'bar' && (
            existingBarcode ? (
              <div className="auth-field mn-barcode">
                <span className="rs-label">{t.barcode.title}</span>
                <div className="mn-barcode-has">
                  <Icon name="barcode" size={18} />
                  <span>{tr(t.barcode.has, { code: existingBarcode })}</span>
                  {editing && <LabelPrint ids={[dish.id]} variant="bulk" label={t.barcode.printNow} />}
                </div>
              </div>
            ) : (
              <label className="rs-toggle mn-barcode">
                <span>
                  <b>{t.barcode.need}</b>
                  <small>{needBarcode ? t.barcode.needHint : t.barcode.noNeed}</small>
                </span>
                <input type="checkbox" checked={needBarcode} onChange={(e) => setNeedBarcode(e.target.checked)} disabled={pending} />
              </label>
            )
          )}
          {mediaEnabled && (
            <div className="auth-field">
              <span className="rs-label">{f.photo}</span>
              <ImageUploadField defaultValue={dish?.photoUrl ?? ''} disabled={pending} />
            </div>
          )}
        </section>

        {/* Retsept / tannarx */}
        {type === 'dish' && (
          <section className="rs-card mn-recipe-card" aria-labelledby="mn-recipe-h">
            <div>
              <h2 className="rs-h" id="mn-recipe-h">{t.recipe.title}</h2>
              <p className="rs-hint">{t.recipe.hint}</p>
            </div>
            <RecipeEditor
              rows={rows}
              onChange={(r) => { setRows(r); if (err?.row) setErr(null); }}
              stock={stock}
              onStockAdd={(s) => setStock((list) => [...list, s].sort((a, b) => a.name.localeCompare(b.name)))}
              price={priceNum}
              branchId={data.branchId}
              canViewCost={can.viewCost}
              canCreate={can.create}
              disabled={pending}
              errorKey={err?.row ?? null}
            />
          </section>
        )}
        {type === 'service' && can.viewCost && (
          <section className="rs-card mn-recipe-card">
            <div className="auth-field">
              <label htmlFor="mn-cost">{f.serviceCost}</label>
              <PriceInput id="mn-cost" value={cost} onValueChange={setCost} disabled={pending} placeholder="0" />
              <span className="field-hint">
                {f.serviceCostHint}
                {priceNum > 0 && cost !== '' ? ` ${t.recipe.profit}: ${fmtMoney(priceNum - Number(cost))} ${d.common.sum}.` : ''}
              </span>
            </div>
          </section>
        )}
      </div>

      {/* Qo'shimcha: MXIK va modifikatorlar */}
      <details className="rs-card mn-extra" open={extraOpen} onToggle={(e) => setExtraOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="rs-h">{f.extra}</summary>
        <MxikField initial={dish?.ikpu ?? ''} disabled={pending} queryHint={() => name} />
        <div className="rs-mods-wrap">
          <span className="rs-label">{f.modifiers}</span>
          <small className="rs-hint">{f.modifiersHint}</small>
          <ModifierGroupsEditor value={groups} onChange={(g) => { setGroups(g); setErr(null); }} disabled={pending} errorKey={err?.key} />
        </div>
      </details>

      {err && <p className="rs-error" role="alert">{err.msg}</p>}
      <div className="mn-savebar">
        <button type="submit" className="btn btn-primary" disabled={pending || (type === 'goods' && !editing && !goodsId)}>
          {pending ? d.common.saving : f.save}
        </button>
        <BackLink href={backHrefSection} className="btn btn-ghost">{d.common.cancel}</BackLink>
      </div>
    </form>
  );
}
