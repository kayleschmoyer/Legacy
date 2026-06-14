// Mobile-specific utils index - includes mobile-safe utilities
// Pure entitlement constants + tier helpers (no AWS/Node deps) — must be here so
// the mobile app (and RN jest, which resolves the `.native.ts` barrel first) can
// read ENTITLEMENTS / tierHasEntitlement; mirrors the export in `mobile.ts`.
export * from './lib/entitlements';
export * from './lib/ErrorHandling';
export * from './lib/DbOptions.native';
export * from './lib/AwsSecrets.native';
export * from './lib/help-content';
