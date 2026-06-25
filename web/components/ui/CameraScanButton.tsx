'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '@/components/icons/Icon';
import { startCameraBarcodeScan } from '@/lib/barcodeCameraScan';

interface Props {
  onScan: (code: string) => void;
  /** Tugma matni (ixtiyoriy) */
  label?: string;
  className?: string;
}

/** Telefon/noutbuk kamerasi orqali shtrix yoki QR kodni skanerlaydi (barcha zamonaviy brauzerlar). */
export default function CameraScanButton({ onScan, label, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopScanRef = useRef<(() => void) | null>(null);
  const handledRef = useRef(false);

  const stop = useCallback(() => {
    stopScanRef.current?.();
    stopScanRef.current = null;
    setScanning(false);
  }, []);

  const close = useCallback(() => {
    stop();
    setOpen(false);
    setError('');
    handledRef.current = false;
  }, [stop]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    handledRef.current = false;

    (async () => {
      await new Promise((r) => requestAnimationFrame(r));
      const video = videoRef.current;
      if (!video || cancelled) return;

      try {
        setScanning(true);
        const stopScan = await startCameraBarcodeScan(video, (code) => {
          if (cancelled || handledRef.current) return;
          handledRef.current = true;
          onScan(code);
          close();
        });
        if (cancelled) {
          stopScan();
          return;
        }
        stopScanRef.current = stopScan;
      } catch {
        if (!cancelled) {
          setError('Kameraga ruxsat bering yoki boshqa brauzerda urinib ko\'ring.');
          setScanning(false);
        }
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
              <video ref={videoRef} playsInline muted autoPlay className="scan-video" />
              <div className="scan-frame" />
            </div>
            {scanning && !error && (
              <p className="scan-hint">Kod avtomatik o&apos;qiladi — Safari, Chrome, Firefox va mobil brauzerlarda ishlaydi.</p>
            )}
            {error && <p className="scan-hint scan-hint--warn">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
