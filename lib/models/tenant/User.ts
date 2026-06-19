import { Schema, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

/**
 * Tenant (do'kon) foydalanuvchisi.
 *  - admin = do'kon egasi (kichik admin)
 *  - user  = filial (login parol filialga beriladi)
 * Har filialning o'z login/paroli bor; branchId tegishli filialga bog'laydi.
 */
export interface IUser {
  username: string;
  password: string;
  role: 'admin' | 'user';
  fullName?: string;
  /** Filial-login bo'lsa — tegishli filial _id */
  branchId?: Types.ObjectId;
  mustChangePassword?: boolean;
  tokenVersion: number;
  active: boolean;
  comparePassword(candidate: string): Promise<boolean>;
}

export const userSchema = new Schema<IUser>(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    fullName: { type: String, trim: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    mustChangePassword: { type: Boolean, default: false },
    tokenVersion: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'users' }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (this: { password: string }, candidate: string) {
  return bcrypt.compare(candidate, this.password);
};
