import { ImageResponse } from 'next/og';
import { BrandOgImage } from '@/components/seo/OgImage';

/** X (Twitter) kartochkasi — OG rasmi bilan bir xil dizayn. */
export const alt = "Savora — Nasiyani nazorat qiling, pulni vaqtida oling";
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function TwitterImage() {
  return new ImageResponse(<BrandOgImage />, size);
}
