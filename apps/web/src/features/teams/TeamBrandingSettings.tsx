import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  Dialog,
  Paragraph,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import type { TamaguiElement } from 'tamagui';
import { useUpdateTeamBrandingMutation } from '@legacy-sports/graphql';
import {
  normalizeTeamColor,
  TEAM_BRANDING_PRESET_COLORS,
} from '@legacy-sports/shared-components/roster';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  withAlpha,
} from '../../constants/colors';
import { getCsrfToken } from '../../lib/csrf';
import { validateBrandingUrl } from '../../lib/validate-branding-url';
import { env } from '../../config/environment';

// LS-9670: extracted from `pages/baseball/TeamDetailPage.tsx` (the reference
// implementation — LS-355/LS-1810/LS-6046/LS-4063) so baseball and football
// share a single, sport-neutral implementation of a security-adjacent
// validation rule (LS-1810's `validateBrandingUrl`) rather than maintaining
// two independent copies. Unlike the original baseball block, this component
// has no arbitrary-URL text input for avatar/banner — upload is the only way
// to set an image, keeping every URL that reaches the mutation validated by
// `validateBrandingUrl` rather than accepted from a free-text field (the
// native Settings tab's unvalidated-URL pattern is the LS-6434 defect this
// must not reintroduce).

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

interface ColorInputGroupProps {
  label: string;
  value: string;
  presetColors: readonly string[];
  onChange: (color: string) => void;
}

const ColorInputGroup: React.FC<ColorInputGroupProps> = ({
  label,
  value,
  presetColors,
  onChange,
}) => {
  const [hexInput, setHexInput] = useState(value);

  useEffect(() => {
    setHexInput(value);
  }, [value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.startsWith('#')
      ? e.target.value
      : `#${e.target.value}`;
    setHexInput(v);
    if (HEX_COLOR_RE.test(v)) onChange(v);
  };

  return (
    <YStack gap="$2">
      <Text fontSize="$3" fontWeight="500">
        {label}
      </Text>
      <XStack gap="$2" flexWrap="wrap">
        {presetColors.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Pick ${label.toLowerCase()} ${c}`}
            aria-pressed={value === c}
            onClick={() => onChange(c)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: c,
              border:
                value === c
                  ? `2px solid ${BRAND_GOLD_LIGHT}`
                  : `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.35)}`,
              cursor: 'pointer',
              padding: 0,
            }}
          />
        ))}
      </XStack>
      <XStack gap="$2" alignItems="center">
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={HEX_COLOR_RE.test(value) ? value : BRAND_NAVY_LIGHT}
          onChange={(e) => {
            onChange(e.target.value);
            setHexInput(e.target.value);
          }}
          style={{
            width: 32,
            height: 32,
            padding: 0,
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            background: 'none',
          }}
        />
        <input
          type="text"
          aria-label={`${label} hex`}
          value={hexInput}
          onChange={handleTextChange}
          placeholder="#RRGGBB"
          maxLength={7}
          style={{
            width: 100,
            fontFamily: 'monospace',
            fontSize: 13,
            padding: '4px 8px',
            borderRadius: 4,
            border: `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.35)}`,
          }}
        />
      </XStack>
      {hexInput && !HEX_COLOR_RE.test(hexInput) && (
        <Text fontSize="$2" style={{ color: BRAND_SEAM_RED }}>
          Enter a valid 6-digit hex color (e.g. #RRGGBB).
        </Text>
      )}
    </YStack>
  );
};

export interface TeamBrandingSettingsProps {
  teamId: number;
  leagueId: number;
  avatarUrl: string | null | undefined;
  bannerUrl: string | null | undefined;
  primaryColor: string | null | undefined;
  secondaryColor: string | null | undefined;
  /** Called after any successful branding mutation (upload, clear, or colors). */
  onBrandingUpdated: () => Promise<unknown> | void;
}

/**
 * TeamBrandingSettings — sport-neutral team logo/banner/color editor.
 *
 * Renders two panels: image upload (avatar + banner, LS-355/LS-1810) and
 * color pickers (LS-6046), plus the clear-confirmation dialog (LS-4063).
 * Callers gate rendering behind their own edit-access check (e.g.
 * `isGM || isCommissioner`) and supply the team's current branding fields.
 */
export function TeamBrandingSettings({
  teamId,
  leagueId,
  avatarUrl,
  bannerUrl,
  primaryColor: savedPrimaryColorRaw,
  secondaryColor: savedSecondaryColorRaw,
  onBrandingUpdated,
}: TeamBrandingSettingsProps): React.JSX.Element {
  const [brandingError, setBrandingError] = useState<string | null>(null);
  const [brandingSuccess, setBrandingSuccess] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [pendingClear, setPendingClear] = useState<'logo' | 'banner' | null>(
    null,
  );

  const savedPrimaryColor = normalizeTeamColor(
    savedPrimaryColorRaw,
    TEAM_BRANDING_PRESET_COLORS[0],
  );
  const savedSecondaryColor = normalizeTeamColor(
    savedSecondaryColorRaw,
    TEAM_BRANDING_PRESET_COLORS[5],
  );

  const [primaryColor, setPrimaryColor] = useState<string>(savedPrimaryColor);
  const [secondaryColor, setSecondaryColor] =
    useState<string>(savedSecondaryColor);

  // Re-seed color pickers whenever the underlying team's saved colors change.
  useEffect(() => {
    setPrimaryColor(savedPrimaryColor);
    setSecondaryColor(savedSecondaryColor);
  }, [savedPrimaryColor, savedSecondaryColor]);

  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);
  // LS-6049: restore focus to the trigger button when the clear-branding
  // dialog closes (relying on document.activeElement at open time is
  // unreliable — e.g. Safari does not focus <button> on mouse click).
  const avatarClearButtonRef = useRef<TamaguiElement>(null);
  const bannerClearButtonRef = useRef<TamaguiElement>(null);

  const focusClearTrigger = (target: 'logo' | 'banner') => {
    const ref =
      target === 'banner' ? bannerClearButtonRef : avatarClearButtonRef;
    ref.current?.focus();
  };

  const [updateTeamBranding, { loading: brandingLoading }] =
    useUpdateTeamBrandingMutation();

  const colorsDirty =
    primaryColor !== savedPrimaryColor ||
    secondaryColor !== savedSecondaryColor;

  const flashSuccess = () => {
    setBrandingSuccess(true);
    setTimeout(() => setBrandingSuccess(false), 3000);
  };

  const handleSaveColors = async () => {
    if (!colorsDirty) return;
    setBrandingError(null);
    setBrandingSuccess(false);
    try {
      await updateTeamBranding({
        variables: { teamId, leagueId, primaryColor, secondaryColor },
      });
      await onBrandingUpdated();
      flashSuccess();
    } catch (err: unknown) {
      setBrandingError(
        err instanceof Error ? err.message : 'Failed to save colors',
      );
    }
  };

  const handleDiscardColors = () => {
    setPrimaryColor(savedPrimaryColor);
    setSecondaryColor(savedSecondaryColor);
  };

  const handleClearAvatar = async () => {
    setBrandingError(null);
    setBrandingSuccess(false);
    try {
      await updateTeamBranding({
        variables: { teamId, leagueId, avatarUrl: '' },
      });
      await onBrandingUpdated();
      flashSuccess();
    } catch (err: unknown) {
      setBrandingError(
        err instanceof Error ? err.message : 'Failed to clear avatar',
      );
    }
  };

  const handleClearBanner = async () => {
    setBrandingError(null);
    setBrandingSuccess(false);
    try {
      await updateTeamBranding({
        variables: { teamId, leagueId, bannerUrl: '' },
      });
      await onBrandingUpdated();
      flashSuccess();
    } catch (err: unknown) {
      setBrandingError(
        err instanceof Error ? err.message : 'Failed to clear banner',
      );
    }
  };

  const handleFileUpload = async (
    file: File,
    imageType: 'avatar' | 'banner',
  ) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setBrandingError(
        `Unsupported file type: ${file.type}. Please upload a PNG, JPEG, or WebP image.`,
      );
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      setBrandingError(
        `Image is too large (${sizeMb} MB). Maximum allowed size is 2 MB.`,
      );
      return;
    }

    setBrandingError(null);
    setBrandingSuccess(false);

    if (imageType === 'avatar') setAvatarUploading(true);
    else setBannerUploading(true);

    try {
      if (!env.imageUploadUrl) {
        throw new Error(
          'Image uploads are not configured. Please set VITE_IMAGE_UPLOAD_URL.',
        );
      }
      const uploadUrl = `${env.imageUploadUrl}/images/upload?teamId=${teamId}&imageType=${imageType}`;
      const csrfToken = getCsrfToken();
      if (!csrfToken) {
        throw new Error(
          'Unable to verify your session. Please refresh the page and try again.',
        );
      }
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': file.type,
          'X-CSRF-Token': csrfToken,
        },
        body: file,
        credentials: 'include',
      });

      const json = (await response.json()) as { url?: string; error?: string };

      if (!response.ok) {
        throw new Error(json.error ?? `Upload failed (${response.status})`);
      }

      if (!json.url) {
        throw new Error('Upload succeeded but no URL was returned');
      }

      // LS-1810/LS-9670: re-validate the URL the upload endpoint handed back
      // before persisting it — the same rule the manual-paste path enforced,
      // now the only path that reaches the mutation.
      const urlError = validateBrandingUrl(
        json.url,
        imageType === 'avatar' ? 'Avatar' : 'Banner',
      );
      if (urlError) {
        throw new Error(urlError);
      }

      await updateTeamBranding({
        variables: {
          teamId,
          leagueId,
          ...(imageType === 'avatar'
            ? { avatarUrl: json.url }
            : { bannerUrl: json.url }),
        },
      });

      await onBrandingUpdated();
      flashSuccess();
    } catch (err: unknown) {
      setBrandingError(
        err instanceof Error ? err.message : 'Upload failed. Please try again.',
      );
    } finally {
      if (imageType === 'avatar') setAvatarUploading(false);
      else setBannerUploading(false);
    }
  };

  return (
    <>
      {/* Team Branding */}
      <YStack
        gap="$3"
        padding="$4"
        borderRadius="$4"
        borderWidth={1}
        borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.35)}
        backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.06)}
      >
        <Text
          fontSize="$5"
          fontWeight="600"
          style={{ color: BRAND_GOLD_LIGHT }}
        >
          Team Branding
        </Text>
        <Text fontSize="$3" color="$gray11">
          Personalise your team with a logo and banner. Upload an image (PNG,
          JPEG, or WebP, max 2 MB). Uploaded images are screened for
          inappropriate content.
        </Text>

        {/* Hidden file inputs */}
        <input
          ref={avatarFileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFileUpload(file, 'avatar');
            e.target.value = '';
          }}
        />
        <input
          ref={bannerFileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFileUpload(file, 'banner');
            e.target.value = '';
          }}
        />

        {/* Avatar */}
        <YStack gap="$2">
          <Text fontSize="$3" fontWeight="500">
            Avatar{' '}
            <Text fontSize="$2" color="$gray11">
              (team logo / icon)
            </Text>
          </Text>
          {avatarUrl && (
            <XStack gap="$2" alignItems="center">
              <Text
                fontSize="$2"
                color="$gray11"
                flex={1}
                numberOfLines={1}
                style={{ wordBreak: 'break-all' }}
              >
                Current: {avatarUrl}
              </Text>
              <Button
                ref={avatarClearButtonRef}
                size="$2"
                chromeless
                onPress={() => setPendingClear('logo')}
                disabled={brandingLoading || avatarUploading}
                style={{ color: BRAND_SEAM_RED }}
              >
                Clear
              </Button>
            </XStack>
          )}
          <Button
            size="$3"
            onPress={() => avatarFileInputRef.current?.click()}
            disabled={avatarUploading || bannerUploading || brandingLoading}
            alignSelf="flex-start"
            style={{
              backgroundColor: BRAND_NAVY_LIGHT,
              color: 'white',
            }}
          >
            {avatarUploading ? 'Uploading…' : 'Upload Avatar'}
          </Button>
        </YStack>

        {/* Banner */}
        <YStack gap="$2">
          <Text fontSize="$3" fontWeight="500">
            Banner{' '}
            <Text fontSize="$2" color="$gray11">
              (header image)
            </Text>
          </Text>
          {bannerUrl && (
            <XStack gap="$2" alignItems="center">
              <Text
                fontSize="$2"
                color="$gray11"
                flex={1}
                numberOfLines={1}
                style={{ wordBreak: 'break-all' }}
              >
                Current: {bannerUrl}
              </Text>
              <Button
                ref={bannerClearButtonRef}
                size="$2"
                chromeless
                onPress={() => setPendingClear('banner')}
                disabled={brandingLoading || bannerUploading}
                style={{ color: BRAND_SEAM_RED }}
              >
                Clear
              </Button>
            </XStack>
          )}
          <Button
            size="$3"
            onPress={() => bannerFileInputRef.current?.click()}
            disabled={avatarUploading || bannerUploading || brandingLoading}
            alignSelf="flex-start"
            style={{
              backgroundColor: BRAND_NAVY_LIGHT,
              color: 'white',
            }}
          >
            {bannerUploading ? 'Uploading…' : 'Upload Banner'}
          </Button>
        </YStack>

        {/* Feedback */}
        {brandingError && (
          <Text fontSize="$3" style={{ color: BRAND_SEAM_RED }} role="alert">
            {brandingError}
          </Text>
        )}
        {brandingSuccess && (
          <Text fontSize="$3" color="$green9" role="status" aria-live="polite">
            Branding saved!
          </Text>
        )}
      </YStack>

      {/* Team Colors (LS-6046) — free capability, not premium-gated */}
      <YStack
        gap="$3"
        padding="$4"
        borderRadius="$4"
        borderWidth={1}
        borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.35)}
        backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.06)}
      >
        <Text
          fontSize="$5"
          fontWeight="600"
          style={{ color: BRAND_GOLD_LIGHT }}
        >
          Team Colors
        </Text>
        <Text fontSize="$3" color="$gray11">
          Pick your team&apos;s primary and secondary colors. Choose a preset
          swatch or enter a custom hex value.
        </Text>

        <ColorInputGroup
          label="Primary Color"
          value={primaryColor}
          presetColors={TEAM_BRANDING_PRESET_COLORS}
          onChange={setPrimaryColor}
        />
        <ColorInputGroup
          label="Secondary Color"
          value={secondaryColor}
          presetColors={TEAM_BRANDING_PRESET_COLORS}
          onChange={setSecondaryColor}
        />

        <XStack gap="$2" alignItems="center">
          <Button
            onPress={() => {
              void handleSaveColors();
            }}
            disabled={brandingLoading || !colorsDirty}
            style={{
              backgroundColor:
                brandingLoading || !colorsDirty
                  ? withAlpha(BRAND_NAVY_LIGHT, 0.4)
                  : BRAND_NAVY_LIGHT,
              color: 'white',
            }}
            hoverStyle={{ backgroundColor: BRAND_NAVY }}
            pressStyle={{ backgroundColor: BRAND_NAVY_DARK }}
          >
            {brandingLoading ? 'Saving…' : 'Save Colors'}
          </Button>
          {colorsDirty && !brandingLoading && (
            <Button size="$3" chromeless onPress={handleDiscardColors}>
              Discard changes
            </Button>
          )}
        </XStack>
      </YStack>

      {/* Confirmation dialog for clearing logo / banner (LS-4063) */}
      <Dialog
        modal
        open={pendingClear !== null}
        onOpenChange={(open) => {
          if (!open && pendingClear) {
            const target = pendingClear;
            setPendingClear(null);
            focusClearTrigger(target);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay
            key="overlay"
            animation="quick"
            opacity={0.5}
            enterStyle={{ opacity: 0 }}
            exitStyle={{ opacity: 0 }}
          />
          <Dialog.Content
            bordered
            elevate
            key="content"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="clear-branding-title"
            aria-describedby="clear-branding-description"
            animateOnly={['transform', 'opacity']}
            animation={['quick', { opacity: { overshootClamping: true } }]}
            enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
            exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
            gap="$4"
            padding="$4"
            width={500}
          >
            <Dialog.Title id="clear-branding-title" color="$red11">
              {pendingClear === 'banner'
                ? 'Clear team banner?'
                : 'Clear team logo?'}
            </Dialog.Title>
            <Dialog.Description id="clear-branding-description">
              <Paragraph>
                {pendingClear === 'banner'
                  ? 'The current banner image will be removed from your team.'
                  : 'The current logo will be removed from your team.'}{' '}
                You can upload a new one at any time.
              </Paragraph>
            </Dialog.Description>
            <XStack gap="$3" justifyContent="flex-end">
              <Button
                onPress={() => {
                  const target = pendingClear;
                  setPendingClear(null);
                  if (target) focusClearTrigger(target);
                }}
                disabled={brandingLoading}
              >
                Cancel
              </Button>
              <Button
                theme="red"
                onPress={() => {
                  const target = pendingClear;
                  setPendingClear(null);
                  if (target) focusClearTrigger(target);
                  if (target === 'banner') void handleClearBanner();
                  else if (target === 'logo') void handleClearAvatar();
                }}
                disabled={brandingLoading}
                icon={brandingLoading ? <Spinner /> : undefined}
              >
                {pendingClear === 'banner' ? 'Clear banner' : 'Clear logo'}
              </Button>
            </XStack>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </>
  );
}
