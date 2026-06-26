'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '@/components/icons/Icon';
import { startCameraBarcodeScan, scanBarcodeFromImageFile } from '@/lib/barcodeCameraScan';

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
  const [photoBusy, setPhotoBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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
          setError('Jonli kamera ochilmadi — pastdagi “Rasmga olib o‘qish” tugmasidan foydalaning.');
          setScanning(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [open, onScan, close, stop]);

  // Fallback: kamera bilan foto olib, rasmdan kod o'qish (har platformada ishlaydi)
  const onPhoto = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    setError('');
    try {
      const code = await scanBarcodeFromImageFile(file);
      if (code) {
        handledRef.current = true;
        onScan(code);
        close();
      } else {
        setError('Kod topilmadi — yorug‘ joyda, kodni to‘ldirib qayta suratga oling.');
      }
    } finally {
      setPhotoBusy(false);
    }
  }, [onScan, close]);

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
              <p className="scan-hint">Kod avtomatik o&apos;qiladi. Ishlamasa — “Rasmga olib o‘qish”.</p>
            )}
            {error && <p className="scan-hint scan-hint--warn">{error}</p>}
            <div className="scan-actions">
              <button
                type="button"
                className="btn btn-primary btn-with-icon"
                onClick={() => fileRef.current?.click()}
                disabled={photoBusy}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <Icon name="camera" size={18} />
                {photoBusy ? 'O‘qilmoqda…' : 'Kamera bilan suratga olib o‘qish'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onPhoto}
                style={{ display: 'none' }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
