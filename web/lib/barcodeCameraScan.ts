/** Kamera orqali shtrix/QR o'qish — BarcodeDetector yoki ZXing fallback */

export type ScanStop = () => void;

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
    };
  }
}

const VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  audio: false,
};

async function startNativeScan(video: HTMLVideoElement, onCode: (code: string) => void): Promise<ScanStop> {
  const stream = await navigator.mediaDevices.getUserMedia(VIDEO_CONSTRAINTS);
  video.srcObject = stream;
  await video.play().catch(() => {});

  const detector = new window.BarcodeDetector!({
    formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code', 'itf', 'codabar'],
  });

  let raf = 0;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const codes = await detector.detect(video);
      const value = codes[0]?.rawValue?.trim();
      if (value) {
        onCode(value);
        return;
      }
    } catch {
      /* keyingi kadr */
    }
    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);

  return () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
}

/** ZXing uchun ishonchli hint'lar — TRY_HARDER + keng tarqalgan formatlar */
async function buildZxingHints() {
  const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');
  const hints = new Map<number, unknown>();
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF, BarcodeFormat.CODABAR,
    BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX,
  ]);
  return hints;
}

async function startZxingScan(video: HTMLVideoElement, onCode: (code: string) => void): Promise<ScanStop> {
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const hints = await buildZxingHints();
  const reader = new BrowserMultiFormatReader(hints as never);
  let stopped = false;

  const controls = await reader.decodeFromConstraints(VIDEO_CONSTRAINTS, video, (result) => {
    if (stopped || !result) return;
    const value = result.getText()?.trim();
    if (value) onCode(value);
  });

  return () => {
    stopped = true;
    controls.stop();
    if (video.srcObject instanceof MediaStream) {
      video.srcObject.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
  };
}

/**
 * Bitta rasmdan (kamera bilan olingan foto yoki galereya) shtrix/QR o'qiydi.
 * Jonli kamera (getUserMedia) bloklangan platformalarda (masalan Telegram iOS
 * WebView) ishonchli fallback — barcha qurilmada ishlaydi.
 * Kod topilmasa null qaytaradi.
 */
export async function scanBarcodeFromImageFile(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    // 1) Tezkor yo'l — BarcodeDetector (Android Chrome)
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const bitmap = await createImageBitmap(file);
        const detector = new window.BarcodeDetector!({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code', 'itf', 'codabar'],
        });
        const codes = await detector.detect(bitmap as unknown as CanvasImageSource);
        const v = codes[0]?.rawValue?.trim();
        if (v) return v;
      } catch {
        /* ZXing ga o'tamiz */
      }
    }
    // 2) Universal yo'l — ZXing rasmdan o'qish (TRY_HARDER + ko'p formatli)
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const hints = await buildZxingHints();
      const reader = new BrowserMultiFormatReader(hints as never);
      const result = await reader.decodeFromImageUrl(url);
      return result?.getText()?.trim() || null;
    } catch {
      return null;
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Kamerani ishga tushiradi; kod topilganda `onCode` chaqiriladi. */
export async function startCameraBarcodeScan(
  video: HTMLVideoElement,
  onCode: (code: string) => void,
): Promise<ScanStop> {
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      return await startNativeScan(video, onCode);
    } catch {
      /* native ishlamasa ZXing ga o'tamiz */
    }
  }
  return startZxingScan(video, onCode);
}
