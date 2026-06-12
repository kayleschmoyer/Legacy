import Constants from 'expo-constants';

/**
 * Resolve the Expo/EAS `projectId` from the resolved runtime app config.
 *
 * The value is injected into `extra.eas.projectId` at config-resolution time by
 * `apps/app/app.config.js` from the `EAS_PROJECT_ID` env var (root `.env` / CI /
 * EAS secret). `expo-notifications`' `getExpoPushTokenAsync` requires it to mint
 * valid Expo push tokens on EAS builds and Expo SDK 54+ — without it the call
 * throws `No "projectId" found` (LS-7955).
 *
 * Returns `undefined` when no projectId is configured (e.g. local dev builds
 * with no EAS setup) so callers can skip push-token operations that cannot
 * succeed instead of triggering the error.
 */
export function getEasProjectId(): string | undefined {
  const projectId = (
    Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
  )?.eas?.projectId;
  return projectId != null && projectId !== '' ? projectId : undefined;
}
