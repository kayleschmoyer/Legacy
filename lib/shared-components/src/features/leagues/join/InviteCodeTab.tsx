import React, { useState } from 'react';
import { Input, Spinner, Text, XStack, YStack } from 'tamagui';
import { Check } from '@tamagui/lucide-icons';
import { formatSpotsRemaining, spotMeterFill } from './joinLeagueFormat';
import type { InviteCodeValidation } from './joinLeagueTypes';
import { keyboardPressProps } from './pressable';
import { onTextChange } from './textInputEvent';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  FIELD_GREEN,
  FIELD_GREEN_BORDER,
  FIELD_GREEN_FG,
  FIELD_GREEN_SOFT,
  PANEL_BORDER,
  SEAM_ERROR_FG,
  SEAM_ERROR_SOFT,
  SURFACE_PANEL,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_TERTIARY,
  withAlpha,
} from '../../../utils/colors';

const TEAM_NAME_MAX = 50;
/** Minimum tap target (AC15). */
const TAP_TARGET = 44;

/** Border color of the code input, keyed by validation state. */
function codeBorderColor(
  status: InviteCodeValidation['status'],
  focused: boolean,
): string {
  if (status === 'valid' || status === 'alreadyMember') return FIELD_GREEN;
  if (status === 'invalid') return BRAND_SEAM_RED;
  if (focused) return BRAND_GOLD;
  return PANEL_BORDER;
}

/* ─── Result card ─── */

interface StripStyle {
  label: string;
  stripBg: string;
  stripFg: string;
  border: string;
}

function stripStyleFor(validation: InviteCodeValidation): StripStyle | null {
  const { status, league } = validation;
  const total = league?.totalSpots ?? 0;

  switch (status) {
    case 'checking':
      return {
        label: 'CHECKING CODE…',
        stripBg: withAlpha(BRAND_GOLD, 0.12),
        stripFg: BRAND_GOLD_LIGHT,
        border: PANEL_BORDER,
      };
    case 'valid':
      return {
        label: 'CODE VALID',
        stripBg: FIELD_GREEN_SOFT,
        stripFg: FIELD_GREEN_FG,
        border: FIELD_GREEN_BORDER,
      };
    case 'invalid':
      return {
        label: 'INVALID CODE',
        stripBg: SEAM_ERROR_SOFT,
        stripFg: SEAM_ERROR_FG,
        border: withAlpha(BRAND_SEAM_RED, 0.5),
      };
    case 'full':
      return {
        label: `LEAGUE FULL — ALL ${total} SPOTS TAKEN`,
        stripBg: withAlpha(BRAND_GOLD, 0.12),
        stripFg: BRAND_GOLD_LIGHT,
        border: withAlpha(BRAND_GOLD, 0.4),
      };
    case 'alreadyMember':
      return {
        label: `YOU'RE ALREADY IN ${(league?.leagueName ?? 'THIS LEAGUE').toUpperCase()}`,
        stripBg: withAlpha(BRAND_NAVY_LIGHT, 0.28),
        stripFg: TEXT_PRIMARY,
        border: withAlpha(BRAND_NAVY_LIGHT, 0.6),
      };
    default:
      return null;
  }
}

function SpotMeter({
  availableSpots,
  totalSpots,
}: {
  availableSpots?: number | null;
  totalSpots?: number | null;
}) {
  const fill = spotMeterFill(availableSpots, totalSpots);

  return (
    <YStack gap={6} testID="join-spot-meter">
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
        {formatSpotsRemaining(availableSpots, totalSpots)}
      </Text>
    </YStack>
  );
}

function ValidationCard({
  validation,
  onGoToLeague,
}: {
  validation: InviteCodeValidation;
  onGoToLeague: (leagueId: number) => void;
}) {
  const strip = stripStyleFor(validation);
  if (!strip) return null;

  const { status, league } = validation;
  const checking = status === 'checking';
  const showBody = status !== 'invalid';
  const leagueId = league?.leagueId;
  const teamCount = league?.totalSpots ?? 0;
  const settingsLine =
    teamCount > 0 ? `${teamCount} team${teamCount === 1 ? '' : 's'}` : '';

  return (
    <YStack
      testID={`join-validation-card-${status}`}
      borderWidth={1}
      borderColor={strip.border}
      borderRadius={14}
      overflow="hidden"
      backgroundColor={SURFACE_PANEL}
    >
      <XStack
        alignItems="center"
        gap={6}
        paddingVertical={8}
        paddingHorizontal={14}
        backgroundColor={strip.stripBg}
      >
        {checking ? <Spinner size="small" color={strip.stripFg} /> : null}
        {status === 'valid' ? <Check size={13} color={strip.stripFg} /> : null}
        <Text
          fontFamily="$heading"
          fontWeight="700"
          fontSize={11}
          letterSpacing={1.5}
          color={strip.stripFg}
          flexShrink={1}
          numberOfLines={1}
        >
          {strip.label}
        </Text>
      </XStack>

      {showBody ? (
        <YStack padding={14} gap={10}>
          <Text
            fontFamily="$heading"
            fontWeight="800"
            fontSize={17}
            color={TEXT_PRIMARY}
            numberOfLines={1}
          >
            {checking ? 'Checking…' : (league?.leagueName ?? 'League')}
          </Text>

          {!checking && league ? (
            <>
              {/* `InviteCodeInfo` carries no league settings beyond the slot
                  counts, so the settings line is the team count alone. */}
              {settingsLine ? (
                <Text fontSize={12} color={TEXT_MUTED}>
                  {settingsLine}
                </Text>
              ) : null}
              <SpotMeter
                availableSpots={league.availableSpots}
                totalSpots={league.totalSpots}
              />
              {status === 'alreadyMember' && leagueId != null ? (
                <XStack
                  testID="join-go-to-league"
                  minHeight={TAP_TARGET}
                  alignItems="center"
                  justifyContent="center"
                  borderWidth={1}
                  borderColor={BRAND_GOLD}
                  borderRadius={10}
                  paddingHorizontal={16}
                  cursor="pointer"
                  pressStyle={{ opacity: 0.8 }}
                  onPress={() => onGoToLeague(leagueId)}
                  {...keyboardPressProps(() => onGoToLeague(leagueId))}
                  accessibilityRole="button"
                  accessibilityLabel={`Go to ${league.leagueName ?? 'league'}`}
                >
                  <Text
                    fontFamily="$heading"
                    fontWeight="800"
                    fontSize={14}
                    letterSpacing={1.5}
                    color={BRAND_GOLD_LIGHT}
                  >
                    GO TO LEAGUE
                  </Text>
                </XStack>
              ) : null}
            </>
          ) : null}
        </YStack>
      ) : null}
    </YStack>
  );
}

/* ─── Tab ─── */

export interface InviteCodeTabProps {
  inviteCode: string;
  onInviteCodeChange: (code: string) => void;
  teamName: string;
  onTeamNameChange: (name: string) => void;
  validation: InviteCodeValidation;
  joining: boolean;
  error?: string | null;
  onSubmit: () => void;
  onGoToLeague: (leagueId: number) => void;
}

export function InviteCodeTab({
  inviteCode,
  onInviteCodeChange,
  teamName,
  onTeamNameChange,
  validation,
  joining,
  error,
  onSubmit,
  onGoToLeague,
}: InviteCodeTabProps) {
  const [codeFocused, setCodeFocused] = useState(false);
  const [teamFocused, setTeamFocused] = useState(false);

  const { status, league } = validation;
  const canJoin = status === 'valid' && teamName.trim().length > 0 && !joining;
  const ctaLabel = joining
    ? 'JOINING…'
    : league?.leagueName && status === 'valid'
      ? `JOIN ${league.leagueName.toUpperCase()}`
      : 'JOIN LEAGUE';
  // The already-member state swaps the CTA out for GO TO LEAGUE in the card.
  const showCta = status !== 'alreadyMember';

  return (
    <YStack gap={18} testID="join-invite-tab">
      <YStack gap={8}>
        <Input
          testID="join-invite-code-input"
          placeholder="ABC12XYZ"
          value={inviteCode}
          onChange={onTextChange(onInviteCodeChange, (text) =>
            text.toUpperCase(),
          )}
          onFocus={() => setCodeFocused(true)}
          onBlur={() => setCodeFocused(false)}
          maxLength={8}
          autoCapitalize="characters"
          autoCorrect={false}
          disabled={joining}
          backgroundColor={SURFACE_PANEL}
          borderWidth={1}
          borderColor={codeBorderColor(status, codeFocused)}
          borderRadius={12}
          padding={16}
          minHeight={TAP_TARGET}
          fontFamily="$mono"
          fontSize={24}
          fontWeight="700"
          letterSpacing={8}
          textAlign="center"
          color={TEXT_PRIMARY}
          placeholderTextColor={TEXT_TERTIARY}
          accessibilityLabel="Invite code"
        />

        <ValidationCard validation={validation} onGoToLeague={onGoToLeague} />
      </YStack>

      <YStack gap={8}>
        <XStack alignItems="center" justifyContent="space-between">
          <Text fontSize={13} fontWeight="700" color={TEXT_PRIMARY}>
            Team Name
          </Text>
          <Text
            testID="join-team-name-counter"
            fontSize={11}
            color={TEXT_TERTIARY}
            fontVariant={['tabular-nums']}
          >
            {teamName.length}/{TEAM_NAME_MAX}
          </Text>
        </XStack>
        <Input
          testID="join-team-name-input"
          placeholder="Enter your team name"
          value={teamName}
          onChange={onTextChange(onTeamNameChange)}
          onFocus={() => setTeamFocused(true)}
          onBlur={() => setTeamFocused(false)}
          maxLength={TEAM_NAME_MAX}
          disabled={joining}
          backgroundColor={SURFACE_PANEL}
          borderWidth={1}
          borderColor={teamFocused ? BRAND_GOLD : PANEL_BORDER}
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
          testID="join-invite-error"
          borderWidth={1}
          borderColor={withAlpha(BRAND_SEAM_RED, 0.5)}
          backgroundColor={SEAM_ERROR_SOFT}
          borderRadius={12}
          padding={12}
        >
          <Text fontSize={12} color={SEAM_ERROR_FG}>
            {error}
          </Text>
        </YStack>
      ) : null}

      {showCta ? (
        <XStack
          testID="join-invite-submit"
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
            if (canJoin) onSubmit();
          }}
          {...keyboardPressProps(onSubmit, !canJoin)}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canJoin }}
          accessibilityLabel={ctaLabel}
        >
          {/* Ink on gold is theme-invariant — gold stays light in both themes. */}
          <Text
            fontFamily="$heading"
            fontWeight="800"
            fontSize={16}
            letterSpacing={1.5}
            color={BG_DARK}
            numberOfLines={1}
          >
            {ctaLabel}
          </Text>
        </XStack>
      ) : null}

      <YStack
        testID="join-how-it-works"
        backgroundColor={BG_DARK}
        borderWidth={1}
        borderColor={PANEL_BORDER}
        borderRadius={12}
        padding={14}
        gap={6}
      >
        <Text
          fontFamily="$heading"
          fontWeight="700"
          fontSize={10}
          letterSpacing={1.5}
          color={TEXT_TERTIARY}
        >
          HOW IT WORKS
        </Text>
        <Text fontSize={12} lineHeight={19} color={TEXT_MUTED}>
          Your commissioner shares an 8-character invite code. Enter it above,
          pick a team name, and you will be added to the league straight away.
        </Text>
      </YStack>
    </YStack>
  );
}
