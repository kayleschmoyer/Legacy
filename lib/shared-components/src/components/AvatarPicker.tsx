import React, { useState } from 'react';
import { Button, Input, Spinner, Text, View, XStack, YStack } from 'tamagui';
import { AvatarImage } from './AvatarImage';
import {
  PRESET_AVATARS,
  PRESET_TEAM_LOGOS,
  type PresetImage,
} from '../constants/presets';
import { TYPE_BODY } from '../utils/typography';
import { validateBrandingUrl } from '../utils/validateBrandingUrl';

// -- Props ------------------------------------------------------------

export type AvatarPickerVariant = 'user' | 'team';

interface AvatarPickerProps {
  /** Current URL (if any) to highlight the active preset. */
  currentUrl?: string | null;
  /** 'user' shows avatar presets; 'team' shows logo presets. */
  variant?: AvatarPickerVariant;
  /** Called when the user confirms a selection. Pass null to clear. */
  onSelect: (url: string | null) => void;
  /** Whether selection is currently saving */
  loading?: boolean;
  /** Username for initials fallback in the preview */
  username?: string | null;
  /**
   * Resolves a relative preset path (e.g. /presets/logo-bear.png)
   * to a fully-qualified HTTPS URL. On web this prepends window.location.origin;
   * on mobile the caller must supply an appropriate base URL.
   * If omitted, relative URLs are returned unchanged.
   */
  resolveUrl?: (url: string) => string;
}

// -- Component --------------------------------------------------------

const PREVIEW_SIZE = 64;
const TILE_SIZE = 64;

/**
 * AvatarPicker -- lets users pick from a curated preset list. The `team`
 * variant also accepts a custom HTTPS logo URL, validated client-side with
 * the same rule the server applies to team branding (`validateBrandingUrl`).
 *
 * The `user` variant has no custom URL input (LS-10443): the server only
 * accepts avatar URLs on the legacy-fantasy.com allowlist
 * (lambdas/db/src/schema/validate-avatar-url.ts), so an external URL could
 * never be saved.
 *
 * Does NOT handle its own mutation; callers provide `onSelect` which should
 * call the Apollo mutation and handle loading/error state.
 */
export function AvatarPicker({
  currentUrl,
  variant = 'user',
  onSelect,
  loading = false,
  username,
  resolveUrl,
}: AvatarPickerProps): React.JSX.Element {
  const presets: PresetImage[] =
    variant === 'user' ? PRESET_AVATARS : PRESET_TEAM_LOGOS;

  const [customUrl, setCustomUrl] = useState('');
  const [customUrlError, setCustomUrlError] = useState<string | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(
    currentUrl ?? null,
  );

  const handlePresetClick = (url: string) => {
    setPendingUrl(url);
  };

  const handleCustomApply = () => {
    const trimmed = customUrl.trim();
    if (!trimmed) return;
    const error = validateBrandingUrl(trimmed, 'Logo');
    setCustomUrlError(error);
    if (error) return;
    setPendingUrl(trimmed);
  };

  const handleCustomUrlChange = (text: string) => {
    setCustomUrl(text);
    if (customUrlError) setCustomUrlError(null);
  };

  const resolve = (url: string): string => {
    if (resolveUrl && url.startsWith('/')) {
      return resolveUrl(url);
    }
    return url;
  };

  const handleSave = () => {
    onSelect(pendingUrl ? resolve(pendingUrl) : null);
  };

  const handleClear = () => {
    setPendingUrl(null);
    onSelect(null);
  };

  return (
    <YStack gap="$4" padding="$4">
      {/* Preview */}
      <XStack gap="$3" alignItems="center">
        <AvatarImage
          url={pendingUrl ? resolve(pendingUrl) : null}
          username={username}
          size={PREVIEW_SIZE}
        />
        <YStack gap="$1">
          <Text {...TYPE_BODY.body} fontWeight="600" color="$color12">
            {variant === 'user' ? 'Avatar Preview' : 'Logo Preview'}
          </Text>
          <Text {...TYPE_BODY.caption} color="$textMuted">
            {pendingUrl
              ? variant === 'team'
                ? 'Custom URL or preset selected'
                : 'Image selected'
              : 'No image selected'}
          </Text>
        </YStack>
      </XStack>

      {/* Preset grid */}
      <YStack
        gap="$3"
        padding="$4"
        backgroundColor="$surfacePanel"
        borderColor="$surfacePanelBorder"
        borderWidth={1}
        borderRadius="$5"
      >
        <Text {...TYPE_BODY.eyebrow} color="$textMuted">
          PRESETS
        </Text>
        <XStack flexWrap="wrap" gap="$2">
          {presets.map((preset) => {
            const isActive =
              pendingUrl === preset.url || pendingUrl === resolve(preset.url);
            return (
              <View
                key={preset.id}
                onPress={() => handlePresetClick(preset.url)}
                cursor="pointer"
                width={TILE_SIZE}
                height={TILE_SIZE}
                borderRadius={TILE_SIZE / 2}
                borderWidth={2}
                borderColor={isActive ? '$brandGold' : 'transparent'}
                position="relative"
                shadowColor={isActive ? '$brandGold' : 'transparent'}
                shadowRadius={isActive ? 12 : 0}
                shadowOpacity={isActive ? 0.35 : 0}
              >
                <AvatarImage
                  url={preset.url}
                  username={preset.label}
                  size={TILE_SIZE - 4}
                />
                {isActive ? (
                  <View
                    position="absolute"
                    bottom={-2}
                    right={-2}
                    width={20}
                    height={20}
                    borderRadius={10}
                    backgroundColor="$brandGold"
                    alignItems="center"
                    justifyContent="center"
                  >
                    <Text
                      {...TYPE_BODY.eyebrow}
                      color="#111"
                      letterSpacing={0}
                      fontSize={11}
                    >
                      ✓
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </XStack>
      </YStack>

      {/* Custom URL input -- team logos only (LS-10443) */}
      {variant === 'team' ? (
        <YStack gap="$2">
          <Text {...TYPE_BODY.eyebrow} color="$textMuted">
            CUSTOM URL
          </Text>
          <XStack gap="$2">
            <Input
              flex={1}
              aria-label="Custom logo URL"
              aria-invalid={customUrlError ? true : undefined}
              placeholder="https://example.com/logo.png"
              value={customUrl}
              onChangeText={handleCustomUrlChange}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button size="$3" onPress={handleCustomApply} variant="outlined">
              Apply
            </Button>
          </XStack>
          {customUrlError ? (
            <Text {...TYPE_BODY.caption} color="$red10" role="alert">
              {customUrlError}
            </Text>
          ) : null}
        </YStack>
      ) : null}

      {/* Actions */}
      <XStack gap="$3" justifyContent="flex-end">
        <Button
          size="$3"
          chromeless
          color="$textMuted"
          onPress={handleClear}
          disabled={loading}
        >
          Clear
        </Button>
        <Button
          size="$3"
          backgroundColor="$brandNavy"
          color="$color12"
          hoverStyle={{ backgroundColor: '$brandNavyLight' }}
          pressStyle={{ backgroundColor: '$brandNavyDark' }}
          onPress={handleSave}
          disabled={loading}
          icon={loading ? <Spinner size="small" /> : undefined}
        >
          {loading ? 'Saving...' : 'Save'}
        </Button>
      </XStack>
    </YStack>
  );
}
