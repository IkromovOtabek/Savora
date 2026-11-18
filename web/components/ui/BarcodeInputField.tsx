'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import CameraScanButton from '@/components/ui/CameraScanButton';
import { useDict } from '@/lib/i18n/client';
import { GS, gtinToBarcode, isMarkingCode, parseGs1, type Gs1Code } from '@/lib/gs1';

const SCAN_GAP_MS = 80;

function decodeHidReport(data: DataView): string {
  let out = '';
  for (let i = 0; i < data.byteLength; i++) {
    const code = data.getUint8(i);
    // 29 — GS1 ajratgichi (FNC1/GS), markirovka kodida kerak
    if (code === 29) out += GS;
    else if (code >= 32 && code <= 126) out += String.fromCharCode(code);
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
  /** Qiymat o'zgarganda (yozish yoki skaner) — masalan shtrix-kod bo'yicha nom qidirish */
  onValueChange?: (value: string) => void;
  /**
   * Markirovka kodi (GS1 DataMatrix) skanerlanganda: maydonga GTIN'dan shtrix-kod (EAN-13) yoziladi,
   * to'liq kod shu callback'ga beriladi (masalan yaroqlilik/partiyani formaga qo'yish uchun)
   */
  onGs1?: (code: Gs1Code) => void;
}

export default function BarcodeInputField({
  id,
  name,
  defaultValue = '',
  disabled,
  placeholder,
  className = '',
  onScan,
  clearOnScan = false,
  defaultScanActive = false,
  onValueChange,
  onGs1,
}: Props) {
  const d = useDict();
  const inputRef = useRef<HTMLInputElement>(null);
  const bufferRef = useRef('');
  const lastKeyAtRef = useRef(0);
  const hidRef = useRef<HIDDevice | null>(null);

  const [value, setValue] = useState(defaultValue);
  const [scanActive, setScanActive] = useState(defaultScanActive);
  const [hidSupported] = useState(() => typeof navigator !== 'undefined' && 'hid' in navigator);

  const applyScan = useCallback((code: string) => {
    let cleaned = code.trim();
    if (!cleaned) return;
    // DataMatrix markirovka kodi → mahsulot shtrix-kodi (GTIN → EAN-13); to'liq kod — onGs1
    const gs1 = parseGs1(cleaned);
    if (isMarkingCode(gs1)) {
      cleaned = gtinToBarcode(gs1.gtin);
      onGs1?.(gs1);
    }
    if (clearOnScan) {
      setValue('');
      if (inputRef.current) inputRef.current.value = '';
    } else {
      setValue(cleaned);
      if (inputRef.current) inputRef.current.value = cleaned;
      onValueChange?.(cleaned);
    }
    onScan?.(cleaned);
  }, [clearOnScan, onScan, onValueChange, onGs1]);

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
        {!disabled && <CameraScanButton onScan={applyScan} variant="inline" />}
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); onValueChange?.(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) {
              e.preventDefault();
              applyScan(value);
            }
          }}
          disabled={disabled}
          placeholder={placeholder ?? d.ui.barcode.placeholder}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      {scanActive && (
        <span className="barcode-scan-status barcode-scan-status--ok">{d.ui.barcode.scanActive}</span>
      )}
    </div>
  );
}
