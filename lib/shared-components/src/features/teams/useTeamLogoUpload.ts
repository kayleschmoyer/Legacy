import type {
  UseTeamLogoUploadOptions,
  UseTeamLogoUploadResult,
} from './teamLogoUpload.types';

export * from './teamLogoUpload.types';

/**
 * Default (non-native) team-logo upload hook — a no-op.
 *
 * TeamBrandingControl is currently mobile-only (web's league-detail-v2 Team
 * tab implements its own `<input type="file">` upload flow directly in
 * apps/web/src/pages/baseball/league-detail-v2/tabs/Team.tsx), so this stub
 * only exists to keep `TeamBrandingControl`'s bare `./useTeamLogoUpload`
 * import safe if the component is ever rendered outside React Native.
 * Paired with `useTeamLogoUpload.native.ts` via Metro's `.native.ts`
 * resolution (mirrors `utils/SecureStorage{.native}.ts`) — LS-7685.
 */
export function useTeamLogoUpload(
  _options: UseTeamLogoUploadOptions,
): UseTeamLogoUploadResult {
  return {
    uploading: false,
    uploadError: null,
    pickAndUploadLogo: async () => {
      /* image picking is not available on this platform */
    },
  };
}
