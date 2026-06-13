// Mobile-safe utilities - no AWS SDK dependencies

export * from './lib/allowed-positions';
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
