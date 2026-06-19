'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '@/components/icons/Icon';

/* BarcodeDetector — barcha brauzerlarda yo'q, shuning uchun minimal tip e'lon qilamiz */
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: {
      new (opts?: { formats?: string[] }): BarcodeDetectorLike;
      getSupportedFormats?: () => Promise<string[]>;
    };
  }
}

interface Props {
  onScan: (code: string) => void;
  /** Tugma matni (ixtiyoriy) */
  label?: string;
  className?: string;
}

/** Telefon/noutbuk kamerasi orqali shtrix yoki QR kodni skanerlaydi. */
export default function CameraScanButton({ onScan, label, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [supported, setSupported] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const close = useCallback(() => {
    stop();
    setOpen(false);
    setError('');
  }, [stop]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const hasDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;
    setSupported(hasDetector);

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => {});

        if (!hasDetector) return; // kamera ko'rinadi, lekin avtomatik o'qishsiz

        const detector = new window.BarcodeDetector!({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code', 'itf'],
        });

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0 && codes[0].rawValue) {
              onScan(codes[0].rawValue.trim());
              close();
              return;
            }
          } catch {
            /* kadr o'qilmadi — davom etamiz */
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) setError('Kameraga ruxsat berilmadi yoki kamera topilmadi.');
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [open, onScan, close, stop]);

  return (
    <>
      <button
        type="button"
        className={`btn btn-ghost btn-sm btn-with-icon ${className}`.trim()}
        onClick={() => setOpen(true)}
        title="Kamera bilan skanerlash"
      >
        <Icon name="search" size={16} />
        {label ?? 'Kamera'}
      </button>

      {open && (
        <div className="scan-overlay" role="dialog" aria-modal="true" onClick={close}>
          <div className="scan-modal" onClick={(e) => e.stopPropagation()}>
            <div className="scan-modal-head">
              <span>Shtrix/QR kodni ramkaga tuting</span>
              <button type="button" className="scan-close" onClick={close} aria-label="Yopish">
                <Icon name="close" size={20} />
              </button>
            </div>
            <div className="scan-video-wrap">
              <video ref={videoRef} playsInline muted className="scan-video" />
              <div className="scan-frame" />
            </div>
            {!supported && (
              <p className="scan-hint scan-hint--warn">
                Bu brauzer avtomatik o&apos;qishni qo&apos;llab-quvvatlamaydi. Kodni qo&apos;lda kiriting yoki
                Chrome (Android) dan foydalaning.
              </p>
            )}
            {error && <p className="scan-hint scan-hint--warn">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
