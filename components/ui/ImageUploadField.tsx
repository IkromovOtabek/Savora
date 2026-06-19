'use client';

import { useRef, useState } from 'react';
import Icon from '@/components/icons/Icon';

interface Props {
  name?: string;
  defaultValue?: string;
  disabled?: boolean;
}

export default function ImageUploadField({ name = 'photoUrl', defaultValue = '', disabled }: Props) {
  const [url, setUrl] = useState(defaultValue);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError('');
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Yuklash xatosi');
      setUrl(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yuklash xatosi');
    } finally {
      setUploading(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void upload(file);
    e.target.value = '';
  }

  return (
    <div className="image-upload">
      <input type="hidden" name={name} value={url} />
      {url ? (
        <div className="image-upload-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Yuklangan rasm" />
          {!disabled && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setUrl('')}>
              O&apos;chirish
            </button>
          )}
        </div>
      ) : (
        <div className="image-upload-empty">Rasm yuklanmagan</div>
      )}
      {!disabled && (
        <div className="image-upload-actions">
          <button type="button" className="btn btn-ghost btn-sm btn-with-icon" disabled={uploading} onClick={() => cameraRef.current?.click()}>
            <Icon name="camera" size={16} />
            Kamera
          </button>
          <button type="button" className="btn btn-ghost btn-sm btn-with-icon" disabled={uploading} onClick={() => galleryRef.current?.click()}>
            <Icon name="box" size={16} />
            Galereya
          </button>
        </div>
      )}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={onPick} />
      <input ref={galleryRef} type="file" accept="image/*" className="sr-only" onChange={onPick} />
      {uploading && <p className="field-hint">Yuklanmoqda...</p>}
      {error && <p className="field-hint" style={{ color: '#dc2626' }}>{error}</p>}
    </div>
  );
}
