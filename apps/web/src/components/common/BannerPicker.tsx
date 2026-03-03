import React, { useState } from 'react';
import { Button, Input, Spinner, Text, XStack, YStack } from 'tamagui';
import { PRESET_BANNERS, type PresetImage } from '../../constants/presets';

// ─── Props ────────────────────────────────────────────────────────────────────

interface BannerPickerProps {
  /** Current URL (if any) to highlight the active preset. */
  currentUrl?: string | null;
  /** Called when the user confirms a selection. Pass null to clear. */
  onSelect: (url: string | null) => void;
  /** Whether selection is currently saving */
  loading?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PREVIEW_HEIGHT = 80; // px, for the live preview
const THUMB_HEIGHT = 52; // px, for the preset grid thumbnails

/**
 * BannerPicker — lets users choose a league banner from curated presets or
 * enter any URL. Banners are wide-format (3:1), so thumbnails are landscape.
 *
 * Stateless save — callers provide `onSelect` and handle the mutation.
 */
export function BannerPicker({
  currentUrl,
  onSelect,
  loading = false,
}: BannerPickerProps): React.JSX.Element {
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
   * Resolve a potentially-relative preset path (e.g. /presets/banner-blue-gold.png)
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
      {/* Live preview */}
      <YStack gap="$2">
        <Text fontWeight="600" fontSize="$3" color="$textMuted">
          PREVIEW
        </Text>
        <YStack
          borderRadius="$4"
          overflow="hidden"
          backgroundColor="$gray4"
          height={PREVIEW_HEIGHT}
          width="100%"
          alignItems="center"
          justifyContent="center"
        >
          {pendingUrl ? (
            <img
              src={pendingUrl}
              alt="Banner preview"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          ) : (
            <Text fontSize="$2" color="$gray9">
              No banner selected
            </Text>
          )}
        </YStack>
      </YStack>

      {/* Preset grid — 2 per row on narrow, 4 per row at full width */}
      <YStack gap="$2">
        <Text fontWeight="600" fontSize="$3" color="$textMuted">
          PRESETS
        </Text>
        <XStack flexWrap="wrap" gap="$2">
          {PRESET_BANNERS.map((preset: PresetImage) => {
            const isActive = pendingUrl === preset.url;
            return (
              <YStack
                key={preset.id}
                onPress={() => handlePresetClick(preset.url)}
                style={{
                  cursor: 'pointer',
                  flex: '1 1 calc(50% - 8px)',
                  minWidth: 120,
                  maxWidth: 260,
                }}
                borderRadius="$3"
                borderWidth={2}
                borderColor={isActive ? '$blue10' : '$gray5'}
                overflow="hidden"
                title={preset.label}
              >
                <img
                  src={preset.url}
                  alt={preset.label}
                  style={{
                    width: '100%',
                    height: THUMB_HEIGHT,
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
                <XStack
                  backgroundColor={isActive ? '$blue3' : '$gray3'}
                  paddingHorizontal="$2"
                  paddingVertical="$1"
                  justifyContent="center"
                >
                  <Text
                    fontSize="$1"
                    fontWeight={isActive ? '700' : '400'}
                    color={isActive ? '$blue11' : '$gray10'}
                  >
                    {preset.label}
                  </Text>
                </XStack>
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
            placeholder="https://example.com/banner.png"
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
