/**
 * Shared types/constants for the cross-platform team-logo upload hook
 * (`useTeamLogoUpload`, LS-7685). Kept in their own module so the web
 * (`useTeamLogoUpload.ts`) and native (`useTeamLogoUpload.native.ts`)
 * implementations — resolved via Metro's `.native.ts` convention, mirroring
 * `utils/SecureStorage{.native}.ts` — don't import from one another.
 */

/** Mirrors web's ALLOWED_LOGO_TYPES (apps/web/.../Team.tsx). */
export const ALLOWED_LOGO_MIME_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
];

/** Mirrors web's MAX_LOGO_BYTES (apps/web/.../Team.tsx). */
export const MAX_LOGO_UPLOAD_BYTES = 2 * 1024 * 1024;

export interface UseTeamLogoUploadOptions {
  teamId: number | null;
  /** Base image-upload lambda URL (`config.imageUploadUrl`); undefined when unconfigured. */
  imageUploadUrl: string | null | undefined;
  /** Resolves the caller's bearer JWT (native: SecureStorageProvider-backed). */
  getAuthToken: () => Promise<string | null>;
  /** Called with the uploaded image's URL on success. */
  onUploaded: (url: string) => void;
  /**
   * Which team image slot this upload targets — passed through as the
   * image-upload lambda's `imageType` query param. Defaults to `'avatar'`
   * (TeamBrandingControl's single "logo" field maps onto the team's avatar
   * slot); pass `'banner'` to target the header/banner slot instead (LS-6434).
   */
  imageType?: 'avatar' | 'banner';
}

export interface UseTeamLogoUploadResult {
  uploading: boolean;
  uploadError: string | null;
  pickAndUploadLogo: () => Promise<void>;
}
