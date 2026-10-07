import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import {
  brand,
  darkText,
  shadowBase,
  withAlpha,
} from '@legacy-sports/design-tokens';
import { type DraftPlayer } from './types';
import { getPositionColor } from './utils';
import type { SportKind } from '../../config/sports';

function formatCareerSpan(
  startYear: number | null | undefined,
  endYear: number | null | undefined,
): string | null {
  if (startYear == null) return null;
  const end = endYear ?? startYear;
  return end === startYear ? `${startYear}` : `${startYear}–${end}`;
}

// ---------------------------------------------------------------------------
// BaseballCard – baseball card look-alike display for a drafted player (LS-628)
// Ported to Tamagui primitives (LS-9205) so it renders under both web and
// native — consumed by DraftCompleteView (post-draft roster grid) and
// PickAnnouncement (live pick splash). Sport-aware since LS-10827: football
// drafts get football stat cells and a football brand strip instead of the
// batter/pitcher cells and baseball emoji.
// ---------------------------------------------------------------------------

interface BaseballCardProps {
  player: DraftPlayer;
  /** Draft round this player was selected in */
  round: number;
  /** Pick number within the round */
  pickNumber: number;
  /** Overall pick number across all rounds */
  overallPick: number;
  /** Which sport's stat cells and branding to render. Defaults to baseball. */
  sport?: SportKind;
}

interface StatCellProps {
  value: string;
  label: string;
}

function StatCell({ value, label }: StatCellProps): React.JSX.Element {
  return (
    <YStack
      width="48%"
      alignItems="center"
      backgroundColor={withAlpha(shadowBase.dark, 0.22)}
      borderRadius={4}
      paddingVertical={3}
      paddingHorizontal={2}
    >
      <Text
        fontSize={10}
        fontWeight="800"
        color="$color"
        lineHeight={12}
        fontFamily="$heading"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </Text>
      <Text
        fontSize={7.5}
        color="$textMuted"
        marginTop={1}
        fontWeight="600"
        letterSpacing={0.3}
      >
        {label}
      </Text>
    </YStack>
  );
}

interface StatCellValue {
  value: string;
  label: string;
}

// Em-dash, never 0, for a football stat with no career row — same rule as the
// board's FOOTBALL_COLUMNS (LS-9478 / the LS-9473 fabricated-zero postmortem).
const footballNum = (n: number | undefined): string =>
  n == null ? '—' : String(n);

/** Football stat cells keyed to what the position actually produces. */
function footballStatCells(player: DraftPlayer): StatCellValue[] {
  const passYds = { value: footballNum(player.passYds), label: 'PASS YDS' };
  const passTd = { value: footballNum(player.passTd), label: 'PASS TD' };
  const rushYds = { value: footballNum(player.rushYds), label: 'RUSH YDS' };
  const rushTd = { value: footballNum(player.rushTd), label: 'RUSH TD' };
  const rec = { value: footballNum(player.rec), label: 'REC' };
  const recTd = { value: footballNum(player.recTd), label: 'REC TD' };
  switch (player.position.toUpperCase()) {
    case 'QB':
      return [passYds, passTd, rushYds, rushTd];
    case 'RB':
      return [rushYds, rushTd, rec, recTd];
    case 'WR':
    case 'TE':
      return [rec, recTd, rushYds, rushTd];
    case 'K':
      return [{ value: footballNum(player.fg), label: 'FG' }];
    default:
      return [
        passYds,
        rushYds,
        rec,
        { value: footballNum(player.td), label: 'TD' },
      ];
  }
}

function baseballStatCells(player: DraftPlayer): StatCellValue[] {
  return player.isPitcher
    ? [
        { value: player.era?.toFixed(2) ?? '—', label: 'ERA' },
        { value: String(player.wins ?? 0), label: 'W' },
        { value: String(player.strikeouts ?? 0), label: 'K' },
        { value: String(player.saves ?? 0), label: 'SV' },
      ]
    : [
        { value: player.avg.toFixed(3), label: 'AVG' },
        { value: String(player.hr), label: 'HR' },
        { value: String(player.rbi), label: 'RBI' },
        { value: String(player.sb), label: 'SB' },
      ];
}

const BRAND_EMOJI: Record<SportKind, { glyph: string; label: string }> = {
  baseball: { glyph: '⚾', label: 'baseball' },
  football: { glyph: '🏈', label: 'football' },
};

export function BaseballCard({
  player,
  round,
  pickNumber,
  overallPick,
  sport = 'baseball',
}: BaseballCardProps): React.JSX.Element {
  const posColor = getPositionColor(sport, player.position);
  const brandEmoji = BRAND_EMOJI[sport];
  const statCells =
    sport === 'football'
      ? footballStatCells(player)
      : baseballStatCells(player);
  const secondaryPositions = player.eligiblePositions?.filter(
    (p) => p !== player.position,
  );
  const careerYears = formatCareerSpan(
    player.careerStartYear,
    player.careerEndYear,
  );

  return (
    <YStack
      role="group"
      aria-label={`${player.name}, ${player.position}, round ${round} pick ${pickNumber}`}
      position="relative"
      borderRadius={10}
      overflow="hidden"
      backgroundColor="$surfaceCard"
      borderWidth={1}
      borderColor="$borderColor"
    >
      {/* Position-colored header band */}
      <XStack
        backgroundColor={posColor}
        paddingHorizontal={7}
        paddingTop={6}
        paddingBottom={5}
        alignItems="center"
        justifyContent="space-between"
        flexShrink={0}
        borderBottomWidth={1}
        borderBottomColor={withAlpha(shadowBase.dark, 0.25)}
      >
        <Text
          fontSize={9}
          fontWeight="800"
          color="white"
          letterSpacing={0.5}
          backgroundColor={withAlpha(shadowBase.dark, 0.28)}
          paddingHorizontal={5}
          paddingVertical={2}
          borderRadius={3}
        >
          {player.position}
        </Text>
        <YStack alignItems="flex-end">
          <Text
            fontSize={8}
            color={withAlpha(darkText.fg1Strong, 0.9)}
            fontWeight="700"
            lineHeight={10}
            fontFamily="$heading"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            R{round}
          </Text>
          <Text
            fontSize={8}
            color={withAlpha(darkText.fg1Strong, 0.9)}
            fontWeight="700"
            lineHeight={10}
            fontFamily="$heading"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            #{overallPick}
          </Text>
        </YStack>
      </XStack>

      {/* Legacy Sports brand micro-text */}
      <Text
        textAlign="center"
        fontSize={6.5}
        letterSpacing={1.2}
        color={withAlpha(darkText.fg1, 0.4)}
        fontWeight="700"
        textTransform="uppercase"
        paddingTop={2}
        paddingHorizontal={6}
        paddingBottom={3}
        backgroundColor={withAlpha(shadowBase.dark, 0.2)}
        flexShrink={0}
      >
        <Text role="img" aria-label={brandEmoji.label}>
          {brandEmoji.glyph}
        </Text>{' '}
        LEGACY SPORTS{' '}
        <Text role="img" aria-label={brandEmoji.label}>
          {brandEmoji.glyph}
        </Text>
      </Text>

      {/* Card body */}
      <YStack flex={1} paddingTop={5} paddingHorizontal={7} paddingBottom={6}>
        <Text
          fontSize={8}
          color="$brandGold"
          fontWeight="700"
          letterSpacing={0.3}
          marginBottom={1}
          fontFamily="$heading"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          PICK #{overallPick}
        </Text>
        <Text
          fontSize={11}
          fontWeight="800"
          color="$color"
          marginBottom={3}
          lineHeight={13}
          numberOfLines={1}
          fontFamily="$heading"
        >
          {player.name}
        </Text>

        {/* Secondary eligible positions — inline muted text, not pills */}
        {secondaryPositions && secondaryPositions.length > 0 && (
          <Text
            aria-label={`Also eligible: ${secondaryPositions.join(', ')}`}
            fontSize={8}
            fontWeight="700"
            letterSpacing={0.4}
            color={withAlpha(darkText.fg1, 0.55)}
            textTransform="uppercase"
            marginBottom={3}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            Also: {secondaryPositions.join(' · ')}
          </Text>
        )}

        {careerYears && (
          <Text
            fontSize={8}
            color={withAlpha(darkText.fg1, 0.45)}
            fontWeight="600"
            letterSpacing={0.3}
            marginBottom={3}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            <Text color={withAlpha(darkText.fg1, 0.7)}>{careerYears}</Text>
          </Text>
        )}

        <YStack
          height={1}
          backgroundColor="$borderColor"
          marginHorizontal={-7}
          marginTop={3}
          marginBottom={4}
        />

        {/* Stats – 2x2: pitcher vs batter for baseball, by position for football */}
        <XStack flexWrap="wrap" gap={3} marginBottom={4}>
          {statCells.map((cell) => (
            <StatCell key={cell.label} value={cell.value} label={cell.label} />
          ))}
        </XStack>

        {/* Pts/Matchup footer */}
        {player.ppg != null && (
          <XStack
            alignItems="center"
            justifyContent="space-between"
            backgroundColor={withAlpha(brand.gold, 0.15)}
            borderWidth={1}
            borderColor={withAlpha(brand.gold, 0.2)}
            borderRadius={4}
            paddingHorizontal={5}
            paddingVertical={3}
            marginTop="auto"
          >
            <Text
              fontSize={8}
              color="$brandGoldLight"
              fontWeight="600"
              letterSpacing={0.5}
            >
              Pts/Matchup
            </Text>
            <Text
              fontSize={10}
              fontWeight="800"
              color="$brandGold"
              fontFamily="$heading"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {player.ppg.toFixed(2)}
            </Text>
          </XStack>
        )}
      </YStack>
    </YStack>
  );
}
