import { api } from './api';

/**
 * Barkod yorlig'i — web'dagi «Barkod chop etish» bilan bir xil: HTML serverda yasaladi
 * (/api/mobile/labels → web/lib/labels/render.ts), ilova uni faqat chop etadi.
 */
export interface LabelData {
  /** Do'kon sozlamasi (web: Sozlamalar → Barkod yorlig'i); o'lcham mm'da */
  settings: { width: number; height: number; copies: number; autoPrint: boolean };
  items: { id: string; name: string; code: string; codeKind: string; available: number; imeiPending: boolean }[];
  /** HTML shu nusxa soni bilan yasalgan */
  copies: number;
  perUnit: boolean;
  /** HTML'dagi yorliqlar soni */
  total: number;
  warnings: { imeiPending: number; noCode: string | null; tight: boolean };
  html: string;
}

/** `copies` berilmasa — do'kon sozlamasidagi nusxa soni */
export function fetchLabels(
  ids: string[],
  opts: { copies?: number; perUnit?: boolean; timeoutMs?: number } = {},
): Promise<LabelData> {
  const q = [`ids=${ids.map(encodeURIComponent).join(',')}`];
  if (opts.copies) q.push(`copies=${opts.copies}`);
  if (opts.perUnit) q.push('perUnit=1');
  return api<LabelData>(`/api/mobile/labels?${q.join('&')}`, opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {});
}

const PT_PER_MM = 72 / 25.4;

/** iOS: foydalanuvchi chop etish oynasini yopdi (ExpoPrint PrintIncompleteException) */
function isCancel(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  return err?.code === 'ERR_PRINT_INCOMPLETE' || /did not complete/i.test(err?.message ?? '');
}

/**
 * Avval yorliq o'lchamidagi PDF (bitta yorliq = bitta sahifa), keyin tizim chop etish oynasi (AirPrint /
 * Android chop etish xizmati). HTML'ni to'g'ridan-to'g'ri berilsa Android sahifani printer qog'ozi bo'yicha
 * qayta taxlaydi — PDF orqali ikki platformada ham sahifa aynan yorliq o'lchamida.
 * O'lcham yuqoriga yaxlitlanadi (Android butun nuqta qabul qiladi): sahifa yorliqdan 0.3 mm gacha katta
 * bo'ladi, kichik bo'lsa yorliq ikki sahifaga bo'linib ketardi.
 * Natija: true — chop etildi (Android: oyna ochildi), false — bekor qilindi.
 */
export async function printLabels(data: Pick<LabelData, 'html' | 'settings'>): Promise<boolean> {
  // Native modul faqat chop etishda yuklanadi: u yo'q eski build'da (dev-client) ilova ochilishda yiqilmaydi —
  // faqat shu amal xato beradi (chaqiruvchi «Chop etib bo'lmadi» deydi)
  const Print = await import('expo-print');
  const width = Math.ceil(data.settings.width * PT_PER_MM);
  const height = Math.ceil(data.settings.height * PT_PER_MM);
  const { uri } = await Print.printToFileAsync({
    html: data.html,
    width,
    height,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  try {
    await Print.printAsync({ uri });
    return true;
  } catch (e) {
    if (isCancel(e)) return false;
    throw e;
  }
}
