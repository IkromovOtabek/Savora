import { Schema, Types } from 'mongoose';
import type { PermissionKey } from '../../permissions';

/**
 * Xodim roli (BILLZ: "Rollar") — nomli huquqlar to'plami. Xodimga biriktirilsa (User.roleId),
 * uning huquqlari shu roldan olinadi; rol o'zgarsa — barcha biriktirilganlarga darhol ta'sir qiladi.
 */
export interface IRole {
  name: string;
  permissions: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export const roleSchema = new Schema<IRole>(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    permissions: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'roles' }
);

roleSchema.index({ name: 1 }, { unique: true });

/** Do'konda rol bo'lmasa — tayyor shablonlar */
export const DEFAULT_ROLES: { name: string; permissions: PermissionKey[] }[] = [
  {
    name: 'Kassir',
    permissions: ['sale.create', 'payment.accept', 'kassa.view', 'kassa.shift', 'customers.manage'],
  },
  {
    name: 'Sotuvchi',
    permissions: ['sale.create', 'sale.discount', 'payment.accept', 'product.create', 'transfer.create', 'kassa.view', 'kassa.shift', 'customers.manage', 'daftar.manage'],
  },
  {
    name: 'Menejer',
    permissions: [
      'sale.create', 'sale.cancel', 'sale.discount', 'sale.editPrice', 'payment.accept',
      'product.create', 'product.edit', 'product.delete', 'product.viewCost', 'transfer.create', 'stock.adjust', 'suppliers.manage',
      'kassa.view', 'kassa.shift', 'reports.view', 'customers.manage', 'export.data', 'daftar.manage', 'ai.view', 'tasks.manage',
    ],
  },
];

export type RoleDoc = IRole & { _id: Types.ObjectId };
