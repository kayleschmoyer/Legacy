import { useCallback, useState } from 'react';
import {
  ALLOWED_LOGO_MIME_TYPES,
  MAX_LOGO_UPLOAD_BYTES,
  type UseTeamLogoUploadOptions,
  type UseTeamLogoUploadResult,
} from './teamLogoUpload.types';

export * from './teamLogoUpload.types';

const bytesToMb = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(2);

/**
 * Native team-logo upload (LS-7685): picks an image from the device library
 * via expo-image-picker, then POSTs the raw bytes to the image-upload lambda
 * (screened for NSFW via Cloudflare AI) with a Bearer JWT — mirrors web's
 * `handleLogoFileChange` (apps/web/src/pages/baseball/league-detail-v2/tabs/Team.tsx)
 * but for the mobile bearer transport, which is CSRF-exempt
 * (lambdas/image-upload/src/auth.ts).
 *
 * expo-image-picker is imported dynamically so this module — which lives in a
 * cross-platform package — never has a static dependency on a native-only
 * package; paired with `useTeamLogoUpload.ts` via Metro's `.native.ts`
 * resolution (mirrors `utils/SecureStorage{.native}.ts`).
 */
export function useTeamLogoUpload({
  teamId,
  imageUploadUrl,
  getAuthToken,
  onUploaded,
}: UseTeamLogoUploadOptions): UseTeamLogoUploadResult {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const pickAndUploadLogo = useCallback(async () => {
    if (!teamId) return;
    setUploadError(null);

    try {
      const ImagePicker = await import('expo-image-picker');

      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setUploadError(
          'Photo library permission is required to upload a logo.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        quality: 0.9,
      });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? 'image/jpeg';
      if (!ALLOWED_LOGO_MIME_TYPES.includes(mimeType)) {
        setUploadError(
          'Unsupported file type. Please upload a PNG, JPEG, or WebP image.',
        );
        return;
      }
      if (asset.fileSize != null && asset.fileSize > MAX_LOGO_UPLOAD_BYTES) {
        setUploadError(
          `Image is too large (${bytesToMb(asset.fileSize)} MB). Maximum allowed size is 2 MB.`,
        );
        return;
      }
      if (!imageUploadUrl) {
        setUploadError(
          'Image uploads are not configured (EXPO_PUBLIC_IMAGE_UPLOAD_URL missing).',
        );
        return;
      }

      const token = await getAuthToken();
      if (!token) {
        setUploadError('You must be signed in to upload a logo.');
        return;
      }

      setUploading(true);

      const fileResponse = await fetch(asset.uri);
      const blob = await fileResponse.blob();
      if (blob.size > MAX_LOGO_UPLOAD_BYTES) {
        setUploadError(
          `Image is too large (${bytesToMb(blob.size)} MB). Maximum allowed size is 2 MB.`,
        );
        return;
      }

      const uploadUrl = `${imageUploadUrl}/images/upload?teamId=${teamId}&imageType=avatar`;
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': mimeType,
          Authorization: `Bearer ${token}`,
        },
        body: blob,
      });
      const json = (await response.json()) as { url?: string; error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? `Upload failed (${response.status})`);
      }
      if (!json.url) {
        throw new Error('Upload succeeded but no URL was returned.');
      }
      onUploaded(json.url);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Upload failed. Please try again.',
      );
    } finally {
      setUploading(false);
    }
  }, [teamId, imageUploadUrl, getAuthToken, onUploaded]);

  return { uploading, uploadError, pickAndUploadLogo };
}
