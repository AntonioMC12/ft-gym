// Provisional defaults for fictional development data, not approved commercial conditions.
export const DEVELOPMENT_POLICY = Object.freeze({
  version: 1, currency: 'EUR', timezone: 'Europe/Madrid', graceDays: 15,
  missingBillingDay: 'last-day-preserve-anchor', automaticSuspension: false,
  priceIncludesTax: null, // No monetary issuance until the center defines this explicitly.
});

export const ROLE_CAPABILITIES = Object.freeze({
  manager: Object.freeze(['center.read', 'center.update', 'staff.manage', 'members.read', 'members.manage',
    'plans.manage', 'billing.read', 'billing.manage', 'payments.record', 'training.assign']),
  trainer: Object.freeze(['center.read', 'members.operational.read', 'training.assign', 'training.shared.read']),
  member: Object.freeze(['membership.own.read', 'receipts.own.read', 'training.own.read']),
});

// Extra export/refund capabilities and platform access are granted explicitly in later phases.
export const PLATFORM_CAPABILITIES = Object.freeze(['centers.manage', 'managers.manage', 'metrics.global.read', 'members.read', 'members.manage']);
