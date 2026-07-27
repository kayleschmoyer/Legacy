/**
 * MockDraftSetup — shared, cross-platform Mock Draft configuration form.
 *
 * Extracted from the canonical web `MockDraftPage` setup screen (LS-7711) so
 * web and native render the same battle-tested settings form instead of
 * maintaining parallel forks. This component owns the interactive settings
 * (team count, roster size, draft position, draft order, player pool, optional
 * sport toggle) plus the Start/Cancel actions and inline error/usage surfaces.
 *
 * Page-level chrome stays with each consumer: web wraps this in its gradient
 * background + "Practice Mode" card and supplies premium gating + data fetching;
 * native wraps it in a ScrollView and passes its Premium upsell via `header`.
 * Both supply navigation and the `initializeMockDraft` wiring through `onStart`
 * / `onCancel`, keeping this component purely presentational and platform-safe
 * (Tamagui primitives only — no DOM-only constructs).
 */
import React from 'react';
import { Button, Paragraph, Text, XStack, YStack } from 'tamagui';
import { FootballMockPoolPreview } from './FootballMockPoolPreview';
import {
  BRAND_GOLD,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  EMERALD,
  withAlpha,
} from '../../utils/colors';

// ─── Types ───────────────────────────────────────────────────────────────────

export type MockDraftOrder = 'snake' | 'linear';
export type MockDraftPlayerPool = 'all' | 'nl' | 'al';
export type MockDraftSport = 'baseball' | 'football';

export interface MockDraftSettings {
  numTeams: number;
  rosterSize: number;
  userPickPosition: number;
  draftOrder: MockDraftOrder;
  playerPool: MockDraftPlayerPool;
  sport: MockDraftSport;
}

export interface MockDraftSetupProps {
  /** Invoked with the chosen settings when the user starts the draft. */
  onStart: (settings: MockDraftSettings) => void;
  /** Invoked when the user cancels (consumer owns navigation). */
  onCancel: () => void;
  /** Disables the Start action and shows a "Starting…" label. */
  loading?: boolean;
  /** Inline error surfaced above the actions (mutation error, etc.). */
  error?: string | null;
  /** When true, exposes the Sport selector + football pool preview (LS-4666). */
  footballMockEnabled?: boolean;
  /** Prefill team count (e.g. when launched from a real league row). */
  initialNumTeams?: number;
  /** Prefill draft order. */
  initialDraftOrder?: MockDraftOrder;
  /** Free-tier weekly-usage helper (e.g. "1 of 2 free mock drafts used"). */
  usageLabel?: string;
  /** Optional content rendered above the settings (e.g. a Premium upsell). */
  header?: React.ReactNode;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TEAM_OPTIONS = [4, 6, 8, 10, 12] as const;
const ROSTER_OPTIONS = [5, 8, 10, 15] as const;

const DRAFT_ORDER_OPTIONS: { label: string; value: MockDraftOrder }[] = [
  { label: 'Snake', value: 'snake' },
  { label: 'Linear', value: 'linear' },
];

const PLAYER_POOL_OPTIONS: { label: string; value: MockDraftPlayerPool }[] = [
  { label: 'All MLB', value: 'all' },
  { label: 'NL Only', value: 'nl' },
  { label: 'AL Only', value: 'al' },
];

// Snap an arbitrary prefilled team count to the closest supported option so the
// selector buttons stay in sync with the seed value.
function clampToTeamOption(n: number): number {
  return TEAM_OPTIONS.reduce((best, opt) =>
    Math.abs(opt - n) < Math.abs(best - n) ? opt : best,
  );
}

// ─── Field section wrapper ───────────────────────────────────────────────────

interface FieldSectionProps {
  label: string;
  labelId: string;
  children: React.ReactNode;
  helper?: React.ReactNode;
}

function FieldSection({
  label,
  labelId,
  children,
  helper,
}: FieldSectionProps): React.JSX.Element {
  return (
    <YStack
      tag="section"
      aria-labelledby={labelId}
      gap="$2.5"
      marginBottom="$5"
    >
      <Text
        id={labelId}
        fontFamily="$display"
        fontSize={13}
        fontWeight="600"
        color="$gray11"
        textTransform="uppercase"
        letterSpacing={1}
      >
        {label}
      </Text>
      {children}
      {helper}
    </YStack>
  );
}

// ─── Option button ────────────────────────────────────────────────────────────

interface OptionButtonProps {
  label: string;
  selected: boolean;
  accent: string;
  onPress: () => void;
  width?: number;
}

function OptionButton({
  label,
  selected,
  accent,
  onPress,
  width,
}: OptionButtonProps): React.JSX.Element {
  return (
    <Button
      size="$3"
      onPress={onPress}
      minWidth={width ?? 56}
      width={width}
      backgroundColor={selected ? withAlpha(accent, 0.18) : '$color2'}
      borderColor={selected ? accent : '$borderColor'}
      borderWidth={selected ? 2 : 1}
      hoverStyle={{
        backgroundColor: selected ? withAlpha(accent, 0.28) : '$color3',
      }}
      pressStyle={{ scale: 0.96 }}
      aria-pressed={selected}
    >
      <Text
        fontFamily="$body"
        fontSize={15}
        fontWeight={selected ? '700' : '500'}
        color={selected ? '$color' : '$gray11'}
      >
        {label}
      </Text>
    </Button>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function MockDraftSetup({
  onStart,
  onCancel,
  loading = false,
  error = null,
  footballMockEnabled = false,
  initialNumTeams,
  initialDraftOrder,
  usageLabel,
  header,
}: MockDraftSetupProps): React.JSX.Element {
  const [numTeams, setNumTeams] = React.useState(
    initialNumTeams != null ? clampToTeamOption(initialNumTeams) : 8,
  );
  const [rosterSize, setRosterSize] = React.useState(10);
  const [userPickPosition, setUserPickPosition] = React.useState(1);
  const [draftOrder, setDraftOrder] = React.useState<MockDraftOrder>(
    initialDraftOrder ?? 'snake',
  );
  const [playerPool, setPlayerPool] =
    React.useState<MockDraftPlayerPool>('all');
  const [sport, setSport] = React.useState<MockDraftSport>('baseball');

  const handleStart = () => {
    onStart({
      numTeams,
      rosterSize,
      userPickPosition,
      draftOrder,
      playerPool,
      sport,
    });
  };

  // Football mock-draft engine wiring lands with LS-4657 → LS-4665. Until those
  // ship, the football toggle is a preview affordance only — Start is disabled.
  const footballPreviewActive = footballMockEnabled && sport === 'football';

  const startLabel = loading
    ? 'Starting…'
    : footballPreviewActive
      ? 'Football — Coming Soon'
      : 'Start Mock Draft';

  return (
    <YStack>
      {header}

      {/* Sport — only visible when the football-mock-players flag is on */}
      {footballMockEnabled && (
        <FieldSection label="Sport" labelId="sport-label">
          <XStack gap="$2" flexWrap="wrap" justifyContent="center">
            <OptionButton
              label="⚾ Baseball"
              selected={sport === 'baseball'}
              accent={BRAND_SEAM_RED}
              onPress={() => setSport('baseball')}
              width={140}
            />
            <OptionButton
              label="🏈 Football"
              selected={sport === 'football'}
              accent={BRAND_GOLD}
              onPress={() => setSport('football')}
              width={140}
            />
          </XStack>
        </FieldSection>
      )}

      {/* Football mock pool preview — engine wiring follows in LS-4657→LS-4665 */}
      {footballPreviewActive && (
        <YStack marginBottom="$5" gap="$2">
          <FootballMockPoolPreview />
          <Paragraph
            fontFamily="$body"
            fontSize={12}
            color="$gray10"
            margin={0}
            textAlign="center"
          >
            Football draft engine wiring lands with the rest of the sport toggle
            slice (LS-4657 → LS-4665). Start is disabled until the backend can
            consume this pool.
          </Paragraph>
        </YStack>
      )}

      {/* Number of Teams */}
      <FieldSection label="Number of Teams" labelId="teams-label">
        <XStack gap="$2" flexWrap="wrap" justifyContent="center">
          {TEAM_OPTIONS.map((n) => (
            <OptionButton
              key={n}
              label={String(n)}
              selected={numTeams === n}
              accent={BRAND_SEAM_RED}
              onPress={() => {
                setNumTeams(n);
                if (userPickPosition > n) setUserPickPosition(n);
              }}
            />
          ))}
        </XStack>
      </FieldSection>

      {/* Rounds / Roster Size */}
      <FieldSection label="Rounds (Roster Size)" labelId="roster-label">
        <XStack gap="$2" flexWrap="wrap" justifyContent="center">
          {ROSTER_OPTIONS.map((n) => (
            <OptionButton
              key={n}
              label={String(n)}
              selected={rosterSize === n}
              accent={EMERALD}
              onPress={() => setRosterSize(n)}
            />
          ))}
        </XStack>
      </FieldSection>

      {/* Draft Position */}
      <FieldSection
        label="Your Draft Position"
        labelId="pick-label"
        helper={
          <Paragraph
            fontFamily="$body"
            fontSize={12}
            color="$gray10"
            textAlign="center"
            margin={0}
          >
            {draftOrder === 'snake' ? 'Snake' : 'Linear'} draft — you pick{' '}
            {draftOrder === 'snake'
              ? userPickPosition === 1
                ? 'first every odd round'
                : userPickPosition === numTeams
                  ? 'first every even round'
                  : `at position ${userPickPosition}`
              : `at position ${userPickPosition} every round`}
          </Paragraph>
        }
      >
        <XStack gap="$2" flexWrap="wrap" justifyContent="center">
          {Array.from({ length: numTeams }, (_, i) => i + 1).map((pos) => (
            <OptionButton
              key={pos}
              label={String(pos)}
              selected={userPickPosition === pos}
              accent={BRAND_GOLD}
              onPress={() => setUserPickPosition(pos)}
              width={48}
            />
          ))}
        </XStack>
      </FieldSection>

      {/* Draft Order */}
      <FieldSection label="Draft Order" labelId="draft-order-label">
        <XStack gap="$2" flexWrap="wrap" justifyContent="center">
          {DRAFT_ORDER_OPTIONS.map((opt) => (
            <OptionButton
              key={opt.value}
              label={opt.label}
              selected={draftOrder === opt.value}
              accent={BRAND_GOLD}
              onPress={() => setDraftOrder(opt.value)}
            />
          ))}
        </XStack>
      </FieldSection>

      {/* Player Pool */}
      <FieldSection label="Player Pool" labelId="player-pool-label">
        <XStack gap="$2" flexWrap="wrap" justifyContent="center">
          {PLAYER_POOL_OPTIONS.map((opt) => (
            <OptionButton
              key={opt.value}
              label={opt.label}
              selected={playerPool === opt.value}
              accent={BRAND_GOLD}
              onPress={() => setPlayerPool(opt.value)}
            />
          ))}
        </XStack>
      </FieldSection>

      {/* Error */}
      {error && (
        <YStack
          backgroundColor={withAlpha(BRAND_SEAM_RED, 0.15)}
          borderWidth={1}
          borderColor={withAlpha(BRAND_SEAM_RED, 0.4)}
          borderRadius="$3"
          paddingHorizontal="$3"
          paddingVertical="$2"
          marginBottom="$3"
        >
          <Text fontFamily="$body" fontSize={13} color={BRAND_SEAM_RED}>
            {error}
          </Text>
        </YStack>
      )}

      {/* Weekly-usage helper for free-tier users (LS-5178) */}
      {usageLabel && (
        <Paragraph
          fontFamily="$body"
          fontSize={12}
          color="$gray10"
          textAlign="center"
          marginBottom="$3"
          margin={0}
        >
          {usageLabel}
        </Paragraph>
      )}

      {/* Actions */}
      <XStack gap="$3" marginTop="$2">
        <Button
          size="$5"
          onPress={handleStart}
          disabled={loading || footballPreviewActive}
          flex={1}
          backgroundColor={BRAND_SEAM_RED}
          borderColor={BRAND_SEAM_RED}
          hoverStyle={{ backgroundColor: '#A8182F' }}
          pressStyle={{ scale: 0.98 }}
          opacity={loading || footballPreviewActive ? 0.5 : 1}
          aria-label={
            footballPreviewActive
              ? 'Football mock draft coming soon — engine wiring pending'
              : undefined
          }
        >
          <Text
            fontFamily="$display"
            fontSize={16}
            fontWeight="700"
            color="$color"
            letterSpacing={0.5}
          >
            {startLabel}
          </Text>
        </Button>
        <Button
          size="$5"
          onPress={onCancel}
          backgroundColor="transparent"
          borderColor={BRAND_NAVY_LIGHT}
          borderWidth={1}
          hoverStyle={{ backgroundColor: '$color3' }}
        >
          <Text fontFamily="$body" fontSize={15} color="$gray11">
            Cancel
          </Text>
        </Button>
      </XStack>
    </YStack>
  );
}
