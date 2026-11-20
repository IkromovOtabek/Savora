import { code128Bars } from './code128';
import type { LabelItem, LabelSettings } from './settings';
import { fmtMoney } from '../format';

/**
 * Yorliq HTML hujjati — chop etish (yashirin iframe) va sozlamalardagi jonli ko'rinish AYNAN shu hujjatni
 * ko'rsatadi (preview = chop etiladigan narsa). Skript yo'q; barcha matn ekranlanadi; iframe sandbox'da ochiladi.
 *
 * O'lchamlar mm'da: bitta yorliq = bitta sahifa (@page size: W×H, margin 0). Shtrix chizig'i kengligi termal
 * printerning nuqta to'riga (203 dpi → 0.125 mm) tekislanadi — chiziqlar xira bo'lmaydi, skaner ishonchli o'qiydi.
 */

/** 203 dpi printer nuqtasi */
const DOT_MM = 0.125;
/** Ishonchli o'qish uchun eng ingichka chiziq (2 nuqta) */
export const MIN_SAFE_MODULE_MM = 0.25;
const MAX_MODULE_MM = 0.5;
/** Chiziqlarning ikki yonidagi bo'sh joy (Code 128 talabi — 10 modul) */
const QUIET_MODULES = 10;

export interface LabelTexts {
  /** «so'm» */
  sum: string;
  /** «Kafolat: {n} oy» */
  warranty: string;
}

export interface LabelRenderCtx {
  shopName: string;
  texts: LabelTexts;
}

export interface LabelGeometry {
  bars: [number, number][];
  modules: number;
  /** Bitta modul (eng ingichka chiziq) kengligi, mm */
  moduleMm: number;
  /** Chiziqlar umumiy kengligi, mm */
  widthMm: number;
  /** Chiziq 0.25 mm dan ingichka — arzon skaner qiynalishi mumkin (kengroq yorliq tavsiya) */
  tight: boolean;
}

/** Yon chekka (mm) */
function padX(width: number): number {
  return width >= 40 ? 1.5 : 1;
}

/** Kod yorliq kengligiga qanday sig'ishi. Kodlab bo'lmasa (kirill va h.k.) — null */
export function labelGeometry(code: string, width: number): LabelGeometry | null {
  const enc = code128Bars(code);
  if (!enc) return null;
  const content = width - 2 * padX(width);
  // Chiziqlar matn maydoniga sig'sin, jim zona esa yorliq chekkasigacha bo'lsa yetadi
  let x = Math.min(content / enc.modules, (width - 0.6) / (enc.modules + 2 * QUIET_MODULES), MAX_MODULE_MM);
  const tight = x < MIN_SAFE_MODULE_MM;
  if (!tight) x = Math.floor(x / DOT_MM + 1e-9) * DOT_MM;
  return { bars: enc.bars, modules: enc.modules, moduleMm: x, widthMm: enc.modules * x, tight };
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function barcodeSvg(g: LabelGeometry): string {
  const d = g.bars.map(([x, w]) => `M${x} 0h${w}v10h-${w}z`).join('');
  return `<svg class="bc" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g.modules} 10" preserveAspectRatio="none" shape-rendering="crispEdges" style="width:${r2(g.widthMm)}mm" aria-hidden="true"><path d="${d}" fill="#000"/></svg>`;
}

function fmtDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}.${m}.${y}` : '';
}

/** Bitta yorliq ichki HTML'i */
function labelHtml(item: LabelItem, s: LabelSettings, ctx: LabelRenderCtx): string {
  const on = new Set(s.fields);
  const parts: string[] = [];
  if (on.has('shop') && ctx.shopName) parts.push(`<div class="shop">${escapeHtml(ctx.shopName)}</div>`);
  if (on.has('name')) parts.push(`<div class="nm">${escapeHtml(item.name)}</div>`);
  if (on.has('attrs') && item.attrs) parts.push(`<div class="at">${escapeHtml(item.attrs)}</div>`);

  const g = item.code ? labelGeometry(item.code, s.width) : null;
  if (g) parts.push(barcodeSvg(g));
  else parts.push('<div class="bc bc--none"></div>');
  if (on.has('code') || !g) {
    const prefix = item.codeKind === 'imei' ? 'IMEI ' : '';
    parts.push(`<div class="cd">${escapeHtml(prefix + item.code)}</div>`);
  }

  const meta: string[] = [];
  if (on.has('warranty') && item.warrantyMonths) meta.push(escapeHtml(ctx.texts.warranty.replace('{n}', String(item.warrantyMonths))));
  if (on.has('date') && item.date) meta.push(escapeHtml(fmtDay(item.date)));
  if (on.has('productId') && item.productId && item.codeKind !== 'productId') meta.push(escapeHtml(item.productId));
  const price = on.has('price') && item.price > 0
    ? `<b class="pr">${escapeHtml(fmtMoney(item.price))}<small> ${escapeHtml(ctx.texts.sum)}</small></b>`
    : '';
  if (price || meta.length) {
    parts.push(`<div class="ft${price ? '' : ' ft--c'}">${price}${meta.length ? `<span class="mt">${meta.map((m) => `<span>${m}</span>`).join('')}</span>` : ''}</div>`);
  }
  return `<div class="l">${parts.join('')}</div>`;
}

const SIZE_SCALE: Record<LabelSettings['textSize'], number> = { s: 0.86, m: 1, l: 1.16 };

function labelCss(s: LabelSettings): string {
  const W = s.width;
  const H = s.height;
  const base = Math.min(3.6, Math.max(1.8, Math.min(W / 15, H / 8.5))) * SIZE_SCALE[s.textSize];
  const small = base * 0.8;
  const px = padX(W);
  const py = H >= 30 ? 1.2 : 0.8;
  return `
@page{size:${W}mm ${H}mm;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#fff;color:#000}
body{font-family:Arial,Helvetica,"Liberation Sans",sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.l{width:${W}mm;height:${H}mm;padding:${py}mm ${px}mm;overflow:hidden;display:flex;flex-direction:column;align-items:center;gap:${r2(base * 0.16)}mm;break-after:page;page-break-after:always;text-align:center}
.l:last-child{break-after:auto;page-break-after:auto}
.shop{width:100%;font-size:${r2(small * 0.92)}mm;font-weight:700;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.15}
.nm{width:100%;font-size:${r2(base)}mm;font-weight:700;line-height:1.12;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.at{width:100%;font-size:${r2(small)}mm;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bc{flex:1 1 0;min-height:${r2(Math.min(5, H * 0.2))}mm;max-height:${r2(H * 0.55)}mm;display:block}
.bc--none{width:100%;border:.2mm dashed #000}
.cd{font-size:${r2(small)}mm;line-height:1.1;letter-spacing:.08em;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;max-width:100%}
.ft{width:100%;display:flex;align-items:baseline;justify-content:space-between;gap:1mm;line-height:1.05}
.ft--c{justify-content:center}
.pr{font-size:${r2(base * 1.3)}mm;font-weight:800;white-space:nowrap;letter-spacing:-.01em}
.pr small{font-size:${r2(small * 0.9)}mm;font-weight:700}
.mt{display:flex;flex-direction:column;align-items:flex-end;font-size:${r2(small * 0.9)}mm;line-height:1.15;white-space:nowrap;overflow:hidden}
.ft--c .mt{align-items:center}
`;
}

/** Chop etiladigan to'liq hujjat (har yorliq — alohida sahifa) */
export function labelDocument(items: LabelItem[], s: LabelSettings, ctx: LabelRenderCtx, title = 'Labels'): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${labelCss(s)}</style></head><body>${items
    .map((it) => labelHtml(it, s, ctx))
    .join('')}</body></html>`;
}

/**
 * Nusxalarni yoyish: har mahsulot `copies` marta; `perUnit` — sanaladigan tovar qoldig'icha (kamida 1).
 * Umumiy son `max` bilan cheklanadi (tasodifan 10 000 yorliq chop etilmasin).
 */
export function expandCopies(items: LabelItem[], copies: number, perUnit: boolean, max = 1000): LabelItem[] {
  const out: LabelItem[] = [];
  for (const it of items) {
    const n = perUnit ? Math.max(1, Math.floor(it.available)) : copies;
    for (let i = 0; i < n && out.length < max; i++) out.push(it);
  }
  return out;
}
