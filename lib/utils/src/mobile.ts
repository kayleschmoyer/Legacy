// Mobile-safe utilities - no AWS SDK dependencies

export * from './lib/allowed-positions';
// Pure entitlement catalog constants + labels (no AWS / Node deps). Must be
// re-exported here so the mobile app's PremiumGate keys and `useHasEntitlement`
// resolve at runtime — Metro resolves '@legacy-sports/utils'
// to this file via the package "react-native" field, so anything missing here
// is `undefined` on Hermes (the LS-7946/LS-7953 failure mode).
export * from './lib/entitlements';
export * from './lib/DbCredentials';
export * from './lib/DbOptions';
export * from './lib/commissioner-audit-actions';
export * from './lib/ErrorHandling';
// Who Am I? scoring constants + table builder rendered by shared-components'
// DisclosureGame and the minigames hub; missing here they are `undefined` on
// device (LS-10434).
export * from './lib/disclosure-scoring';
export * from './lib/division-rules';
// formatDraftDate is called during render by LeagueListRow (shared-components
// HomeScreen). It was defined only in `index.ts`, so on device it resolved to
// `undefined` and the Home dashboard crashed to the error boundary with
// "undefined is not a function" for any user with a scheduled draft (LS-8755).
export * from './lib/format-draft-date';
export * from './lib/help-content';
// Invite-code input normalizer used by shared-components' join screens
// (LS-10652); missing here it is `undefined` on device.
export * from './lib/invite-code';
// Android channel ids/definitions consumed by usePushNotifications (LS-7650);
// missing here they are `undefined` on device.
export * from './lib/android-notification-channels';
export * from './lib/notification-types';
// Pure, Hermes-safe percentage rounding consumed by the mobile matchup
// win-probability panel. Metro resolves '@legacy-sports/utils' to this file
// via the package "react-native" field, so omitting it here makes
// roundPercentagesTo100 `undefined` on device.
export * from './lib/percentage';
// Pure roster/lineup defaults consumed by shared-components' `config/sports.ts`
// at module-evaluation time (DEFAULT_LINEUP_BY_SPORT). Missing here they are
// silently `undefined` on device rather than throwing at import — same
// barrel-drift root cause as formatDraftDate above.
export * from './lib/sport-defaults';
// Shared username rule consumed by the native profile-settings editor (LS-7671);
// missing here it is `undefined` on device.
export * from './lib/mock-draft-limits';
export * from './lib/season-draft-name';
export * from './lib/username-validation';
export * from './lib/access-level';
export * from './lib/stats-sort-fields';
export * from './lib/waiver-schedule';
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
