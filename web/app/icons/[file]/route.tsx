import { ImageResponse } from 'next/og';
import { StaticLogo, TILE_BG } from '@/components/seo/OgImage';

/**
 * PNG ikonkalar (build vaqtida bir marta yaratiladi):
 *   /icons/icon-192.png, /icons/icon-512.png      — PWA "any" (yumaloq burchakli)
 *   /icons/maskable-512.png                       — PWA "maskable" (to'liq fon, belgi 80% xavfsiz zonada)
 *   /icons/apple-touch-icon.png (180)              — iOS "Bosh ekranga qo'shish" (iOS SVG'ni qo'llamaydi)
 * Shakl — lib/brand.ts (components/BrandMark.tsx bilan bir xil).
 */
const FILES: Record<string, { size: number; maskable: boolean; radius: number }> = {
  'icon-192.png': { size: 192, maskable: false, radius: 24 },
  'icon-512.png': { size: 512, maskable: false, radius: 24 },
  'maskable-512.png': { size: 512, maskable: true, radius: 0 },
  // iOS o'zi burchakni yumaloqlaydi — to'liq kvadrat
  'apple-touch-icon.png': { size: 180, maskable: true, radius: 0 },
};

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(FILES).map((file) => ({ file }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const spec = FILES[file];
  if (!spec) return new Response('Not found', { status: 404 });
  const { size, maskable, radius } = spec;

  // Maskable: belgi markazdagi 80% xavfsiz zonada — logo balandligi kichikroq
  const logoH = Math.round(size * (maskable ? 0.6 : 0.74));
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: TILE_BG,
          borderRadius: `${(radius / 100) * size}px`,
        }}
      >
        <StaticLogo height={logoH} />
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { 'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400' },
    },
  );
}
