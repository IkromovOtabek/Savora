/**
 * Ilova ichidagi bildirishnomalar (web qo'ng'iroqcha + mobil ro'yxat + push).
 *
 * SHARTNOMA (interfeys) — boshqa modullar faqat `notify()` ni chaqiradi; ichki saqlash, push va ro'yxat shu faylda.
 * Matn bazaga yozilmaydi: `kind` + `params` saqlanadi, matn ko'ruvchining tilida lug'atdan (`d.notify`) chiqadi;
 * push matni — uz (mavjud cron bildirishnomalari kabi).
 *
 * `notify()` hech qachon xato tashlamaydi (xatoni log qiladi) — chaqiruvchi amalni (taom yuborish, QR chaqiruv) to'xtatmaydi.
 */
import type { PermissionKey } from './permissions';

export type NotifyKind =
  /** Xom ashyo minimal qoldiqdan tushdi — params: { product, qty, unit?, min, branch? } */
  | 'lowStock'
  /** Taomga oz porsiya qoldi yoki tugadi — params: { dish, portions, branch? } */
  | 'dishLow'
  /** Mijoz QR orqali ofitsantni chaqirdi — params: { table } */
  | 'waiterCall'
  /** Mijoz QR orqali hisob so'radi — params: { table } */
  | 'billCall'
  /** Bron yaqinlashdi — params: { table, time, name, guests } */
  | 'reservationSoon';

export type NotifyParams = Record<string, string | number | null | undefined>;

export interface NotifyInput {
  kind: NotifyKind;
  /** Filial: xabar shu filial xodimlariga boradi (do'kon egasi — har doim). Yo'q — butun do'kon */
  branchId?: string | null;
  /** Matn parametrlari (yuqoridagi `NotifyKind` izohlari) */
  params: NotifyParams;
  /** Bosilganda ochiladigan web yo'li, masalan '/app/tables' (mobil o'z ekraniga moslaydi) */
  url?: string;
  /**
   * Kimga: aniq foydalanuvchilar (`userIds`) va/yoki shu huquqlardan biri bor xodimlar (`anyPermission`, filial bo'yicha).
   * `admins: true` — do'kon egasi(lar)i ham.
   */
  audience: { userIds?: string[]; anyPermission?: PermissionKey[]; admins?: boolean };
  /** Takrorlanmaslik kaliti: shu kalitli xabar yaqinda yaratilgan bo'lsa — yangisi yaratilmaydi */
  dedupeKey?: string;
}

/** Do'kon: `id` — Organization _id, `dbName` — tenant baza nomi */
export interface NotifyOrg { id: string; dbName: string }

export async function notify(org: NotifyOrg, input: NotifyInput): Promise<void> {
  // Asos (stub) — bildirishnomalar agenti amalga oshiradi. Imzo o'zgarmaydi.
  void org;
  void input;
}
