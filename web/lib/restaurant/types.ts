/**
 * Restoran moduli — umumiy turlar va holatlar (DB importi yo'q: client, server, mobil API bir xil ishlatadi).
 * To'liq hujjat: docs/RESTORAN_API.md.
 */

/** Buyurtma turi: zalda (stol) / saboy (olib ketish) / mijoz QR orqali o'zi */
export const ORDER_TYPES = ['dine_in', 'takeaway', 'qr_self'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

/** Buyurtma holati: ochiq → pre-chek (hisob chiqdi) → to'landi; yoki bekor */
export const ORDER_STATUSES = ['open', 'precheck', 'paid', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Buyurtma kim tomonidan ochilgan */
export const ORDER_SOURCES = ['waiter', 'qr', 'cashier'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

/**
 * Taom (buyurtma qatori) holati:
 *   pending — mijoz QR orqali qo'shgan, ofitsant tasdiqlamagan (oshxonaga ketmaydi, ombor band emas);
 *   new     — qo'shilgan, hali yuborilmagan;
 *   sent    — oshxonaga yuborildi (ombor band qilindi);
 *   cooking — oshpaz boshladi; ready — tayyor; served — stolga yetkazildi;
 *   voided  — bekor qilindi (yuborilgandan keyin — sabab va huquq bilan).
 */
export const ITEM_STATUSES = ['pending', 'new', 'sent', 'cooking', 'ready', 'served', 'voided'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** Oshxona ekranida (KDS) ko'rinadigan holatlar */
export const KDS_STATUSES: readonly ItemStatus[] = ['sent', 'cooking', 'ready'];
/** Ombor band qilingan (yuborilgan) holatlar */
export const RESERVED_STATUSES: readonly ItemStatus[] = ['sent', 'cooking', 'ready', 'served'];
/** Hali yuborilmagan holatlar */
export const UNSENT_STATUSES: readonly ItemStatus[] = ['pending', 'new'];

/** Stansiya turi: oshxona yoki bar */
export const STATION_KINDS = ['kitchen', 'bar'] as const;
export type StationKind = (typeof STATION_KINDS)[number];

/**
 * Menyu bo'limi: oshxona (taomlar) yoki bar (ichimlik va bar mahsulotlari). `Product.menuSection`; belgisi yo'q eski
 * band — stansiyasi bar bo'lsa «bar», aks holda «oshxona» (menuFlags.ts → menuSectionOf).
 */
export const MENU_SECTIONS = ['kitchen', 'bar'] as const;
export type MenuSection = (typeof MENU_SECTIONS)[number];

/** Taomni bekor qilish bosqichi: yuborilmagan / yuborilgan, tayyorlash boshlanmagan (ombor qaytadi) / boshlangan (yo'qotish) */
export const VOID_STAGES = ['unsent', 'beforeCook', 'afterCook'] as const;
export type VoidStage = (typeof VOID_STAGES)[number];

/** Oshxona printeri varag'i: yuborilgan taomlar / bekor qilingan taom («BEKOR QILINDI») */
export const PRINT_JOB_KINDS = ['order', 'void'] as const;
export type PrintJobKind = (typeof PRINT_JOB_KINDS)[number];
/** Varaq holati: navbatda (chop etilmagan) / chop etildi */
export const PRINT_JOB_STATUSES = ['pending', 'printed'] as const;
export type PrintJobStatus = (typeof PRINT_JOB_STATUSES)[number];

/** Mijoz QR orqali chaqiruvi */
export const TABLE_CALL_KINDS = ['waiter', 'bill'] as const;
export type TableCallKind = (typeof TABLE_CALL_KINDS)[number];

/** Chegaralar (validatsiya va hujjat bilan bir xil) */
export const RESTAURANT_LIMITS = {
  /** Bitta buyurtmadagi qatorlar (bekor qilinganlar ham) */
  maxOrderItems: 200,
  /** Bitta so'rovda qo'shiladigan taomlar */
  maxAddItems: 50,
  /** Mijoz QR orqali bitta so'rovda */
  maxQrItems: 30,
  /** Mijoz QR orqali bitta taom miqdori */
  maxQrQty: 20,
  /** Bitta taom miqdori */
  maxItemQty: 1000,
  maxGuests: 100,
  maxTableNumber: 9999,
  maxSeats: 100,
  maxServiceChargePct: 30,
  maxModifierGroups: 10,
  maxModifierOptions: 20,
  noteMax: 200,
  voidReasonMax: 200,
} as const;

export interface OrderModifier {
  /** Guruh nomi (masalan «Porsiya») */
  group: string;
  /** Tanlangan variant (masalan «Katta») */
  name: string;
  /** Qo'shimcha narx (so'm, 0 bo'lishi mumkin) */
  price: number;
}

/** Mahsulotdagi modifikator guruhi (Product.modifierGroups) */
export interface ModifierGroupInput {
  name: string;
  required: boolean;
  /** Eng kam tanlov (required bo'lsa ≥ 1) */
  min: number;
  /** Eng ko'p tanlov */
  max: number;
  options: { name: string; price: number }[];
}

/** Restoran sozlamalari (ShopSettings.restaurant) */
export interface RestaurantSettings {
  /** Xizmat haqi, % (0–30). Saboy va QR o'zi buyurtmada — doim 0 */
  serviceChargePct: number;
  /** Saboy qadoq haqi (so'm, butun buyurtmaga bir marta) */
  takeawayPackFee: number;
  /** Yuborilgan taomni bekor qilishda sabab majburiy */
  requireVoidReason: boolean;
  /** KDS: shuncha daqiqadan keyin sariq */
  kdsWarnMinutes: number;
  /** KDS: shuncha daqiqadan keyin qizil */
  kdsAlertMinutes: number;
  /**
   * Bildirishnoma (lib/restaurant/stockAlerts.ts): taomga shuncha yoki kamroq porsiya qolganda (va tugaganda) xabar.
   * 0 — o'chiq. Standart 5
   */
  lowPortions: number;
  brand: {
    logoUrl?: string;
    /** #RRGGBB */
    color?: string;
    coverUrl?: string;
  };
  /** Mijoz sahifasi (/m/<slug>) uchun ochiq aloqa ma'lumoti — hammasi ixtiyoriy (lib/restaurant/info.ts) */
  info: RestaurantInfo;
}

/** Restoranning ochiq ma'lumoti (mijoz sahifasida, QR plakatda). Bo'sh maydon ko'rsatilmaydi */
export interface RestaurantInfo {
  /** Qisqa tavsif */
  about?: string;
  address?: string;
  /** «+998 90 123 45 67» (lib/phone → canonicalPhone) */
  phone?: string;
  /** Erkin matn: «Har kuni 10:00 – 23:00» */
  workHours?: string;
  /** Instagram login (@ siz) */
  instagram?: string;
  /** Telegram login (@ siz) */
  telegram?: string;
  /** Telefon orqali saboy (olib ketish) buyurtma qabul qilinadi — sahifada raqam shu belgi bilan chiqadi */
  takeawayByPhone?: boolean;
}

export const DEFAULT_RESTAURANT_SETTINGS: RestaurantSettings = {
  serviceChargePct: 0,
  takeawayPackFee: 0,
  requireVoidReason: true,
  kdsWarnMinutes: 10,
  kdsAlertMinutes: 20,
  lowPortions: 5,
  brand: {},
  info: {},
};
