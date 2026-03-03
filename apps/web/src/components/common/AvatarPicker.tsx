import React, { useState } from 'react';
import { Button, Input, Spinner, Text, XStack, YStack } from 'tamagui';
import { AvatarImage } from './AvatarImage';
import {
  PRESET_AVATARS,
  PRESET_TEAM_LOGOS,
  type PresetImage,
} from '../../constants/presets';

// ─── Props ────────────────────────────────────────────────────────────────────

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
}

// ─── Component ────────────────────────────────────────────────────────────────

const PREVIEW_SIZE = 64;
const GRID_SIZE = 40;

/**
 * AvatarPicker — lets users pick from a curated preset list or enter any URL.
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
}: AvatarPickerProps): React.JSX.Element {
  const presets: PresetImage[] =
    variant === 'user' ? PRESET_AVATARS : PRESET_TEAM_LOGOS;

  const [customUrl, setCustomUrl] = useState('');
  const [pendingUrl, setPendingUrl] = useState<string | null>(
    currentUrl ?? null,
  );

  const handlePresetClick = (url: string) => {
    setPendingUrl(url);
  };

  const handleCustomApply = () => {
    const trimmed = customUrl.trim();
    if (!trimmed) return;
    setPendingUrl(trimmed);
  };

  /**
   * Resolve a potentially-relative preset path (e.g. /presets/logo-bear.png)
   * to a fully-qualified HTTPS URL using the current origin, so that the value
   * stored in the database always passes the server-side HTTPS URL validation.
   * Custom URLs entered by the user are returned unchanged.
   */
  const resolveUrl = (url: string): string => {
    if (url.startsWith('/')) {
      return `${window.location.origin}${url}`;
    }
    return url;
  };

  const handleSave = () => {
    onSelect(pendingUrl ? resolveUrl(pendingUrl) : null);
  };

  const handleClear = () => {
    setPendingUrl(null);
    onSelect(null);
  };

  return (
    <YStack gap="$4" padding="$4">
      {/* Preview */}
      <XStack gap="$3" alignItems="center">
        <AvatarImage url={pendingUrl} username={username} size={PREVIEW_SIZE} />
        <YStack gap="$1">
          <Text fontWeight="600" fontSize="$4">
            {variant === 'user' ? 'Avatar Preview' : 'Logo Preview'}
          </Text>
          <Text fontSize="$2" color="$textMuted">
            {pendingUrl ? 'Custom URL or preset selected' : 'No image selected'}
          </Text>
        </YStack>
      </XStack>

      {/* Preset grid */}
      <YStack gap="$2">
        <Text fontWeight="600" fontSize="$3" color="$textMuted">
          PRESETS
        </Text>
        <XStack flexWrap="wrap" gap="$2">
          {presets.map((preset) => {
            const isActive = pendingUrl === preset.url;
            return (
              <YStack
                key={preset.id}
                onPress={() => handlePresetClick(preset.url)}
                style={{ cursor: 'pointer', position: 'relative' }}
                borderRadius="$3"
                borderWidth={2}
                borderColor={isActive ? '$blue10' : 'transparent'}
                padding={2}
                title={preset.label}
              >
                <AvatarImage
                  url={preset.url}
                  username={preset.label}
                  size={GRID_SIZE}
                  borderRadius={4}
                />
              </YStack>
            );
          })}
        </XStack>
      </YStack>

      {/* Custom URL input */}
      <YStack gap="$2">
        <Text fontWeight="600" fontSize="$3" color="$textMuted">
          CUSTOM URL
        </Text>
        <XStack gap="$2">
          <Input
            flex={1}
            placeholder="https://example.com/avatar.png"
            value={customUrl}
            onChangeText={setCustomUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button size="$3" onPress={handleCustomApply} variant="outlined">
            Apply
          </Button>
        </XStack>
      </YStack>

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
          theme="blue"
          onPress={handleSave}
          disabled={loading}
          icon={loading ? <Spinner size="small" /> : undefined}
        >
          {loading ? 'Saving…' : 'Save'}
        </Button>
      </XStack>
    </YStack>
  );
}
