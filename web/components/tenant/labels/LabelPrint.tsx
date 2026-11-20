'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import { getLabelDataAction, type LabelData } from '@/app/actions/labels';
import { expandCopies, labelDocument, labelWarnings, type LabelRenderCtx } from '@/lib/labels/render';
import { printLabelDocument } from '@/lib/labels/print';
import { LABEL_LIMITS } from '@/lib/labels/settings';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { toast } from '@/lib/toast';
import LabelPreview from './LabelPreview';
import '../styles/labels.css';

type Ready = Extract<LabelData, { ok: true }>;

/** Bir martalik avto-chop etish belgisi (sahifa yangilansa qayta chop etilmasin) */
const AUTO_KEY = 'savora_label_auto:';
/** Shu sahifa hayotida avto-chop etish boshlangan tovarlar */
const autoStarted = new Set<string>();

/**
 * Barkod yorlig'ini chop etish: tugma → oyna (ko'rinish, nusxa, «har donaga») → chop etish.
 * `auto` — oynasiz darhol chop etish (yangi qo'shilgan tovar, «Qo'shilgach darhol chop etish» yoqiq bo'lsa).
 */
export default function LabelPrint({ ids, variant = 'button', label, auto = false, canSettings = false }: {
  ids: string[];
  /** button — oddiy, bar — kartochka paneli, bulk — ro'yxatdagi kichik tugma, primary — asosiy */
  variant?: 'button' | 'bar' | 'bulk' | 'primary';
  label?: string;
  auto?: boolean;
  /** Do'kon egasi — oynada «Yorliq sozlamalari» havolasi */
  canSettings?: boolean;
}) {
  const d = useDict();
  const t = d.labels.print;
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<{ key: string; res: Ready } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copies, setCopies] = useState(1);
  const [perUnit, setPerUnit] = useState(false);
  const idsKey = ids.join(',');
  // Tanlov o'zgarsa (ombor ro'yxati) — eski ma'lumot ko'rsatilmaydi
  const data = loaded?.key === idsKey ? loaded.res : null;

  const ctx: LabelRenderCtx | null = useMemo(
    () => (data ? { shopName: data.shopName, texts: { sum: d.labels.paper.sum, warranty: d.labels.paper.warranty } } : null),
    [data, d.labels.paper.sum, d.labels.paper.warranty],
  );

  const load = useCallback(async (): Promise<Ready | null> => {
    setLoading(true);
    try {
      const res = await getLabelDataAction(idsKey.split(',').filter(Boolean));
      if (!res.ok) {
        toast(res.error, 'error');
        return null;
      }
      setLoaded({ key: idsKey, res });
      setCopies(res.settings.copies);
      return res;
    } catch {
      toast(t.failed, 'error');
      return null;
    } finally {
      setLoading(false);
    }
  }, [idsKey, t.failed]);

  const doPrint = useCallback((res: Ready, n: number, unit: boolean) => {
    const items = expandCopies(res.items, n, unit);
    const c = { shopName: res.shopName, texts: { sum: d.labels.paper.sum, warranty: d.labels.paper.warranty } };
    printLabelDocument(labelDocument(items, res.settings, c, t.title));
  }, [d.labels.paper.sum, d.labels.paper.warranty, t.title]);

  // Yangi qo'shilgan tovar: oynasiz darhol chop etish — bir marta. Effekt qayta ishga tushsa ham (StrictMode,
  // URL'dan ?created=1 olib tashlanganda qayta chizish) — modul belgisi va sessionStorage takrorlatmaydi;
  // chop etish komponent holatiga bog'lanmagan (yarim yo'lda bekor bo'lib qolmaydi).
  useEffect(() => {
    if (!auto || !idsKey || autoStarted.has(idsKey)) return;
    const key = AUTO_KEY + idsKey;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, '1');
    } catch { /* xususiy rejim — modul belgisi yetadi */ }
    autoStarted.add(idsKey);
    void load().then((res) => {
      if (res) doPrint(res, res.settings.copies, false);
    });
  }, [auto, idsKey, load, doPrint]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function onOpen() {
    setOpen(true);
    setPerUnit(false);
    if (!data) await load();
  }

  const first = data?.items[0];
  const previewHtml = data && ctx && first ? labelDocument([first], data.settings, ctx) : '';
  const total = data ? expandCopies(data.items, copies, perUnit).length : 0;
  const hasUnits = !!data?.items.some((i) => i.available > 1);
  const warn = data ? labelWarnings(data.items, data.settings) : null;
  const pending = warn?.imeiPending ?? 0;
  const noCode = warn?.noCode;
  const tight = !!warn?.tight;

  const btnCls = variant === 'bulk'
    ? 'btn btn-sm btn-tinted btn-with-icon'
    : variant === 'primary'
      ? 'btn btn-primary btn-with-icon'
      : 'btn btn-tinted btn-with-icon';

  return (
    <>
      <button type="button" className={btnCls} onClick={onOpen} disabled={!ids.length || (loading && !open)} aria-haspopup="dialog">
        <Icon name="barcode" size={variant === 'bulk' ? 15 : 17} /> {label ?? t.button}
      </button>

      {open && (
        <div className="u-modal-overlay" onClick={() => setOpen(false)}>
          <div className="u-modal lb-modal" role="dialog" aria-modal="true" aria-labelledby="lb-modal-title" onClick={(e) => e.stopPropagation()}>
            <div className="u-modal-head">
              <h3 id="lb-modal-title">{t.title}</h3>
              <button type="button" className="u-icon-btn" onClick={() => setOpen(false)} aria-label={d.common.close}>
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="lb-body">
              {!data || !first ? (
                <p className="lb-loading" role="status">{loading ? t.loading : t.none}</p>
              ) : (
                <>
                  <div className="lb-stage">
                    <LabelPreview html={previewHtml} width={data.settings.width} height={data.settings.height} maxPx={280} title={t.title} />
                    <span className="lb-size">{data.settings.width} × {data.settings.height} mm</span>
                  </div>
                  <p className="lb-names">
                    <b>{first.name}</b>
                    {data.items.length > 1 && <span> {tr(t.more, { n: data.items.length - 1 })}</span>}
                  </p>

                  <div className="lb-row">
                    <span className="lb-row-l">{t.copies}</span>
                    <div className="lb-step" role="group" aria-label={t.copies}>
                      <button type="button" onClick={() => setCopies((c) => Math.max(1, c - 1))} disabled={perUnit || copies <= 1} aria-label="−">−</button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={LABEL_LIMITS.maxCopies}
                        value={copies}
                        disabled={perUnit}
                        aria-label={t.copies}
                        onChange={(e) => setCopies(Math.min(LABEL_LIMITS.maxCopies, Math.max(1, Math.round(Number(e.target.value) || 1))))}
                      />
                      <button type="button" onClick={() => setCopies((c) => Math.min(LABEL_LIMITS.maxCopies, c + 1))} disabled={perUnit || copies >= LABEL_LIMITS.maxCopies} aria-label="+">+</button>
                    </div>
                  </div>
                  {hasUnits && (
                    <label className="ss-check lb-unit">
                      <input type="checkbox" checked={perUnit} onChange={(e) => setPerUnit(e.target.checked)} />
                      {t.perUnit}
                    </label>
                  )}

                  {pending > 0 && <div className="auth-alert auth-alert--warn lb-alert" role="status">{tr(t.imeiPending, { n: pending })}</div>}
                  {noCode && <div className="auth-alert auth-alert--warn lb-alert" role="status">{tr(t.noCode, { name: noCode.name })}</div>}
                  {tight && !noCode && <div className="auth-alert auth-alert--warn lb-alert" role="status">{d.labels.settings.tight}</div>}
                </>
              )}
            </div>

            <div className="lb-actions">
              {canSettings ? <Link href="/app/settings?tab=label" className="btn btn-plain btn-sm">{t.settings}</Link> : <span />}
              <button
                type="button"
                className="btn btn-primary btn-with-icon"
                disabled={!data || !first || loading}
                onClick={() => data && doPrint(data, copies, perUnit)}
              >
                <Icon name="barcode" size={17} /> {t.print}{total > 1 ? ` · ${tr(t.total, { n: total })}` : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
