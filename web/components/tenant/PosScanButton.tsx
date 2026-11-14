'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/icons/Icon';
import CameraScanButton from '@/components/ui/CameraScanButton';
import { useDict } from '@/lib/i18n/client';

/**
 * Kassa qidiruv katagi o'ng chekkasidagi skaner tugmasi: menyudan kamera yoki
 * ulangan pistolet skaner (USB/Bluetooth — klaviatura kabi kod yozib Enter bosadi) tanlanadi.
 * Pistolet rejimi yoqilganda qidiruv katagi fokusda turadi — skanerlangan kod darhol savatchaga tushadi.
 */
export default function PosScanButton({ gunOn, onGunChange, onCode }: {
  gunOn: boolean;
  onGunChange: (on: boolean) => void;
  /** Kameradan o'qilgan kod (barqaror funksiya bo'lsin — kamera qayta ishga tushmasin) */
  onCode: (code: string) => void;
}) {
  const k = useDict().sales.pos;
  const [menu, setMenu] = useState(false);
  const [camera, setCamera] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Menyudan tashqariga bosilsa yoki Esc — yopiladi
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  return (
    <div className="pos-scan" ref={wrapRef}>
      <button
        type="button"
        className={`pos-scan-btn${gunOn ? ' is-on' : ''}`}
        onClick={() => setMenu((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menu}
        aria-label={k.scanBtn}
        title={k.scanBtn}
      >
        <Icon name="barcode" size={20} />
        {gunOn && <span className="pos-scan-dot" aria-hidden="true" />}
      </button>

      {menu && (
        <div className="pos-scan-menu" role="menu" aria-label={k.scanBtn}>
          <button type="button" role="menuitem" onClick={() => { setMenu(false); setCamera(true); }}>
            <Icon name="camera" size={18} />
            <span><b>{k.scanCamera}</b><small>{k.scanCameraSub}</small></span>
          </button>
          <button type="button" role="menuitem" aria-pressed={gunOn} onClick={() => { setMenu(false); onGunChange(!gunOn); }}>
            <Icon name="barcode" size={18} />
            <span><b>{gunOn ? k.scanGunOff : k.scanGun}</b><small>{k.scanGunSub}</small></span>
          </button>
        </div>
      )}

      <CameraScanButton variant="headless" open={camera} onOpenChange={setCamera} onScan={onCode} />
    </div>
  );
}
