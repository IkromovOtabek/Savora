'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '@/components/icons/Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

export default function CameraCaptureModal({ open, onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [capturing, setCapturing] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const close = useCallback(() => {
    stop();
    setError('');
    setCapturing(false);
    onClose();
  }, [onClose, stop]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setError('');

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
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
      } catch {
        if (!cancelled) setError('Kameraga ruxsat berilmadi yoki kamera topilmadi.');
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [open, stop]);

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    setCapturing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas xatosi');

      ctx.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.92);
      });
      if (!blob) throw new Error('Rasm yaratilmadi');

      const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
      onCapture(file);
      close();
    } catch {
      setError('Suratga olishda xatolik.');
    } finally {
      setCapturing(false);
    }
  }

  if (!open) return null;

  return (
    <div className="scan-overlay" role="dialog" aria-modal="true" onClick={close}>
      <div className="scan-modal" onClick={(e) => e.stopPropagation()}>
        <div className="scan-modal-head">
          <span>Rasmga oling</span>
          <button type="button" className="scan-close" onClick={close} aria-label="Yopish">
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="scan-video-wrap scan-video-wrap--photo">
          <video ref={videoRef} playsInline muted className="scan-video" />
        </div>
        {error ? (
          <p className="scan-hint scan-hint--warn">{error}</p>
        ) : (
          <div className="scan-capture-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm btn-with-icon"
              onClick={capturePhoto}
              disabled={capturing || !!error}
            >
              <Icon name="camera" size={16} />
              {capturing ? 'Olinmoqda...' : 'Suratga olish'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
