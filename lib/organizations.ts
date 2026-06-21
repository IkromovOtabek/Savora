import { getMasterModels } from './masterDb';
import { getTenantModels } from './tenantDb';
import { ensureTenantDatabase } from './tenantSetup';
import { IOrganization, isOrganizationActive } from './models/master/Organization';
import { defaultFeaturesForPlan } from './features';
import { parseBusinessType, BusinessType } from './businessTypes';
import { getPlanPreset, parsePlanTier, PlanTier } from './plans';
import { normalizeSlug, tenantDbName, validateSlug } from './slug';
import { generateTempPassword } from './credentials';

function generateReferralCode(slug: string): string {
  const base = slug.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4).padEnd(4, 'X');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${base}${rand}`;
}

export { normalizeSlug, validateSlug } from './slug';
export { tenantLoginUrl, tenantAppUrl, moduleLink } from './urls';

export { updateOrganization, type UpdateOrganizationInput } from './orgUpdate';
export type { OrgStatus } from './orgUpdate';

export function getOrgDisplayStatus(org: Pick<IOrganization, 'status' | 'expiresAt'>): {
  key: 'active' | 'expired' | 'suspended';
  label: string;
} {
  if (org.status === 'suspended') return { key: 'suspended', label: "To'xtatilgan" };
  if (org.status === 'expired' || !isOrganizationActive(org)) return { key: 'expired', label: 'Muddati tugagan' };
  return { key: 'active', label: 'Faol' };
}

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  ownerName?: string;
  phone?: string;
  adminUsername?: string;
  adminPassword?: string;
  planTier: PlanTier;
  businessType?: BusinessType;
  trialDays?: number;
  expiresAt?: Date;
  maxFilial?: number;
  maxUsers?: number;
  maxProducts?: number;
  monthlyPayment?: number;
  agreementNote?: string;
  mustChangePassword?: boolean;
  referredBy?: string;
  billingCycle?: 'monthly' | 'yearly';
  /** Sinov rejimi — muddati tugagach to'lov talab qilinadi */
  isTrial?: boolean;
}

export async function createOrganization(input: CreateOrganizationInput): Promise<{ orgId: string; slug: string; adminUsername: string }> {
  const name = input.name.trim();
  const slug = normalizeSlug(input.slug);
  let adminUsername = (input.adminUsername || '').trim().toLowerCase();
  let adminPassword = input.adminPassword || '';

  if (!name) throw new Error('Do\'kon nomi kiritilishi shart.');
  const slugErr = validateSlug(slug);
  if (slugErr) throw new Error(slugErr);

  // Login majburiy — egasi o'zi tanlaydi (avtomatik/tasodifiy login yo'q)
  adminUsername = adminUsername.replace(/[^a-z0-9_]/g, '');
  if (!adminUsername || adminUsername.length < 3) {
    throw new Error('Admin login kamida 3 ta belgidan iborat bo\'lishi kerak (lotin harf, raqam, _).');
  }
  if (!adminPassword) adminPassword = generateTempPassword();
  if (adminPassword.length < 6) throw new Error('Parol kamida 6 ta belgidan iborat bo\'lishi kerak.');

  const tier = parsePlanTier(input.planTier);
  const preset =
    tier === 'custom'
      ? getPlanPreset('custom')
      : await (async () => {
          const { getPlanPresetEffective } = await import('./platformSettings');
          return getPlanPresetEffective(tier);
        })();
  if (tier === 'custom' && !input.agreementNote?.trim()) {
    throw new Error('Kelishuv tarifida kelishuv matni kiritilishi shart.');
  }

  // Free tier: muddatsiz (100 yil), boshqa: trial yoki belgilangan sana
  const isFree = tier === 'free';
  const expiresAt =
    input.expiresAt ??
    (isFree
      ? new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + (input.trialDays ?? 30) * 24 * 60 * 60 * 1000));

  const dbName = tenantDbName(slug);
  const { Organization } = await getMasterModels();

  const existing = await Organization.findOne({ $or: [{ slug }, { dbName }] }).lean();
  if (existing) throw new Error('Bu manzil allaqachon band. Boshqa manzil tanlang.');

  // Referral bonus tekshirish
  let referralBonusMonths = 0;
  if (input.referredBy) {
    const referrer = await Organization.findOne({ referralCode: input.referredBy.toUpperCase() }).lean();
    if (referrer) referralBonusMonths = 1;
  }

  // Referral code yaratish (unique bo'lgunicha)
  let referralCode = generateReferralCode(slug);
  let attempt = 0;
  while (await Organization.exists({ referralCode }) && attempt < 5) {
    referralCode = generateReferralCode(slug + attempt++);
  }

  const org = await Organization.create({
    name,
    slug,
    dbName,
    ownerName: input.ownerName?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    adminUsername,
    businessType: input.businessType ?? 'general',
    status: 'active',
    expiresAt,
    plan: {
      tier: preset.tier,
      maxFilial: input.maxFilial ?? preset.maxFilial,
      maxUsers: input.maxUsers ?? preset.maxUsers,
      maxProducts: input.maxProducts ?? preset.maxProducts,
      monthlyPayment: isFree ? 0 : (input.monthlyPayment ?? preset.monthlyPrice),
      billingCycle: input.billingCycle ?? 'monthly',
      agreementNote: tier === 'custom' ? input.agreementNote?.trim() : undefined,
      isTrial: input.isTrial ?? false,
    },
    features: defaultFeaturesForPlan(preset.tier),
    referralCode,
    referredBy: input.referredBy?.toUpperCase() || undefined,
    referralBonusMonths,
    onboarding: { branchCreated: false, productAdded: false, saleMade: false, profileCompleted: false },
  });

  await ensureTenantDatabase(dbName);
  const { User } = await getTenantModels(dbName);
  const existingUser = await User.findOne({ username: adminUsername }).lean();
  if (existingUser) {
    await Organization.findByIdAndDelete(org._id);
    throw new Error('Bu login allaqachon mavjud.');
  }

  const user = new User({
    username: adminUsername,
    password: adminPassword,
    role: 'admin',
    active: true,
    mustChangePassword: input.mustChangePassword ?? true,
    fullName: input.ownerName?.trim() || undefined,
  });

  try {
    await user.save();
    // Asosiy filial avtomatik yaratilmaydi — admin Kabinet > Jamoa orqali filial qo'shadi.
  } catch {
    await Organization.findByIdAndDelete(org._id);
    throw new Error('Admin yaratishda xatolik. Qayta urinib ko\'ring.');
  }

  return { orgId: String(org._id), slug, adminUsername };
}

/** Super Admin — faqat ko'rish (login + bcrypt hash) */
export async function getOrgAdminCredentials(
  org: Pick<IOrganization, 'dbName' | 'adminUsername'>,
): Promise<{ username: string; passwordHash: string }> {
  let username = org.adminUsername ?? '';
  let passwordHash = '';

  try {
    const { User } = await getTenantModels(org.dbName);
    const admin = await User.findOne({ role: 'admin', active: true })
      .sort({ createdAt: 1 })
      .select('username password')
      .lean();
    if (admin) {
      username = admin.username;
      passwordHash = admin.password;
    }
  } catch {
    /* tenant DB yo'q */
  }

  return { username, passwordHash };
}
