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

export type RoleDoc = IRole & { _id: Types.ObjectId };
