import type { Model } from 'mongoose';
import { getBaseConnection } from './db';
import { userSchema, IUser } from './models/tenant/User';
import { branchSchema, IBranch } from './models/tenant/Branch';
import { productSchema, IProduct } from './models/tenant/Product';
import { customerSchema, ICustomer } from './models/tenant/Customer';
import { saleSchema, ISale } from './models/tenant/Sale';
import { creditBankSchema, ICreditBank } from './models/tenant/CreditBank';
import { cashFlowSchema, ICashFlow } from './models/tenant/CashFlow';
import { transferSchema, ITransfer } from './models/tenant/Transfer';
import { auditLogSchema, IAuditLog } from './models/tenant/AuditLog';

const TENANT_MODELS_VERSION = 5;

type TenantModelsMap = Map<string, ReturnType<typeof registerModels>>;
const globalForTenant = global as unknown as { _savdoproTenantCache?: TenantModelsMap };
if (!globalForTenant._savdoproTenantCache) {
  globalForTenant._savdoproTenantCache = new Map();
}
const tenantCache: TenantModelsMap = globalForTenant._savdoproTenantCache;

function cacheKey(dbName: string) {
  return `${dbName}:v${TENANT_MODELS_VERSION}`;
}

function registerModels(conn: import('mongoose').Connection) {
  const User = (conn.models.User as Model<IUser>) || conn.model<IUser>('User', userSchema);
  const Branch = (conn.models.Branch as Model<IBranch>) || conn.model<IBranch>('Branch', branchSchema);
  const Product = (conn.models.Product as Model<IProduct>) || conn.model<IProduct>('Product', productSchema);
  const Customer = (conn.models.Customer as Model<ICustomer>) || conn.model<ICustomer>('Customer', customerSchema);
  const Sale = (conn.models.Sale as Model<ISale>) || conn.model<ISale>('Sale', saleSchema);
  const CreditBank =
    (conn.models.CreditBank as Model<ICreditBank>) || conn.model<ICreditBank>('CreditBank', creditBankSchema);
  const CashFlow =
    (conn.models.CashFlow as Model<ICashFlow>) || conn.model<ICashFlow>('CashFlow', cashFlowSchema);
  const Transfer =
    (conn.models.Transfer as Model<ITransfer>) || conn.model<ITransfer>('Transfer', transferSchema);
  const AuditLog =
    (conn.models.AuditLog as Model<IAuditLog>) || conn.model<IAuditLog>('AuditLog', auditLogSchema);
  return { conn, User, Branch, Product, Customer, Sale, CreditBank, CashFlow, Transfer, AuditLog };
}

/**
 * Biznes egasi ma'lumotlari — alohida MongoDB database (biznes_<slug>).
 */
export async function getTenantModels(dbName: string) {
  if (!dbName) throw new Error('dbName majburiy');

  const key = cacheKey(dbName);
  const cached = tenantCache.get(key);
  if (cached) return cached;

  const base = await getBaseConnection();
  const conn = base.useDb(dbName, { useCache: false });
  const models = registerModels(conn);
  tenantCache.set(key, models);
  return models;
}

/** Kesh tozalash (test yoki migratsiyadan keyin) */
export function clearTenantModelCache() {
  tenantCache.clear();
}
