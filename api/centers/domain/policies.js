// Provisional defaults for fictional development data, not approved commercial conditions.
export const DEVELOPMENT_POLICY = Object.freeze({
  version: 1, currency: 'EUR', timezone: 'Europe/Madrid', graceDays: 15,
  missingBillingDay: 'last-day-preserve-anchor', automaticSuspension: false,
  priceIncludesTax: null, // No monetary issuance until the center defines this explicitly.
});

export const ROLE_CAPABILITIES = Object.freeze({
  manager: Object.freeze(['center.read', 'center.update', 'staff.manage', 'members.read', 'members.manage',
    'plans.manage', 'billing.read', 'billing.manage', 'payments.record', 'training.assign', 'access.manage', 'access.verify', 'classes.read', 'classes.manage']),
  trainer: Object.freeze(['center.read', 'members.operational.read', 'training.assign', 'training.shared.read', 'classes.read']),
  member: Object.freeze(['membership.own.read', 'membership.own.request', 'receipts.own.read', 'payments.own.create', 'training.own.read', 'access.own.read', 'access.token.create', 'classes.own.read', 'classes.own.reserve']),
});

// Refunds are explicit for the platform allowlist and optional manager grants, never user.admin.
export const PLATFORM_CAPABILITIES = Object.freeze(['centers.manage', 'managers.manage', 'metrics.global.read', 'members.read', 'members.manage', 'staff.manage', 'plans.manage', 'billing.read', 'billing.manage', 'payments.record', 'payments.refund', 'data.export', 'training.assign', 'access.manage', 'access.verify', 'classes.read', 'classes.manage']);
