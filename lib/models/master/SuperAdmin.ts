import { Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface ISuperAdmin {
  username: string;
  password: string;
  tokenVersion: number;
  comparePassword(candidate: string): Promise<boolean>;
}

export const superAdminSchema = new Schema<ISuperAdmin>(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'superadmins' }
);

superAdminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

superAdminSchema.methods.comparePassword = function (this: { password: string }, candidate: string) {
  return bcrypt.compare(candidate, this.password);
};
