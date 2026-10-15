import { ImageResponse } from 'next/og';

/**
 * PNG ikonkalar (build vaqtida bir marta yaratiladi):
 *   /icons/icon-192.png, /icons/icon-512.png      — PWA "any" (yumaloq burchakli)
 *   /icons/maskable-512.png                       — PWA "maskable" (to'liq fon, belgi 80% xavfsiz zonada)
 *   /icons/apple-touch-icon.png (180)              — iOS "Bosh ekranga qo'shish" (iOS SVG'ni qo'llamaydi)
 * Shakl — components/BrandMark.tsx bilan bir xil.
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

  // Satori <g transform> ni qo'llamaydi: fon — CSS gradient, belgi — alohida svg.
  // Maskable: viewBox kengaytiriladi (-12.5..112.5) → belgi markazdagi 80% xavfsiz zonada.
  const viewBox = maskable ? '-12.5 -12.5 125 125' : '0 0 100 100';
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: 'linear-gradient(180deg, #3a68c4 0%, #173f8f 100%)',
          borderRadius: `${(radius / 100) * size}px`,
        }}
      >
        <svg width={size} height={size} viewBox={viewBox}>
          <rect x="20" y="58" width="13" height="24" rx="6.5" fill="#fff" opacity="0.55" />
          <rect x="40" y="45" width="13" height="37" rx="6.5" fill="#fff" opacity="0.8" />
          <rect x="60" y="32" width="13" height="50" rx="6.5" fill="#fff" />
          <path d="M24 46C38 28 58 20 79 21" fill="none" stroke="#f0bf4c" strokeWidth="6.5" strokeLinecap="round" />
          <circle cx="79" cy="21" r="6.5" fill="#f0bf4c" />
        </svg>
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { 'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400' },
    },
  );
}
