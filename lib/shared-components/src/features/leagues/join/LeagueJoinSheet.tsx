import React, { useEffect, useState } from 'react';
import { Input, Text, XStack, YStack } from 'tamagui';
import {
  formatDraftDay,
  formatDraftOrder,
  formatSelectionMethod,
  formatSpotsRemaining,
  spotMeterFill,
} from './joinLeagueFormat';
import type { PublicLeagueRow } from './joinLeagueTypes';
import { keyboardPressProps } from './pressable';
import { onTextChange } from './textInputEvent';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_SEAM_RED,
  PANEL_BORDER,
  SEAM_ERROR_FG,
  SEAM_ERROR_SOFT,
  SURFACE_PANEL,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_TERTIARY,
  withAlpha,
} from '../../../utils/colors';
import { formatDraftStatusForBadge } from '../../../utils/draftStatus';
import { Sheet } from '../../../components/Sheet';
import { formatEraName } from '../../home/homeSummaryFormatters';

const TEAM_NAME_MAX = 50;
/** Minimum tap target (AC15). */
const TAP_TARGET = 44;

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <XStack justifyContent="space-between" alignItems="center" gap={12}>
      <Text fontSize={12} color={TEXT_TERTIARY}>
        {label}
      </Text>
      <Text
        fontSize={12}
        fontWeight="700"
        color={TEXT_PRIMARY}
        numberOfLines={1}
        flexShrink={1}
      >
        {value}
      </Text>
    </XStack>
  );
}

export interface LeagueJoinSheetProps {
  /** The league whose detail sheet is open; null closes the sheet. */
  league: PublicLeagueRow | null;
  onOpenChange: (open: boolean) => void;
  joining: boolean;
  /** Inline failure text — this screen never uses `Alert.alert` (AC11). */
  error?: string | null;
  onJoin: (league: PublicLeagueRow, teamName: string) => void;
}

/**
 * League detail sheet for a Browse Public row (LS-8812, AC11): full settings,
 * spot meter, team-name entry, and JOIN NOW. Join failures render inline here
 * rather than in a native alert.
 */
export function LeagueJoinSheet({
  league,
  onOpenChange,
  joining,
  error,
  onJoin,
}: LeagueJoinSheetProps) {
  const [teamName, setTeamName] = useState('');
  const [focused, setFocused] = useState(false);

  // Reset the entry each time a different league's sheet is opened so a name
  // typed for one league never leaks into the next.
  useEffect(() => {
    setTeamName('');
  }, [league?.id]);

  if (!league) {
    return <Sheet open={false} onOpenChange={onOpenChange} />;
  }

  const settings: Array<{ label: string; value: string }> = [];
  const teams = league.numberOfTeams ?? league.totalSpots;
  if (teams != null && teams > 0) {
    settings.push({ label: 'Teams', value: String(teams) });
  }
  if (league.maxRosterSize != null && league.maxRosterSize > 0) {
    settings.push({
      label: 'Roster size',
      value: String(league.maxRosterSize),
    });
  }
  const era = formatEraName({ eraFilter: league.eraFilter });
  if (era) settings.push({ label: 'Era', value: era });
  if (league.playerPool) {
    settings.push({
      label: 'Player pool',
      value: league.playerPool.toUpperCase(),
    });
  }
  const selection = formatSelectionMethod(league.selectionMethod);
  if (selection) settings.push({ label: 'Draft type', value: selection });
  const order = formatDraftOrder(league.draftOrder);
  if (order) settings.push({ label: 'Draft order', value: order });
  const day = formatDraftDay(league.draftDate);
  if (day) settings.push({ label: 'Draft date', value: day });
  if (league.draftStatus) {
    settings.push({
      label: 'Draft status',
      value: formatDraftStatusForBadge(league.draftStatus),
    });
  }

  const canJoin = teamName.trim().length > 0 && !joining && !league.isFull;
  const fill = spotMeterFill(league.availableSpots, league.totalSpots);

  return (
    <Sheet
      open
      onOpenChange={onOpenChange}
      title={league.name ?? 'League'}
      snapPoints={[75, 92]}
    >
      <YStack gap={16} testID="browse-league-sheet">
        <YStack gap={6}>
          <YStack
            height={6}
            borderRadius={3}
            backgroundColor={PANEL_BORDER}
            overflow="hidden"
          >
            <YStack
              height={6}
              width={`${Math.round(fill * 100)}%`}
              backgroundColor={BRAND_GOLD}
            />
          </YStack>
          <Text
            fontSize={12}
            fontWeight="700"
            color={BRAND_GOLD_LIGHT}
            fontVariant={['tabular-nums']}
          >
            {formatSpotsRemaining(league.availableSpots, league.totalSpots)}
          </Text>
        </YStack>

        {settings.length > 0 ? (
          <YStack
            gap={8}
            backgroundColor={SURFACE_PANEL}
            borderWidth={1}
            borderColor={PANEL_BORDER}
            borderRadius={12}
            padding={14}
          >
            {settings.map((setting) => (
              <SettingRow
                key={setting.label}
                label={setting.label}
                value={setting.value}
              />
            ))}
          </YStack>
        ) : null}

        <YStack gap={8}>
          <XStack alignItems="center" justifyContent="space-between">
            <Text fontSize={13} fontWeight="700" color={TEXT_PRIMARY}>
              Team Name
            </Text>
            <Text
              fontSize={11}
              color={TEXT_TERTIARY}
              fontVariant={['tabular-nums']}
            >
              {teamName.length}/{TEAM_NAME_MAX}
            </Text>
          </XStack>
          <Input
            testID="browse-sheet-team-name"
            placeholder="Enter your team name"
            value={teamName}
            onChange={onTextChange(setTeamName)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            maxLength={TEAM_NAME_MAX}
            disabled={joining}
            backgroundColor={SURFACE_PANEL}
            borderWidth={1}
            borderColor={focused ? BRAND_GOLD : PANEL_BORDER}
            borderRadius={10}
            paddingVertical={13}
            paddingHorizontal={16}
            minHeight={TAP_TARGET}
            color={TEXT_PRIMARY}
            placeholderTextColor={TEXT_TERTIARY}
            accessibilityLabel="Team name"
          />
        </YStack>

        {error ? (
          <YStack
            testID="browse-sheet-error"
            borderWidth={1}
            borderColor={withAlpha(BRAND_SEAM_RED, 0.5)}
            backgroundColor={SEAM_ERROR_SOFT}
            borderRadius={10}
            padding={12}
          >
            <Text fontSize={12} color={SEAM_ERROR_FG}>
              {error}
            </Text>
          </YStack>
        ) : null}

        <XStack
          testID="browse-sheet-join"
          minHeight={TAP_TARGET}
          alignItems="center"
          justifyContent="center"
          backgroundColor={BRAND_GOLD}
          borderRadius={12}
          paddingVertical={14}
          opacity={canJoin ? 1 : 0.5}
          cursor={canJoin ? 'pointer' : 'default'}
          pressStyle={canJoin ? { opacity: 0.8 } : undefined}
          onPress={() => {
            if (canJoin) onJoin(league, teamName.trim());
          }}
          {...keyboardPressProps(
            () => onJoin(league, teamName.trim()),
            !canJoin,
          )}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canJoin }}
          accessibilityLabel="Join now"
        >
          {/* Ink on gold is theme-invariant. */}
          <Text
            fontFamily="$heading"
            fontWeight="800"
            fontSize={16}
            letterSpacing={1.5}
            color={BG_DARK}
          >
            {joining ? 'JOINING…' : 'JOIN NOW'}
          </Text>
        </XStack>

        <Text fontSize={11} color={TEXT_MUTED} textAlign="center">
          You can rename your team later from the league settings.
        </Text>
      </YStack>
    </Sheet>
  );
}
