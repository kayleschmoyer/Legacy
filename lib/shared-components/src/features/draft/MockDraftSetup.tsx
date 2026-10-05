/**
 * MockDraftSetup — shared, cross-platform Mock Draft configuration form.
 *
 * Extracted from the canonical web `MockDraftPage` setup screen (LS-7711) so
 * web and native render the same battle-tested settings form instead of
 * maintaining parallel forks. This component owns the interactive settings
 * (team count, draft position, draft order, player pool, Shared-mode pick
 * timer, optional sport toggle) plus the Start/Cancel actions and inline
 * error/usage surfaces.
 *
 * Page-level chrome stays with each consumer: web wraps this in its gradient
 * background + "Practice Mode" card and supplies premium gating + data fetching;
 * native wraps it in a ScrollView and passes its Premium upsell via `header`.
 * Both supply navigation and the `createMockDraft` wiring through `onStart`
 * / `onCancel`, keeping this component purely presentational and platform-safe
 * (Tamagui primitives only — no DOM-only constructs).
 */
import React from 'react';
import { Button, Paragraph, Text, XStack, YStack } from 'tamagui';
import {
  BRAND_GOLD,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  EMERALD,
  withAlpha,
} from '../../utils/colors';

// ─── Types ───────────────────────────────────────────────────────────────────

export type MockDraftOrder = 'snake' | 'linear';
/**
 * Player pool restriction. `all` is shared by both sports; the league-scoped
 * values are sport-specific (baseball: NL/AL, football: AFC/NFC conference)
 * and mirror `VALID_POOLS_BY_SPORT` on the server, which rejects a pool that
 * does not belong to the submitted sport.
 */
export type MockDraftPlayerPool = 'all' | 'nl' | 'al' | 'afc' | 'nfc';
export type MockDraftSport = 'baseball' | 'football';
/**
 * Draft Mode (LS-9144, LS-9181):
 * - 'shared': default — invite real friends to join before it starts; any
 *   slots still open when the draft starts fall back to AI.
 * - 'offline': solo practice — no pick clock, pause/resume at your own pace.
 */
export type MockDraftMode = 'shared' | 'offline';

/**
 * A mock draft always drafts a full sport-default roster (LS-10086) — the
 * server derives the roster size from `DEFAULT_ROSTER_SIZE_BY_SPORT` and seeds
 * the sport's default starting lineup into `league_positions`, so there is no
 * roster-size setting to collect here. A shorter roster left most of the depth
 * chart unfillable.
 */
export interface MockDraftSettings {
  numTeams: number;
  userPickPosition: number;
  draftOrder: MockDraftOrder;
  playerPool: MockDraftPlayerPool;
  sport: MockDraftSport;
  mode: MockDraftMode;
  /** Premium (LS-9253): the user makes every pick for every team — no CPU
   *  auto-picker anywhere on the board. Always untimed regardless of `mode`. */
  controlAllTeams: boolean;
  /**
   * Shared mode only (LS-10076): a public lobby is joinable by anyone who has
   * its link, without an invite code. Ignored for Offline.
   */
  isPublic: boolean;
  /**
   * Per-pick clock in seconds for a Shared (online) draft (LS-10466). Always
   * populated; consumers drop it for Offline / Control All Teams drafts, which
   * are untimed by design (the server applies its own untimed sentinel).
   */
  pickTimeLimitSeconds: number;
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
  /** When true, exposes the Sport selector (baseball / football) (LS-4666). */
  footballMockEnabled?: boolean;
  /**
   * Invoked whenever the Sport selection changes, so the consumer can keep its
   * own page chrome (badge, copy, cancel destination) in step with the form.
   */
  onSportChange?: (sport: MockDraftSport) => void;
  /** Prefill team count (e.g. when launched from a real league row). */
  initialNumTeams?: number;
  /** Prefill draft order. */
  initialDraftOrder?: MockDraftOrder;
  /** Free-tier weekly-usage helper (e.g. "1 of 2 free mock drafts used"). */
  usageLabel?: string;
  /** Optional content rendered above the settings (e.g. a Premium upsell). */
  header?: React.ReactNode;
  /**
   * Invoked when the user taps "Have an invite code?" (only shown in Shared
   * mode). Consumer owns navigation to the join-by-code screen (LS-9181).
   */
  onJoinInstead?: () => void;
  /**
   * Opens the Mock Drafts hub (LS-10079): public lobbies to join, the user's
   * own mock drafts and their invites. Hidden when omitted.
   */
  onBrowseMockDrafts?: () => void;
  /**
   * Whether the current user's plan grants Control All Teams (LS-9253).
   * Defaults to false. When false the option is still shown (an upgrade
   * surface, not hidden) but selecting it calls `onControlAllTeamsUpgrade`
   * instead of enabling the setting — server-side `createMockDraft`
   * enforces the real gate regardless of this prop.
   */
  isControlAllTeamsEntitled?: boolean;
  /** Invoked when a non-entitled user taps the Control All Teams option. */
  onControlAllTeamsUpgrade?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TEAM_OPTIONS = [4, 6, 8, 10, 12] as const;

const DRAFT_ORDER_OPTIONS: { label: string; value: MockDraftOrder }[] = [
  { label: 'Snake', value: 'snake' },
  { label: 'Linear', value: 'linear' },
];

const DRAFT_MODE_OPTIONS: {
  label: string;
  value: MockDraftMode;
  helper: string;
}[] = [
  {
    label: 'Shared',
    value: 'shared',
    helper: 'Invite friends to join. Open slots fall back to AI at start.',
  },
  {
    label: 'Offline',
    value: 'offline',
    helper: 'No clock — pause and pick at your own pace.',
  },
];

/**
 * Pick-timer choices for Shared (online) drafts (LS-10466). All within the
 * 10–300s range `createMockDraft` accepts; 90s matches the previous fixed
 * clock so the default experience is unchanged.
 */
const PICK_TIMER_OPTIONS = [30, 60, 90, 120] as const;
const DEFAULT_PICK_TIME_LIMIT_SECONDS = 90;

/** Shared-lobby visibility (LS-10076). */
const VISIBILITY_OPTIONS: { label: string; value: boolean }[] = [
  { label: 'Private', value: false },
  { label: 'Public', value: true },
];

const CONTROL_ALL_TEAMS_OPTIONS: {
  label: string;
  value: boolean;
  helper: string;
}[] = [
  {
    label: 'Off',
    value: false,
    helper: 'Practice against AI-controlled opponents.',
  },
  {
    label: 'On',
    value: true,
    helper:
      'You make every pick for every team — always untimed, no CPU opponents.',
  },
];

interface PlayerPoolOption {
  label: string;
  value: MockDraftPlayerPool;
}

/**
 * Player Pool choices per sport (LS-9470). Selecting a sport swaps the whole
 * option set — a baseball league can never be created with an AFC/NFC pool
 * (and vice versa), which is exactly what `createMockDraft` enforces
 * server-side.
 */
const PLAYER_POOL_OPTIONS_BY_SPORT: Record<MockDraftSport, PlayerPoolOption[]> =
  {
    baseball: [
      { label: 'All MLB', value: 'all' },
      { label: 'NL Only', value: 'nl' },
      { label: 'AL Only', value: 'al' },
    ],
    football: [
      { label: 'All NFL', value: 'all' },
      { label: 'AFC Only', value: 'afc' },
      { label: 'NFC Only', value: 'nfc' },
    ],
  };

/** Helper copy under the Player Pool selector, per sport. */
const PLAYER_POOL_HELPER_BY_SPORT: Record<MockDraftSport, string> = {
  baseball:
    'Restricts the draft board to players with a season in the chosen league.',
  football:
    'Restricts the draft board to players on a team in the chosen conference.',
};

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
  /**
   * Visible-but-locked upgrade surface (LS-9253 AC2): renders a lock glyph
   * and dims the label without hiding or disabling the button — `onPress`
   * still fires (callers route it to an upgrade CTA instead of the normal
   * selection handler).
   */
  locked?: boolean;
  testID?: string;
}

function OptionButton({
  label,
  selected,
  accent,
  onPress,
  width,
  locked = false,
  testID,
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
      aria-label={locked ? `${label} (requires Premium)` : undefined}
      testID={testID}
    >
      <XStack alignItems="center" gap="$1.5">
        {locked && (
          <Text fontSize={13} aria-hidden={true}>
            🔒
          </Text>
        )}
        <Text
          fontFamily="$body"
          fontSize={15}
          fontWeight={selected ? '700' : '500'}
          color={locked ? '$gray10' : selected ? '$color' : '$gray11'}
        >
          {label}
        </Text>
      </XStack>
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
  onSportChange,
  initialNumTeams,
  initialDraftOrder,
  usageLabel,
  header,
  onJoinInstead,
  onBrowseMockDrafts,
  isControlAllTeamsEntitled = false,
  onControlAllTeamsUpgrade,
}: MockDraftSetupProps): React.JSX.Element {
  const [numTeams, setNumTeams] = React.useState(
    initialNumTeams != null ? clampToTeamOption(initialNumTeams) : 8,
  );
  const [userPickPosition, setUserPickPosition] = React.useState(1);
  const [draftOrder, setDraftOrder] = React.useState<MockDraftOrder>(
    initialDraftOrder ?? 'snake',
  );
  const [playerPool, setPlayerPool] =
    React.useState<MockDraftPlayerPool>('all');
  const [sport, setSport] = React.useState<MockDraftSport>('baseball');
  const [mode, setMode] = React.useState<MockDraftMode>('shared');
  const [controlAllTeams, setControlAllTeams] = React.useState(false);
  const [isPublic, setIsPublic] = React.useState(false);
  const [pickTimeLimitSeconds, setPickTimeLimitSeconds] =
    React.useState<number>(DEFAULT_PICK_TIME_LIMIT_SECONDS);

  // Changing sport resets the pool to the sport-neutral 'all' so a stale
  // baseball pool (nl/al) can never be submitted with sport=football — the
  // server rejects those combinations outright.
  const handleSportChange = (next: MockDraftSport) => {
    if (next === sport) return;
    setSport(next);
    setPlayerPool('all');
    onSportChange?.(next);
  };

  const handleStart = () => {
    onStart({
      numTeams,
      userPickPosition,
      draftOrder,
      playerPool,
      sport,
      // Control All Teams is always untimed — no CPU opponents to wait on.
      mode: controlAllTeams ? 'offline' : mode,
      controlAllTeams,
      // Only a Shared lobby can be public — an offline draft has no one to
      // join it (server CHECK drafts_public_mock_ck).
      isPublic: !controlAllTeams && mode === 'shared' && isPublic,
      pickTimeLimitSeconds,
    });
  };

  const playerPoolOptions = PLAYER_POOL_OPTIONS_BY_SPORT[sport];

  const startLabel = loading ? 'Starting…' : 'Start Mock Draft';

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
              onPress={() => handleSportChange('baseball')}
              width={140}
            />
            <OptionButton
              label="🏈 Football"
              selected={sport === 'football'}
              accent={BRAND_GOLD}
              onPress={() => handleSportChange('football')}
              width={140}
            />
          </XStack>
        </FieldSection>
      )}

      {/* Draft Mode — offline (no clock) vs shared (timed) (LS-9144) */}
      <FieldSection
        label="Draft Mode"
        labelId="mode-label"
        helper={
          <Paragraph
            fontFamily="$body"
            fontSize={12}
            color="$gray10"
            textAlign="center"
            margin={0}
          >
            {DRAFT_MODE_OPTIONS.find((opt) => opt.value === mode)?.helper}
          </Paragraph>
        }
      >
        <XStack gap="$2" flexWrap="wrap" justifyContent="center">
          {DRAFT_MODE_OPTIONS.map((opt) => (
            <OptionButton
              key={opt.value}
              label={opt.label}
              selected={mode === opt.value}
              accent={EMERALD}
              onPress={() => {
                setMode(opt.value);
                // Shared (real multiplayer, LS-9181) and Control All Teams
                // (solo, LS-9253) are mutually exclusive — picking Shared
                // here backs out of Control All Teams rather than leaving it
                // on and silently forcing Offline again at submit time.
                if (opt.value === 'shared') setControlAllTeams(false);
              }}
              width={140}
            />
          ))}
        </XStack>
        {mode === 'shared' && (
          <XStack
            gap="$2"
            flexWrap="wrap"
            justifyContent="center"
            marginTop="$2"
          >
            {VISIBILITY_OPTIONS.map((opt) => (
              <OptionButton
                key={String(opt.value)}
                label={opt.label}
                selected={isPublic === opt.value}
                accent={EMERALD}
                onPress={() => setIsPublic(opt.value)}
                width={140}
                testID={`mock-draft-visibility-${opt.label.toLowerCase()}`}
              />
            ))}
          </XStack>
        )}
        {mode === 'shared' && onJoinInstead && (
          <XStack justifyContent="center" marginTop="$2">
            <Button
              size="$2"
              backgroundColor="transparent"
              borderWidth={0}
              onPress={onJoinInstead}
              pressStyle={{ opacity: 0.7 }}
            >
              <Text
                fontFamily="$body"
                fontSize={13}
                fontWeight="600"
                color={BRAND_GOLD}
                textDecorationLine="underline"
              >
                Have an invite code? Join a friend&apos;s draft →
              </Text>
            </Button>
          </XStack>
        )}
        {onBrowseMockDrafts && (
          <XStack justifyContent="center" marginTop="$1">
            <Button
              size="$2"
              backgroundColor="transparent"
              borderWidth={0}
              onPress={onBrowseMockDrafts}
              pressStyle={{ opacity: 0.7 }}
              testID="mock-draft-browse-hub"
            >
              <Text
                fontFamily="$body"
                fontSize={13}
                fontWeight="600"
                color={BRAND_GOLD}
                textDecorationLine="underline"
              >
                Browse public lobbies and your mock drafts →
              </Text>
            </Button>
          </XStack>
        )}
      </FieldSection>

      {/* Pick Timer — Shared (online) drafts only (LS-10466). Offline and
          Control All Teams drafts are untimed by design, so the control is
          hidden there (Control All Teams forces the mode to Offline). */}
      {mode === 'shared' && (
        <FieldSection
          label="Pick Timer"
          labelId="pick-timer-label"
          helper={
            <Paragraph
              fontFamily="$body"
              fontSize={12}
              color="$gray10"
              textAlign="center"
              margin={0}
            >
              How long each drafter has to make a pick.
            </Paragraph>
          }
        >
          <XStack gap="$2" flexWrap="wrap" justifyContent="center">
            {PICK_TIMER_OPTIONS.map((seconds) => (
              <OptionButton
                key={seconds}
                label={`${seconds}s`}
                selected={pickTimeLimitSeconds === seconds}
                accent={EMERALD}
                onPress={() => setPickTimeLimitSeconds(seconds)}
                testID={`mock-draft-pick-timer-${seconds}`}
              />
            ))}
          </XStack>
        </FieldSection>
      )}

      {/* Control All Teams — premium (LS-9253). Visible to free users but
          gated: selecting "On" without the entitlement routes to the upgrade
          CTA instead of enabling the setting (AC2) — server-side
          createMockDraft is the real enforcement (AC3) regardless. */}
      <FieldSection
        label="Control All Teams"
        labelId="control-all-teams-label"
        helper={
          <Paragraph
            fontFamily="$body"
            fontSize={12}
            color="$gray10"
            textAlign="center"
            margin={0}
          >
            {
              CONTROL_ALL_TEAMS_OPTIONS.find(
                (opt) => opt.value === controlAllTeams,
              )?.helper
            }
            {!isControlAllTeamsEntitled &&
              ' Premium unlocks making every pick yourself.'}
          </Paragraph>
        }
      >
        <XStack gap="$2" flexWrap="wrap" justifyContent="center">
          {CONTROL_ALL_TEAMS_OPTIONS.map((opt) => {
            const locked = opt.value && !isControlAllTeamsEntitled;
            return (
              <OptionButton
                key={String(opt.value)}
                label={opt.label}
                selected={controlAllTeams === opt.value}
                accent={BRAND_GOLD}
                locked={locked}
                width={140}
                onPress={() => {
                  if (locked) {
                    onControlAllTeamsUpgrade?.();
                    return;
                  }
                  setControlAllTeams(opt.value);
                  // Mutually exclusive with Shared (LS-9181) — force the
                  // visible Draft Mode selection to Offline so the UI never
                  // shows "Shared" selected while Control All Teams is on.
                  if (opt.value) setMode('offline');
                }}
              />
            );
          })}
        </XStack>
      </FieldSection>

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

      {/* Player Pool — options follow the selected sport (LS-9470) */}
      <FieldSection
        label="Player Pool"
        labelId="player-pool-label"
        helper={
          <Paragraph
            fontFamily="$body"
            fontSize={12}
            color="$gray10"
            textAlign="center"
            margin={0}
          >
            {PLAYER_POOL_HELPER_BY_SPORT[sport]}
          </Paragraph>
        }
      >
        <XStack gap="$2" flexWrap="wrap" justifyContent="center">
          {playerPoolOptions.map((opt) => (
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
          disabled={loading}
          flex={1}
          backgroundColor={BRAND_SEAM_RED}
          borderColor={BRAND_SEAM_RED}
          hoverStyle={{ backgroundColor: '#A8182F' }}
          pressStyle={{ scale: 0.98 }}
          opacity={loading ? 0.5 : 1}
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
