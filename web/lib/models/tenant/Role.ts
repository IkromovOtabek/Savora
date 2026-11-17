import { Schema, Types } from 'mongoose';
import { PERMISSIONS_VERSION, type PermissionKey } from '../../permissions';

/**
 * Xodim roli (BILLZ: "Rollar") — nomli huquqlar to'plami. Xodimga biriktirilsa (User.roleId),
 * uning huquqlari shu roldan olinadi; rol o'zgarsa — barcha biriktirilganlarga darhol ta'sir qiladi.
 */
export interface IRole {
  name: string;
  permissions: string[];
  /** permissions qaysi katalog versiyasida saqlangan; yo'q — 1 (eski ro'yxat lazy yangilanadi) */
  permVersion?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export const roleSchema = new Schema<IRole>(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    permissions: { type: [String], default: [] },
    permVersion: { type: Number },
  },
  { timestamps: true, collection: 'roles' }
);

roleSchema.index({ name: 1 }, { unique: true });

/** Do'konda rol bo'lmasa — tayyor shablonlar */
export const DEFAULT_ROLES: { name: string; permissions: PermissionKey[]; permVersion: number }[] = [
  {
    name: 'Kassir',
    permissions: [
      'sale.create', 'sales.view', 'kassa.view', 'kassa.shift', 'customers.view', 'customers.manage',
      'debts.view', 'payment.accept', 'nasiya.view', 'tasks.view', 'profile.password',
    ],
    permVersion: PERMISSIONS_VERSION,
  },
  {
    name: 'Sotuvchi',
    permissions: [
      'sale.create', 'sale.discount', 'sales.view', 'kassa.view', 'kassa.shift',
      'products.view', 'product.create', 'transfer.create', 'inventory.view', 'transferred.view',
      'customers.view', 'customers.manage', 'debts.view', 'payment.accept', 'nasiya.view',
      'daftar.manage', 'daftar.delete', 'tasks.view', 'profile.password',
    ],
    permVersion: PERMISSIONS_VERSION,
  },
  {
    name: 'Menejer',
    permissions: [
      'sale.create', 'sale.discount', 'sale.editPrice', 'sales.view', 'sale.cancel', 'sale.return',
      'kassa.view', 'kassa.shift',
      'products.view', 'product.create', 'product.edit', 'product.delete', 'product.viewCost', 'catalog.manage', 'transfer.create',
      'inventory.view', 'stock.adjust', 'stock.writeOff', 'transferred.view', 'suppliers.view', 'suppliers.manage', 'suppliers.delete',
      'customers.view', 'customers.manage', 'debts.view', 'payment.accept', 'nasiya.view', 'daftar.manage', 'daftar.delete',
      'reports.view', 'export.data', 'ai.view', 'tasks.view', 'tasks.manage', 'profile.password',
    ],
    permVersion: PERMISSIONS_VERSION,
  },
];

/**
 * Restoran rol shablonlari (docs/business/TAKLIF_2026-11_SHABLONLAR.md §1.6). Restoran turidagi do'konda
 * NOMI bo'yicha yo'q bo'lsa qo'shiladi (lib/roles.ts → ensureDefaultRoles) — egasi tahrirlagan rol ustidan yozilmaydi.
 */
export const RESTAURANT_ROLES: { name: string; permissions: PermissionKey[]; permVersion: number }[] = [
  {
    // O'z stollari: stol ochish, taom qo'shish, yuborish, yetkazildi, pre-chek; stop-list menyuda ko'rinadi
    name: 'Ofitsant',
    permissions: ['order.create', 'tasks.view', 'profile.password'],
    permVersion: PERMISSIONS_VERSION,
  },
  {
    name: 'Oshpaz',
    permissions: ['kitchen.view', 'kitchen.bump', 'menu.stopList', 'tasks.view', 'profile.password'],
    permVersion: PERMISSIONS_VERSION,
  },
  {
    // Oshpaz huquqlari (bar stansiyasi ekranida) + peshtaxtada buyurtma
    name: 'Barmen',
    permissions: ['kitchen.view', 'kitchen.bump', 'menu.stopList', 'order.create', 'tasks.view', 'profile.password'],
    permVersion: PERMISSIONS_VERSION,
  },
  {
    // Mavjud «Kassir» + barcha buyurtmalar, to'lov, hisobni bo'lish
    name: 'Kassir (restoran)',
    permissions: [
      'sale.create', 'sales.view', 'kassa.view', 'kassa.shift', 'customers.view', 'customers.manage',
      'debts.view', 'payment.accept', 'order.create', 'order.viewAll', 'order.split', 'tasks.view', 'profile.password',
    ],
    permVersion: PERMISSIONS_VERSION,
  },
  {
    // Stol o'tkazish, bekor qilish, qayta ochish, chegirma, stollar sozlamasi, hisobotlar, hisobdan chiqarish
    name: 'Administrator',
    permissions: [
      'sale.create', 'sale.discount', 'sales.view', 'sale.cancel', 'sale.return', 'kassa.view', 'kassa.shift',
      'products.view', 'product.edit', 'stock.writeOff', 'customers.view', 'debts.view', 'payment.accept',
      'order.create', 'order.viewAll', 'order.transfer', 'order.voidItem', 'order.split', 'order.reopen',
      'kitchen.view', 'kitchen.bump', 'menu.stopList', 'tables.manage',
      'reports.view', 'tasks.view', 'tasks.manage', 'profile.password',
    ],
    permVersion: PERMISSIONS_VERSION,
  },
];

export type RoleDoc = IRole & { _id: Types.ObjectId };
