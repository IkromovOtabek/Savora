'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons/Icon';
import PriceInput from '@/components/ui/PriceInput';
import { saveEcomItemAction } from '@/app/actions/ecom';
import { useToastOnState } from '@/lib/useToastOnState';
import { toast } from '@/lib/toast';
import { resolvePublicFileUrl } from '@/lib/fileUrl';
import { fmtMoney } from '@/lib/format';
import { tr } from '@/lib/i18n/fmt';
import { useDict } from '@/lib/i18n/client';

export type EcomItemInitial = {
  key: string;
  name: string;
  displayName: string;
  price: number;
  maxPrice: number;
  oldPrice?: number;
  description?: string;
  images: string[];
  listed: 'auto' | 'show' | 'hide';
  autoPublish: boolean;
  live: boolean;
  stockText: string;
};

const MAX_IMAGES = 6;

/** Tovarning e-commerce ma'lumotlari: nom, narx, eski narx, tavsif, rasmlar (≤6), ko'rinish + jonli ko'rinish */
export default function EcomItemForm({ initial }: { initial: EcomItemInitial }) {
  const d = useDict();
  const k = d.ecom.edit;
  const router = useRouter();
  const [state, action, pending] = useActionState(saveEcomItemAction, null);
  useToastOnState(state);
  const [name, setName] = useState(initial.name);
  const [price, setPrice] = useState(String(initial.price || ''));
  const [oldPrice, setOldPrice] = useState(initial.oldPrice ? String(initial.oldPrice) : '');
  const [desc, setDesc] = useState(initial.description ?? '');
  const [images, setImages] = useState<string[]>(initial.images);
  const [listed, setListed] = useState(initial.listed);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Nom o'zgarsa guruh kaliti ham o'zgaradi — yangi manzilga o'tamiz
  useEffect(() => {
    if (state?.success && state.key && state.key !== initial.key) router.replace(`/app/ecom/${state.key}`);
  }, [state, initial.key, router]);

  const num = (s: string) => Number(String(s).replace(/\D/g, '')) || 0;
  const priceChanged = num(price) !== initial.price;

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const room = MAX_IMAGES - images.length;
      const added: string[] = [];
      for (const file of [...files].slice(0, room)) {
        const body = new FormData();
        body.append('file', file);
        const res = await fetch('/api/upload?purpose=ecom', { method: 'POST', body });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.url) throw new Error(data.error || d.ui.upload.error);
        added.push(data.url);
      }
      setImages((p) => [...p, ...added].slice(0, MAX_IMAGES));
    } catch (e) {
      toast(e instanceof Error ? e.message : d.ui.upload.error, 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const vis = [
    { v: 'auto' as const, label: k.visAuto },
    { v: 'show' as const, label: k.visShow },
    { v: 'hide' as const, label: k.visHide },
  ];
  const previewPrice = num(price);
  const previewOld = num(oldPrice);

  return (
    <div className="ec-edit">
      <form action={action} className="ec-card ec-form">
        <div>
          <h2>{k.title}</h2>
          <p className="ec-muted">{k.sub}</p>
        </div>
        <input type="hidden" name="key" value={initial.key} />
        <input type="hidden" name="images" value={JSON.stringify(images)} />
        <input type="hidden" name="priceChanged" value={priceChanged ? '1' : '0'} />

        <div className="ec-field">
          <label htmlFor="ec-name">{k.name}</label>
          <input id="ec-name" name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
        </div>

        <div className="ec-two">
          <div className="ec-field">
            <label htmlFor="ec-price">{k.price}</label>
            <PriceInput id="ec-price" name="salePrice" value={price} onValueChange={setPrice} />
            <small>{k.priceHint}</small>
          </div>
          <div className="ec-field">
            <label htmlFor="ec-old">{k.oldPrice}</label>
            <PriceInput id="ec-old" name="oldPrice" value={oldPrice} onValueChange={setOldPrice} />
            <small>{k.oldPriceHint}</small>
          </div>
        </div>
        {initial.maxPrice > initial.price && (
          <p className="ec-warn">{tr(k.mixedPrices, { min: fmtMoney(initial.price), max: fmtMoney(initial.maxPrice) })}</p>
        )}

        <div className="ec-field">
          <label htmlFor="ec-desc">{k.description}</label>
          <textarea id="ec-desc" name="description" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={2000} placeholder={k.descriptionPh} />
          <small>{desc.length} / 2000</small>
        </div>

        <fieldset className="ec-field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>{k.images}</legend>
          <div className="ec-imgs">
            {images.map((u, i) => (
              <div key={u} className="ec-img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resolvePublicFileUrl(u)} alt="" />
                {i === 0 && <span className="ec-img-main">{k.main}</span>}
                <div className="ec-img-acts">
                  {i > 0 && (
                    <button type="button" onClick={() => setImages((p) => [u, ...p.filter((x) => x !== u)])}>{k.makeMain}</button>
                  )}
                  <button type="button" onClick={() => setImages((p) => p.filter((x) => x !== u))}>{k.remove}</button>
                </div>
              </div>
            ))}
            {images.length < MAX_IMAGES && (
              <button type="button" className="ec-img-add" disabled={uploading} onClick={() => fileRef.current?.click()}>
                <Icon name={uploading ? 'clock' : 'plus'} size={22} />
                {uploading ? k.uploading : k.addImage}
              </button>
            )}
          </div>
          <small>{tr(k.imagesHint, { n: MAX_IMAGES })}</small>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => void upload(e.target.files)} />
        </fieldset>

        <fieldset className="ec-field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>{k.visibility}</legend>
          <div className="ec-vis" role="radiogroup" aria-label={k.visibility}>
            {vis.map((o) => (
              <label key={o.v} className={listed === o.v ? 'is-on' : ''}>
                <input type="radio" name="listed" value={o.v} checked={listed === o.v} onChange={() => setListed(o.v)} />
                {o.label}
              </label>
            ))}
          </div>
          {listed === 'auto' && <small>{initial.autoPublish ? k.visAutoOn : k.visAutoOff}</small>}
        </fieldset>

        <p className="ec-muted">{initial.stockText}</p>
        <button type="submit" className="btn btn-primary" disabled={pending || uploading}>{k.save}</button>
      </form>

      <aside className="ec-card ec-preview" aria-label={initial.displayName}>
        <span className={`ec-pill ${initial.live ? 'ec-pill--live' : 'ec-pill--hidden'}`}>{initial.live ? k.live : k.notLive}</span>
        <div className="ec-preview-img">
          {images[0]
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={resolvePublicFileUrl(images[0])} alt="" />
            : <Icon name="box" size={40} />}
        </div>
        <b>{name || initial.displayName}</b>
        <div className="ec-preview-price">
          <b className="t-num">{fmtMoney(previewPrice)} {d.common.sum}</b>
          {previewOld > previewPrice && <s className="t-num">{fmtMoney(previewOld)}</s>}
        </div>
        {desc && <p className="ec-muted" style={{ whiteSpace: 'pre-line', margin: 0 }}>{desc.slice(0, 220)}{desc.length > 220 ? '…' : ''}</p>}
      </aside>
    </div>
  );
}
