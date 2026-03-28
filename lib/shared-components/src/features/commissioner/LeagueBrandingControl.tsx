import React, { useState } from 'react';
import {
  Button,
  Card,
  H4,
  Input,
  Label,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Image as ImageIcon } from '@tamagui/lucide-icons';
import { useUpdateLeagueBrandingMutation } from '../../api/db/graphql.generated';
import { BRAND_NAVY_LIGHT } from '../../utils/colors';
import { AvatarPicker } from '../../components/AvatarPicker';
import { BannerPicker } from '../../components/BannerPicker';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface LeagueBrandingControlProps {
  leagueId: number;
  leagueName?: string | null;
  currentLogoUrl?: string | null;
  currentBannerUrl?: string | null;
  currentPrimaryColor?: string | null;
  currentSecondaryColor?: string | null;
  onSuccess?: (message: string) => void;
  onError?: (error: Error) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

function isValidHex(value: string): boolean {
  return value === '' || HEX_RE.test(value);
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * LeagueBrandingControl — Commissioner control for league logo, banner, and
 * brand colors. Sits alongside other commissioner controls in LeagueDetailPage.
 *
 * Logo and banner each have their own independent Save button so commissioners
 * can update them without touching unrelated settings. Colors share one Save.
 */
export function LeagueBrandingControl({
  leagueId,
  leagueName,
  currentLogoUrl,
  currentBannerUrl,
  currentPrimaryColor,
  currentSecondaryColor,
  onSuccess,
  onError,
}: LeagueBrandingControlProps): React.JSX.Element {
  const [updateBranding, { loading }] = useUpdateLeagueBrandingMutation();

  // Color state
  const [primaryColor, setPrimaryColor] = useState(currentPrimaryColor ?? '');
  const [secondaryColor, setSecondaryColor] = useState(
    currentSecondaryColor ?? '',
  );

  const primaryError = !isValidHex(primaryColor)
    ? 'Must be a hex color like #1A2B3C'
    : null;
  const secondaryError = !isValidHex(secondaryColor)
    ? 'Must be a hex color like #1A2B3C'
    : null;

  const colorsDirty =
    primaryColor !== (currentPrimaryColor ?? '') ||
    secondaryColor !== (currentSecondaryColor ?? '');

  // ── Mutation helpers ──

  const save = async (patch: {
    logoUrl?: string | null;
    bannerUrl?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
  }) => {
    try {
      await updateBranding({
        variables: {
          input: {
            leagueId,
            ...patch,
          },
        },
        refetchQueries: ['GetLeagueById'],
        awaitRefetchQueries: true,
      });
      onSuccess?.('Branding saved!');
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error('Unknown error'));
    }
  };

  const handleLogoSelect = (url: string | null) => {
    void save({ logoUrl: url });
  };

  const handleBannerSelect = (url: string | null) => {
    void save({ bannerUrl: url });
  };

  const handleColorsSave = () => {
    if (primaryError ?? secondaryError) return;
    void save({
      primaryColor: primaryColor || null,
      secondaryColor: secondaryColor || null,
    });
  };

  const handleColorsReset = () => {
    setPrimaryColor(currentPrimaryColor ?? '');
    setSecondaryColor(currentSecondaryColor ?? '');
  };

  return (
    <Card
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
      padding="$5"
      borderRadius="$6"
    >
      <YStack gap="$5">
        {/* Header */}
        <XStack alignItems="center" gap="$2">
          <ImageIcon size={20} color={BRAND_NAVY_LIGHT} />
          <YStack>
            <H4 margin={0}>League Branding</H4>
            <Text fontSize="$2" color="$gray10">
              Customise your league's logo, header banner, and brand colors.
            </Text>
          </YStack>
        </XStack>

        {/* ── Logo ────────────────────────────────────────────────────────── */}
        <YStack gap="$2">
          <Text fontSize="$3" fontWeight="600">
            League Logo
          </Text>
          <Text fontSize="$2" color="$gray10">
            Shown next to your league name throughout the app. Square images
            work best.
          </Text>
          <AvatarPicker
            variant="team"
            currentUrl={currentLogoUrl}
            username={leagueName}
            onSelect={handleLogoSelect}
            loading={loading}
          />
        </YStack>

        <Separator />

        {/* ── Banner ──────────────────────────────────────────────────────── */}
        <YStack gap="$2">
          <Text fontSize="$3" fontWeight="600">
            Header Banner
          </Text>
          <Text fontSize="$2" color="$gray10">
            Wide image displayed at the top of your league page. 3:1 ratio (e.g.
            900 × 300 px) recommended.
          </Text>
          <BannerPicker
            currentUrl={currentBannerUrl}
            onSelect={handleBannerSelect}
            loading={loading}
          />
        </YStack>

        <Separator />

        {/* ── Brand Colors ─────────────────────────────────────────────────── */}
        <YStack gap="$3">
          <YStack gap="$1">
            <Text fontSize="$3" fontWeight="600">
              Brand Colors
            </Text>
            <Text fontSize="$2" color="$gray10">
              Used for accents in standings and team displays. Enter a 6-digit
              hex value, e.g. <Text fontFamily="$mono">#1A2B3C</Text>.
            </Text>
          </YStack>

          <XStack gap="$4" flexWrap="wrap">
            {/* Primary */}
            <YStack gap="$1" flex={1} minWidth={160}>
              <Label htmlFor="primary-color" fontSize="$2" fontWeight="600">
                Primary Color
              </Label>
              <XStack gap="$2" alignItems="center">
                {/* Color swatch */}
                <YStack
                  width={32}
                  height={32}
                  borderRadius="$2"
                  borderWidth={1}
                  borderColor="$gray6"
                  backgroundColor={
                    HEX_RE.test(primaryColor) ? primaryColor : '$gray4'
                  }
                  flexShrink={0}
                />
                <Input
                  id="primary-color"
                  data-testid="primary-color"
                  flex={1}
                  placeholder="#1A2B3C"
                  value={primaryColor}
                  onChangeText={setPrimaryColor}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={7}
                  borderColor={primaryError ? '$red8' : undefined}
                />
              </XStack>
              {primaryError && (
                <Text fontSize="$1" color="$red10">
                  {primaryError}
                </Text>
              )}
            </YStack>

            {/* Secondary */}
            <YStack gap="$1" flex={1} minWidth={160}>
              <Label htmlFor="secondary-color" fontSize="$2" fontWeight="600">
                Secondary Color
              </Label>
              <XStack gap="$2" alignItems="center">
                <YStack
                  width={32}
                  height={32}
                  borderRadius="$2"
                  borderWidth={1}
                  borderColor="$gray6"
                  backgroundColor={
                    HEX_RE.test(secondaryColor) ? secondaryColor : '$gray4'
                  }
                  flexShrink={0}
                />
                <Input
                  id="secondary-color"
                  data-testid="secondary-color"
                  flex={1}
                  placeholder="#FFFFFF"
                  value={secondaryColor}
                  onChangeText={setSecondaryColor}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={7}
                  borderColor={secondaryError ? '$red8' : undefined}
                />
              </XStack>
              {secondaryError && (
                <Text fontSize="$1" color="$red10">
                  {secondaryError}
                </Text>
              )}
            </YStack>
          </XStack>

          <XStack gap="$3" justifyContent="flex-end">
            <Button
              theme="alt2"
              size="$3"
              onPress={handleColorsReset}
              disabled={!colorsDirty || loading}
              opacity={!colorsDirty ? 0.5 : 1}
            >
              Reset
            </Button>
            <Button
              theme="blue"
              size="$3"
              onPress={handleColorsSave}
              disabled={
                !colorsDirty || loading || !!(primaryError ?? secondaryError)
              }
              opacity={
                !colorsDirty || !!(primaryError ?? secondaryError) ? 0.5 : 1
              }
              icon={loading ? <Spinner size="small" /> : undefined}
            >
              {loading ? 'Saving…' : 'Save Colors'}
            </Button>
          </XStack>
        </YStack>
      </YStack>
    </Card>
  );
}
