'use client';

import { useState } from 'react';
import Icon from '@/components/icons/Icon';

/** Mahsulot rasmlari: katta rasm + kichik rasmlar */
export default function Gallery({ images, alt }: { images: string[]; alt: string }) {
  const [i, setI] = useState(0);
  const cur = images[i] ?? images[0];
  return (
    <div className="mk-gallery">
      <div className="mk-gallery-main">
        {cur
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={cur} alt={alt} />
          : <Icon name="box" size={56} />}
      </div>
      {images.length > 1 && (
        <div className="mk-thumbs">
          {images.map((src, n) => (
            <button key={src} type="button" aria-current={n === i} aria-label={`${alt} ${n + 1}`} onClick={() => setI(n)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
