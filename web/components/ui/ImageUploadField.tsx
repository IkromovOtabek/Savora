'use client';

import { useRef, useState } from 'react';
import Icon from '@/components/icons/Icon';
import CameraCaptureModal from '@/components/ui/CameraCaptureModal';
import { useDict } from '@/lib/i18n/client';

interface Props {
  name?: string;
  defaultValue?: string;
  disabled?: boolean;
}

export default function ImageUploadField({ name = 'photoUrl', defaultValue = '', disabled }: Props) {
  const d = useDict();
  const t = d.ui.upload;
  const [url, setUrl] = useState(defaultValue);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError('');
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.error);
      setUrl(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.error);
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
          <img src={url} alt={t.uploadedAlt} />
          {!disabled && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setUrl('')}>
              {d.common.delete}
            </button>
          )}
        </div>
      ) : (
        <div className="image-upload-empty">{t.empty}</div>
      )}
      {!disabled && (
        <div className="image-upload-actions">
          <button type="button" className="btn btn-ghost btn-sm btn-with-icon" disabled={uploading} onClick={() => setCameraOpen(true)}>
            <Icon name="camera" size={16} />
            {t.camera}
          </button>
          <button type="button" className="btn btn-ghost btn-sm btn-with-icon" disabled={uploading} onClick={() => galleryRef.current?.click()}>
            <Icon name="box" size={16} />
            {t.gallery}
          </button>
        </div>
      )}
      <input ref={galleryRef} type="file" accept="image/*" className="sr-only" onChange={onPick} />
      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => void upload(file)}
      />
      {uploading && <p className="field-hint">{d.common.loading}</p>}
      {error && <p className="field-hint" style={{ color: 'var(--danger)' }} role="alert">{error}</p>}
    </div>
  );
}
