'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import CameraScanButton from '@/components/ui/CameraScanButton';

const SCAN_GAP_MS = 80;

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
  name?: string;
  defaultValue?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Skaner pistalet yoki kamera skanerlanganda chaqiriladi */
  onScan?: (code: string) => void;
  /** Skanerlangach input tozalansin */
  clearOnScan?: boolean;
  /** Modal ochilganda pistalet rejimi yoqilsin */
  defaultScanActive?: boolean;
}

export default function BarcodeInputField({
  id,
  name,
  defaultValue = '',
  disabled,
  placeholder = "Skaner yoki qo'lda",
  className = '',
  onScan,
  clearOnScan = false,
  defaultScanActive = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const bufferRef = useRef('');
  const lastKeyAtRef = useRef(0);
  const hidRef = useRef<HIDDevice | null>(null);

  const [value, setValue] = useState(defaultValue);
  const [scanActive, setScanActive] = useState(defaultScanActive);
  const [hidSupported] = useState(() => typeof navigator !== 'undefined' && 'hid' in navigator);

  const applyScan = useCallback((code: string) => {
    const cleaned = code.trim();
    if (!cleaned) return;
    if (clearOnScan) {
      setValue('');
      if (inputRef.current) inputRef.current.value = '';
    } else {
      setValue(cleaned);
      if (inputRef.current) inputRef.current.value = cleaned;
    }
    onScan?.(cleaned);
  }, [clearOnScan, onScan]);

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
    if (!defaultScanActive || disabled) return;
    setScanActive(true);
    inputRef.current?.focus();
  }, [defaultScanActive, disabled]);

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
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) {
              e.preventDefault();
              applyScan(value);
            }
          }}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
        />
        {!disabled && <CameraScanButton onScan={applyScan} label="" />}
      </div>
      {scanActive && (
        <span className="barcode-scan-status barcode-scan-status--ok">Pistalet faol</span>
      )}
    </div>
  );
}
