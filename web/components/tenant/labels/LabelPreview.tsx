'use client';

/** 1 mm ekranda (CSS px) */
const MM = 96 / 25.4;

/**
 * Yorliqning jonli ko'rinishi — chop etiladigan hujjatning o'zi (lib/labels/render.ts), sandbox iframe'da
 * (skript taqiqlangan, matn ekranlangan). Haqiqiy mm o'lchamda chiziladi va `maxPx` ga sig'adigan qilib kattalashtiriladi.
 */
export default function LabelPreview({ html, width, height, maxPx = 300, title }: {
  html: string;
  width: number;
  height: number;
  /** Eng katta tomoni ekranda necha px bo'lsin */
  maxPx?: number;
  title: string;
}) {
  const w = width * MM;
  const h = height * MM;
  const scale = Math.min(maxPx / w, maxPx / h, 3);
  return (
    <div className="lb-prev" style={{ width: Math.round(w * scale), height: Math.round(h * scale) }}>
      {/* allow-scripts YO'Q — ichida hech narsa bajarilmaydi; allow-same-origin'siz (opaque origin) Chrome ba'zan bo'sh chizadi */}
      <iframe
        title={title}
        sandbox="allow-same-origin"
        srcDoc={html}
        tabIndex={-1}
        style={{ width: w, height: h, transform: `scale(${scale})` }}
      />
    </div>
  );
}
