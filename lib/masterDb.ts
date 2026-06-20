import type { Model } from 'mongoose';
import { getBaseConnection } from './db';
import { organizationSchema, IOrganization } from './models/master/Organization';
import { superAdminSchema, ISuperAdmin } from './models/master/SuperAdmin';
import { platformSettingsSchema, IPlatformSettings } from './models/master/PlatformSettings';
import { reviewSchema, IReview } from './models/master/Review';
import { paymentRequestSchema, IPaymentRequest } from './models/master/PaymentRequest';

/** Master DB modellari (Organization, SuperAdmin, Review) */
export async function getMasterModels() {
  const conn = await getBaseConnection();
  const Organization =
    (conn.models.Organization as Model<IOrganization>) ||
    conn.model<IOrganization>('Organization', organizationSchema);
  const SuperAdmin =
    (conn.models.SuperAdmin as Model<ISuperAdmin>) ||
    conn.model<ISuperAdmin>('SuperAdmin', superAdminSchema);
  const PlatformSettings =
    (conn.models.PlatformSettings as Model<IPlatformSettings>) ||
    conn.model<IPlatformSettings>('PlatformSettings', platformSettingsSchema);
  const Review =
    (conn.models.Review as Model<IReview>) ||
    conn.model<IReview>('Review', reviewSchema);
  const PaymentRequest =
    (conn.models.PaymentRequest as Model<IPaymentRequest>) ||
    conn.model<IPaymentRequest>('PaymentRequest', paymentRequestSchema);
  return { conn, Organization, SuperAdmin, PlatformSettings, Review, PaymentRequest };
}
