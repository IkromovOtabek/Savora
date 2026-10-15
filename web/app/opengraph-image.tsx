import { ImageResponse } from 'next/og';
import { BrandOgImage } from '@/components/seo/OgImage';

/** Ijtimoiy tarmoqlar ulashish rasmi (Telegram, Facebook, X, LinkedIn) — 1200x630. */
export const alt = "Savora — Nasiyani nazorat qiling, pulni vaqtida oling";
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(<BrandOgImage />, size);
}
