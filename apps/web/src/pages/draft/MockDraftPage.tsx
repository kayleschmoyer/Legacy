import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Text } from 'tamagui';
import {
  Button,
  H1,
  Paragraph,
  XStack,
  YStack,
} from '@legacy-sports/shared-components/ui';
import { FootballMockPoolPreview } from '@legacy-sports/shared-components/draft';
import { useInitializeMockDraftMutation } from '../../api/db/graphql.generated';
import { PremiumGate } from '../../components/PremiumGate';
import { useIsPremium } from '../../hooks/useIsPremium';
import { PageMeta } from '../../components/PageMeta';
import { useFeatureIsOn } from '../../context/GrowthBookProvider';
import {
  BLACK,
  BRAND_GOLD,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  EMERALD,
  GRADIENT_BOARD_BG,
  OVERLAY_WHITE_10,
  SURFACE_CARD,
  withAlpha,
} from '../../constants/colors';

/**
 * GrowthBook flag key that gates the football sport option on this page
 * (ADR 0011 §4, LS-4666). When off, the page behaves exactly as before.
 */
export const FOOTBALL_MOCK_PLAYERS_FLAG = 'football-mock-players';

type SportKind = 'baseball' | 'football';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MockDraftSettings {
  numTeams: number;
  rosterSize: number;
  userPickPosition: number;
  draftOrder: 'snake' | 'linear';
  playerPool: 'all' | 'nl' | 'al';
  sport: SportKind;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DRAFT_ORDER_OPTIONS: { label: string; value: 'snake' | 'linear' }[] = [
  { label: 'Snake', value: 'snake' },
  { label: 'Linear', value: 'linear' },
];

const PLAYER_POOL_OPTIONS: {
  label: string;
  value: 'all' | 'nl' | 'al';
}[] = [
  { label: 'All MLB', value: 'all' },
  { label: 'NL Only', value: 'nl' },
  { label: 'AL Only', value: 'al' },
];

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

// ─── Option button (centered, design-system styling) ─────────────────────────

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
      variant={selected ? 'primary' : 'outlined'}
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
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {label}
      </Text>
    </Button>
  );
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────

interface SetupScreenProps {
  onStart: (settings: MockDraftSettings) => void;
  loading?: boolean;
  error?: string | null;
  /** When true, the Sport selector exposes a Football option (LS-4666). */
  footballMockEnabled?: boolean;
}

function SetupScreen({
  onStart,
  loading = false,
  error = null,
  footballMockEnabled = false,
}: SetupScreenProps): React.JSX.Element {
  const navigate = useNavigate();
  const [numTeams, setNumTeams] = React.useState(8);
  const [rosterSize, setRosterSize] = React.useState(10);
  const [userPickPosition, setUserPickPosition] = React.useState(1);
  const [draftOrder, setDraftOrder] =
    React.useState<MockDraftSettings['draftOrder']>('snake');
  const [playerPool, setPlayerPool] =
    React.useState<MockDraftSettings['playerPool']>('all');
  const [sport, setSport] = React.useState<SportKind>('baseball');

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

  return (
    <YStack
      minHeight="100vh"
      alignItems="center"
      justifyContent="center"
      padding="$5"
      style={{ background: GRADIENT_BOARD_BG }}
    >
      <YStack width="100%" maxWidth={560}>
        {/* Header */}
        <YStack alignItems="center" gap="$3" marginBottom="$7">
          <XStack
            alignItems="center"
            gap="$2"
            paddingHorizontal="$3"
            paddingVertical="$1.5"
            borderRadius={9999}
            backgroundColor={withAlpha(BRAND_SEAM_RED, 0.15)}
            borderWidth={1}
            borderColor={withAlpha(BRAND_SEAM_RED, 0.3)}
          >
            <span role="img" aria-label="Baseball" style={{ fontSize: 14 }}>
              ⚾
            </span>
            <Text
              fontFamily="$display"
              fontSize={12}
              fontWeight="700"
              color={BRAND_SEAM_RED}
              textTransform="uppercase"
              letterSpacing={1.5}
            >
              Practice Mode
            </Text>
          </XStack>
          <H1
            fontFamily="$display"
            fontSize={40}
            fontWeight="800"
            color={BRAND_GOLD}
            letterSpacing={-0.5}
            textAlign="center"
            margin={0}
          >
            Mock Draft Simulator
          </H1>
          <Paragraph
            fontFamily="$body"
            fontSize={16}
            color="$gray11"
            textAlign="center"
            margin={0}
            maxWidth={460}
          >
            Practice your draft strategy against AI opponents without affecting
            any real league.
          </Paragraph>
        </YStack>

        {/* Settings Card */}
        <YStack
          backgroundColor={SURFACE_CARD}
          borderRadius="$6"
          padding="$6"
          borderWidth={1}
          borderColor={OVERLAY_WHITE_10}
          style={{ boxShadow: `0 16px 64px ${withAlpha(BLACK, 0.4)}` }}
        >
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
                Football draft engine wiring lands with the rest of the sport
                toggle slice (LS-4657 → LS-4665). Start is disabled until the
                backend can consume this pool.
              </Paragraph>
            </YStack>
          )}

          {/* Number of Teams */}
          <FieldSection label="Number of Teams" labelId="teams-label">
            <XStack gap="$2" flexWrap="wrap" justifyContent="center">
              {[4, 6, 8, 10, 12].map((n) => (
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
              {[5, 8, 10, 15].map((n) => (
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

          {/* Actions */}
          <XStack gap="$3" marginTop="$2">
            <Button
              size="$5"
              variant="primary"
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
                {loading
                  ? '⏳ Starting…'
                  : footballPreviewActive
                    ? '🏈 Football — Coming Soon'
                    : '🚀 Start Mock Draft'}
              </Text>
            </Button>
            <Button
              size="$5"
              variant="outlined"
              onPress={() => navigate('/baseball')}
              backgroundColor="transparent"
              borderColor={BRAND_NAVY_LIGHT}
              hoverStyle={{ backgroundColor: '$color3' }}
            >
              <Text fontFamily="$body" fontSize={15} color="$gray11">
                Cancel
              </Text>
            </Button>
          </XStack>
        </YStack>

        {/* Info line */}
        <Paragraph
          fontFamily="$body"
          fontSize={12}
          color="$gray10"
          textAlign="center"
          marginTop="$4"
          margin={0}
        >
          Mock drafts don't affect any real leagues • AI opponents use ADP-based
          strategy
        </Paragraph>
      </YStack>
    </YStack>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function MockDraftPage(): React.JSX.Element {
  const navigate = useNavigate();
  const isPremium = useIsPremium();
  const footballMockEnabled = useFeatureIsOn(FOOTBALL_MOCK_PLAYERS_FLAG);
  const [initializeMockDraft, { loading, error }] =
    useInitializeMockDraftMutation();
  const [missingLeagueIdError, setMissingLeagueIdError] = React.useState<
    string | null
  >(null);

  const handleStart = async (s: MockDraftSettings) => {
    // Football mock draft is preview-only until the sport-aware engine ships.
    if (s.sport === 'football') return;
    setMissingLeagueIdError(null);
    const result = await initializeMockDraft({
      variables: {
        numTeams: s.numTeams,
        rosterSize: s.rosterSize,
        userPickPosition: s.userPickPosition,
        pickTimeLimitSeconds: 90,
        draftOrder: s.draftOrder,
        playerPool: s.playerPool,
      },
    });
    const leagueId = result.data?.initializeMockDraft?.leagueId;
    if (leagueId) {
      navigate(`/baseball/league/${leagueId}/draft`);
    } else {
      setMissingLeagueIdError("Couldn't start mock draft — please try again.");
    }
  };

  return (
    <PremiumGate
      isPremium={isPremium}
      featureName="Mock Draft Simulator"
      featureDescription="Practice your draft strategy with the full Mock Draft simulator before the real draft."
    >
      <PageMeta
        title="Mock Draft Simulator"
        description="Practice your fantasy baseball draft strategy risk-free with the full Mock Draft simulator."
      />
      <SetupScreen
        onStart={(s) => {
          void handleStart(s);
        }}
        loading={loading}
        error={error?.message ?? missingLeagueIdError}
        footballMockEnabled={footballMockEnabled}
      />
    </PremiumGate>
  );
}
