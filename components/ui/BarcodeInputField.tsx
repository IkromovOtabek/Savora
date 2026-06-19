'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '@/components/icons/Icon';
import CameraScanButton from '@/components/ui/CameraScanButton';

const SCAN_GAP_MS = 80;
const HID_FILTERS: HIDDeviceFilter[] = [{ usagePage: 0x008c }];

function decodeHidReport(data: DataView): string {
  let out = '';
  for (let i = 0; i < data.byteLength; i++) {
    const code = data.getUint8(i);
    if (code >= 32 && code <= 126) out += String.fromCharCode(code);
  }
  return out.trim();
}

interface Props {
  id: string;
  name: string;
  defaultValue?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export default function BarcodeInputField({
  id,
  name,
  defaultValue = '',
  disabled,
  placeholder = "Skaner yoki qo'lda",
  className = '',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const bufferRef = useRef('');
  const lastKeyAtRef = useRef(0);
  const hidRef = useRef<HIDDevice | null>(null);

  const [value, setValue] = useState(defaultValue);
  const [scanActive, setScanActive] = useState(false);
  const [hidConnected, setHidConnected] = useState(false);
  const [hidSupported] = useState(() => typeof navigator !== 'undefined' && 'hid' in navigator);

  const applyScan = useCallback((code: string) => {
    const cleaned = code.trim();
    if (!cleaned) return;
    setValue(cleaned);
    if (inputRef.current) inputRef.current.value = cleaned;
  }, []);

  const onHidReport = useCallback(
    (e: HIDInputReportEvent) => {
      const decoded = decodeHidReport(new DataView(e.data.buffer));
      if (decoded) applyScan(decoded);
    },
    [applyScan]
  );

  useEffect(() => {
    if (!hidSupported) return;
    let cancelled = false;

    (async () => {
      try {
        const devices = await navigator.hid!.getDevices();
        const existing = devices.find((d) => d.opened || d.collections.some((c) => c.usagePage === 0x008c));
        if (existing && !cancelled) {
          hidRef.current = existing;
          if (!existing.opened) await existing.open();
          existing.addEventListener('inputreport', onHidReport);
          setHidConnected(true);
        }
      } catch {
        /* klaviatura rejimi */
      }
    })();

    return () => {
      cancelled = true;
      hidRef.current?.removeEventListener('inputreport', onHidReport);
    };
  }, [hidSupported, onHidReport]);

  useEffect(() => {
    if (!scanActive || disabled) return;

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && target !== inputRef.current && target.tagName === 'INPUT') return;

      if (e.key === 'Enter') {
        if (bufferRef.current.length >= 3) {
          e.preventDefault();
          applyScan(bufferRef.current);
        }
        bufferRef.current = '';
        return;
      }

      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;

      const now = Date.now();
      if (now - lastKeyAtRef.current > SCAN_GAP_MS) bufferRef.current = '';
      lastKeyAtRef.current = now;
      bufferRef.current += e.key;

      if (target !== inputRef.current) {
        e.preventDefault();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [scanActive, disabled, applyScan]);

  async function toggleScanner() {
    if (disabled) return;

    if (scanActive) {
      setScanActive(false);
      return;
    }

    setScanActive(true);
    inputRef.current?.focus();

    if (!hidSupported || hidConnected) return;

    try {
      const device = await navigator.hid!.requestDevice({ filters: HID_FILTERS });
      if (!device) return;

      hidRef.current = device;
      if (!device.opened) await device.open();
      device.addEventListener('inputreport', onHidReport);
      setHidConnected(true);
    } catch {
      /* USB skaner tanlanmadi — klaviatura (pistalet) rejimi ishlaydi */
    }
  }

  const pistolActive = scanActive;

  return (
    <div className={`barcode-field ${className}`.trim()}>
      <div className={`barcode-input-wrap${scanActive ? ' barcode-input-wrap--active' : ''}`}>
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className={`barcode-scan-btn${scanActive ? ' barcode-scan-btn--active' : ''}`}
          onClick={toggleScanner}
          disabled={disabled}
          title={scanActive ? 'Skaner rejimini o\'chirish' : 'Shtrix skaner pistalet'}
          aria-pressed={scanActive}
        >
          <Icon name="search" size={16} />
        </button>
        {!disabled && <CameraScanButton onScan={applyScan} label="" />}
      </div>
      {pistolActive ? (
        <span className="barcode-scan-status barcode-scan-status--ok">Pistalet faol</span>
      ) : (
        <span className="barcode-scan-status barcode-scan-status--warn">
          Pistaletni kompyuterga ulang va o&apos;ngdagi tugmani bosing
        </span>
      )}
    </div>
  );
}
