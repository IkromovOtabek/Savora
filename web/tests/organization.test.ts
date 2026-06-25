import { describe, it, expect } from 'vitest';
import {
  isOrganizationActive,
  isTrialActive,
  daysUntilExpiry,
  onboardingProgress,
} from '@/lib/models/master/Organization';

const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
const past = new Date(Date.now() - 24 * 60 * 60 * 1000);

describe('Organization — holat va muddat', () => {
  it('isOrganizationActive: faol va muddat tugamagan', () => {
    expect(isOrganizationActive({ status: 'active', expiresAt: future })).toBe(true);
    expect(isOrganizationActive({ status: 'active', expiresAt: past })).toBe(false);
    expect(isOrganizationActive({ status: 'suspended', expiresAt: future })).toBe(false);
  });

  it('daysUntilExpiry taxminan to\'g\'ri', () => {
    expect(daysUntilExpiry({ expiresAt: future })).toBeGreaterThanOrEqual(9);
    expect(daysUntilExpiry({ expiresAt: past })).toBeLessThanOrEqual(0);
  });

  it('isTrialActive: trial flag + faol', () => {
    const plan = (isTrial: boolean) => ({ tier: 'pro', maxFilial: 1, maxUsers: 1, isTrial });
    expect(isTrialActive({ status: 'active', expiresAt: future, plan: plan(true) })).toBe(true);
    expect(isTrialActive({ status: 'active', expiresAt: future, plan: plan(false) })).toBe(false);
    expect(isTrialActive({ status: 'active', expiresAt: past, plan: plan(true) })).toBe(false);
  });

  it('onboardingProgress foiz', () => {
    expect(onboardingProgress({ onboarding: {} })).toBe(0);
    expect(onboardingProgress({ onboarding: { branchCreated: true, productAdded: true, saleMade: true, profileCompleted: true } })).toBe(100);
    expect(onboardingProgress({ onboarding: { branchCreated: true } })).toBe(25);
  });
});
