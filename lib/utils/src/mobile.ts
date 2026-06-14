// Mobile-safe utilities - no AWS SDK dependencies

export * from './lib/allowed-positions';
// Pure entitlement constants + tier→entitlement helpers (no AWS / Node deps).
// Must be re-exported here so the mobile app's PremiumGate keys and
// `useHasEntitlement` resolve at runtime — Metro resolves '@legacy-sports/utils'
// to this file via the package "react-native" field, so anything missing here
// is `undefined` on Hermes (the LS-7946/LS-7953 failure mode).
export * from './lib/entitlements';
export * from './lib/DbCredentials';
export * from './lib/DbOptions';
export * from './lib/ErrorHandling';
export * from './lib/help-content';
// Pure, Hermes-safe string helpers consumed by shared-components (OnThisDayFeed).
// These must be re-exported here — Metro resolves '@legacy-sports/utils' to this
// file via the package "react-native" field, so anything missing here is
// `undefined` at runtime on the mobile app. stripDiacritics in particular is the
// Hermes-safe replacement for String.prototype.normalize (LS-7946); omitting it
// here meant OnThisDayFeed crashed with "undefined is not a function" (LS-7953).
export {
  cleanDescription,
  extractPlayerNameFromDescription,
  stripDiacritics,
} from './lib/utils';

// Note: LambdaHelpers (express + aws-lambda) is server-only; exported from './node'.
// Note: AWS-specific utilities (SQS, Secrets Manager) are now in @legacy-sports/aws-utils
