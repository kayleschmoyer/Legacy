import React from 'react';
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
import { Shirt } from '@tamagui/lucide-icons';
import {
  initialsFromTeamName,
  type TeamBrandingTeam,
  useTeamBranding,
} from './useTeamBranding';
import { BRAND_NAVY_LIGHT } from '../../utils/colors';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface TeamBrandingControlProps {
  teamId: number | null;
  leagueId: number | null;
  team: TeamBrandingTeam | null;
  /** When false, the editor renders read-only (no inputs / save buttons). */
  canEdit?: boolean;
  onSaved?: (kind: 'name' | 'branding') => void;
  onError?: (error: Error) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * TeamBrandingControl — cross-platform team identity editor (name, brand
 * colors, logo). Mirrors web's canonical league-detail v2 "Team" tab and shares
 * its save wiring via {@link useTeamBranding} (LS-7809).
 */
export function TeamBrandingControl({
  teamId,
  leagueId,
  team,
  canEdit = true,
  onSaved,
  onError,
}: TeamBrandingControlProps): React.JSX.Element {
  const {
    name,
    setName,
    primaryColor,
    setPrimaryColor,
    secondaryColor,
    setSecondaryColor,
    logoUrl,
    setLogoUrl,
    currentTeamName,
    trimmedName,
    nameDirty,
    renaming,
    savingBranding,
    savedFlash,
    presetColors,
    saveName,
    saveBranding,
  } = useTeamBranding({ teamId, leagueId, team, onSaved, onError });

  const displayName = trimmedName || currentTeamName || 'My Team';

  const swatchRow = (
    selected: string,
    onSelect: (color: string) => void,
    label: string,
  ) => (
    <XStack gap="$2" flexWrap="wrap">
      {presetColors.map((c) => (
        <Button
          key={c}
          circular
          size="$3"
          backgroundColor={c}
          pressStyle={{ backgroundColor: c, opacity: 0.85 }}
          borderWidth={selected === c ? 3 : 1}
          borderColor={selected === c ? '$color' : '$gray6'}
          disabled={!canEdit}
          aria-label={`${label} ${c}`}
          onPress={() => onSelect(c)}
        />
      ))}
    </XStack>
  );

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
          <Shirt size={20} color={BRAND_NAVY_LIGHT} />
          <YStack>
            <H4 margin={0}>Team Identity</H4>
            <Text fontSize="$2" color="$gray10">
              How your team appears in standings, chat, and the draft room.
            </Text>
          </YStack>
        </XStack>

        {/* ── Team Name ─────────────────────────────────────────────────────── */}
        <YStack gap="$2">
          <Label htmlFor="team-name-input" fontSize="$3" fontWeight="600">
            Team Name
          </Label>
          <Input
            id="team-name-input"
            data-testid="team-name-input"
            value={name}
            onChangeText={setName}
            placeholder="Enter a memorable name"
            maxLength={40}
            editable={canEdit}
          />
          <Text fontSize="$1" color="$gray10">
            Up to 40 characters · visible to your league.
          </Text>
          {canEdit && (
            <XStack justifyContent="flex-end">
              <Button
                theme={savedFlash === 'name' ? 'green' : 'blue'}
                size="$3"
                disabled={!nameDirty || renaming}
                opacity={!nameDirty ? 0.5 : 1}
                icon={renaming ? <Spinner size="small" /> : undefined}
                onPress={() => void saveName()}
              >
                {savedFlash === 'name'
                  ? 'Saved'
                  : renaming
                    ? 'Saving…'
                    : 'Save Name'}
              </Button>
            </XStack>
          )}
        </YStack>

        <Separator />

        {/* ── Logo ──────────────────────────────────────────────────────────── */}
        <YStack gap="$2">
          <Text fontSize="$3" fontWeight="600">
            Team Logo
          </Text>
          <Text fontSize="$2" color="$gray10">
            Square image served over HTTPS. Shown next to your team throughout
            the app.
          </Text>
          <XStack alignItems="center" gap="$3">
            <YStack
              width={48}
              height={48}
              borderRadius="$4"
              alignItems="center"
              justifyContent="center"
              backgroundColor={primaryColor}
              borderWidth={1}
              borderColor={secondaryColor}
            >
              <Text color="white" fontWeight="700">
                {initialsFromTeamName(displayName)}
              </Text>
            </YStack>
            <Input
              id="team-logo-input"
              data-testid="team-logo-input"
              flex={1}
              value={logoUrl}
              onChangeText={setLogoUrl}
              placeholder="https://…"
              autoCapitalize="none"
              autoCorrect={false}
              editable={canEdit}
            />
          </XStack>
        </YStack>

        {/* ── Colors ────────────────────────────────────────────────────────── */}
        <YStack gap="$3">
          <YStack gap="$2">
            <Text fontSize="$2" fontWeight="600">
              Primary Color
            </Text>
            {swatchRow(primaryColor, setPrimaryColor, 'Pick primary color')}
          </YStack>
          <YStack gap="$2">
            <Text fontSize="$2" fontWeight="600">
              Secondary Color
            </Text>
            {swatchRow(
              secondaryColor,
              setSecondaryColor,
              'Pick secondary color',
            )}
          </YStack>

          {canEdit && (
            <XStack justifyContent="flex-end">
              <Button
                theme={savedFlash === 'branding' ? 'green' : 'blue'}
                size="$3"
                disabled={savingBranding}
                icon={savingBranding ? <Spinner size="small" /> : undefined}
                onPress={() => void saveBranding()}
              >
                {savedFlash === 'branding'
                  ? 'Saved'
                  : savingBranding
                    ? 'Saving…'
                    : 'Save Branding'}
              </Button>
            </XStack>
          )}
        </YStack>
      </YStack>
    </Card>
  );
}
