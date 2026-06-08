/**
 * PremiumTradeTools — Trade Analyzer and Value Calculator panels for TradingCenter
 *
 * Features:
 *  - Trade Analyzer: select any pending offer and see a positional-value
 *    breakdown with a fairness verdict
 *  - Value Calculator: reference table of per-position fantasy values for
 *    baseball and football
 *
 * Entitlement-gated: non-premium users see a lock overlay prompting upgrade.
 */
import React, { useState } from 'react';
import { Card, Text, XStack, YStack } from 'tamagui';
import {
  BarChart2,
  Calculator,
  ChevronDown,
  ChevronUp,
  Lock,
  TrendingDown,
  TrendingUp,
  Zap,
} from '@tamagui/lucide-icons';
import { Button } from '../../Button';
import type { TradeOfferFragment } from '../../api/db/graphql.generated';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  SURFACE_CARD,
  SURFACE_PANEL,
  withAlpha,
} from '../../utils/colors';

// ── Position value table ──────────────────────────────────────────────────────
// Positional scarcity drives value: rare spots (SP, C, SS, QB) score higher.

const POSITION_VALUES: Record<string, number> = {
  // Baseball
  SP: 8.5,
  C: 7.5,
  SS: 8.0,
  '3B': 7.5,
  '2B': 7.0,
  '1B': 7.0,
  CF: 7.0,
  OF: 6.5,
  LF: 6.5,
  RF: 6.5,
  DH: 6.5,
  RP: 6.0,
  // Football
  QB: 9.0,
  RB: 8.5,
  WR: 8.0,
  TE: 8.0,
  FLEX: 7.5,
  DEF: 6.0,
  K: 5.5,
};

const DEFAULT_VALUE = 6.0;
const MAX_POSITION_VALUE = 9.5;

function positionValue(pos: string | null | undefined): number {
  if (!pos) return DEFAULT_VALUE;
  return POSITION_VALUES[pos.toUpperCase()] ?? DEFAULT_VALUE;
}

export function tradeValue(
  players: { playerPosition?: string | null }[],
): number {
  if (players.length === 0) return 0;
  return players.reduce((sum, p) => sum + positionValue(p.playerPosition), 0);
}

// ── Verdict ───────────────────────────────────────────────────────────────────

type Verdict =
  | 'fair'
  | 'slight-edge-you'
  | 'strong-edge-you'
  | 'slight-edge-them'
  | 'strong-edge-them';

export function getVerdict(youGiveValue: number, youGetValue: number): Verdict {
  const diff = youGetValue - youGiveValue;
  const base = youGiveValue > 0 ? youGiveValue : 1;
  const pct = Math.abs(diff) / base;
  if (pct < 0.05) return 'fair';
  if (diff > 0) return pct > 0.2 ? 'strong-edge-you' : 'slight-edge-you';
  return pct > 0.2 ? 'strong-edge-them' : 'slight-edge-them';
}

const VERDICT_CONFIG: Record<
  Verdict,
  {
    label: string;
    color: string;
    bg: string;
    border: string;
    icon: 'up' | 'down' | 'flat';
  }
> = {
  fair: {
    label: 'Balanced trade',
    color: '$green11',
    bg: '$green3',
    border: '$green7',
    icon: 'flat',
  },
  'slight-edge-you': {
    label: 'Slight edge in your favor',
    color: '$amber11',
    bg: '$amber3',
    border: '$amber7',
    icon: 'up',
  },
  'strong-edge-you': {
    label: 'Strong edge in your favor',
    color: '$green11',
    bg: '$green3',
    border: '$green7',
    icon: 'up',
  },
  'slight-edge-them': {
    label: 'Slight edge for the other team',
    color: '$amber11',
    bg: '$amber3',
    border: '$amber7',
    icon: 'down',
  },
  'strong-edge-them': {
    label: 'Strong edge for the other team',
    color: '$red11',
    bg: '$red3',
    border: '$red7',
    icon: 'down',
  },
};

// ── Sub-components ────────────────────────────────────────────────────────────

interface ValueBarProps {
  label: string;
  value: number;
  maxValue: number;
  color: string;
}

function ValueBar({ label, value, maxValue, color }: ValueBarProps) {
  const pct = Math.min(100, (value / maxValue) * 100);
  return (
    <YStack gap="$1">
      <XStack alignItems="center" justifyContent="space-between">
        <Text fontSize="$2" color="$color" fontWeight="600">
          {label}
        </Text>
        <Text fontSize="$2" color="$textMuted" fontVariant={['tabular-nums']}>
          {value.toFixed(1)}
        </Text>
      </XStack>
      <YStack
        height={6}
        backgroundColor="$surfaceSubtle"
        borderRadius="$10"
        overflow="hidden"
      >
        <YStack
          height="100%"
          width={`${pct}%`}
          backgroundColor={color}
          borderRadius="$10"
        />
      </YStack>
    </YStack>
  );
}

// ── TradeAnalyzer ─────────────────────────────────────────────────────────────

interface TradeAnalyzerProps {
  userTeamId: number;
  pendingTrades: TradeOfferFragment[];
}

function TradeAnalyzer({ userTeamId, pendingTrades }: TradeAnalyzerProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selected = pendingTrades.find((t) => t.id === selectedId) ?? null;

  if (pendingTrades.length === 0) {
    return (
      <Card
        backgroundColor="$surfacePanel"
        borderColor="$surfacePanelBorder"
        borderWidth={1}
        padding="$4"
        borderRadius="$5"
        data-testid="trade-analyzer-empty"
      >
        <Text color="$textMuted" fontSize="$3" textAlign="center">
          No pending trade offers to analyze. Propose or receive a trade to get
          started.
        </Text>
      </Card>
    );
  }

  return (
    <YStack gap="$3">
      {/* Offer selector */}
      <YStack gap="$2">
        <Text fontSize="$2" color="$textMuted" fontWeight="600">
          Select a trade to analyze:
        </Text>
        {pendingTrades.map((trade) => {
          const isIncoming =
            trade.receivingTeamId === userTeamId &&
            trade.proposingTeamId !== userTeamId;
          const counterpart = isIncoming
            ? (trade.proposingTeamName ?? 'Unknown Team')
            : (trade.receivingTeamName ?? 'Unknown Team');
          const isSelected = trade.id === selectedId;
          return (
            <Button
              key={trade.id}
              backgroundColor={
                isSelected
                  ? withAlpha(BRAND_NAVY_LIGHT, 0.18)
                  : '$surfaceSubtle'
              }
              borderColor={
                isSelected ? withAlpha(BRAND_NAVY_LIGHT, 0.5) : '$outlineSubtle'
              }
              borderWidth={1}
              borderRadius="$4"
              padding="$2.5"
              onPress={() =>
                setSelectedId(isSelected ? null : (trade.id ?? null))
              }
              justifyContent="flex-start"
              animation="quick"
              pressStyle={{ scale: 0.98 }}
            >
              <XStack alignItems="center" gap="$2" flex={1}>
                <Text fontSize="$2" color="$textMuted">
                  {isIncoming ? 'From:' : 'To:'}
                </Text>
                <Text
                  fontSize="$2"
                  fontWeight="700"
                  color={isSelected ? BRAND_GOLD_LIGHT : '$color'}
                  flex={1}
                >
                  {counterpart}
                </Text>
                <Text fontSize="$1" color="$textMuted">
                  {(trade.players ?? []).length} player
                  {(trade.players ?? []).length !== 1 ? 's' : ''}
                </Text>
              </XStack>
            </Button>
          );
        })}
      </YStack>

      {/* Analysis panel */}
      {selected != null && (
        <TradeAnalysisPanel trade={selected} userTeamId={userTeamId} />
      )}
    </YStack>
  );
}

// ── TradeAnalysisPanel ────────────────────────────────────────────────────────

interface TradeAnalysisPanelProps {
  trade: TradeOfferFragment;
  userTeamId: number;
}

function TradeAnalysisPanel({ trade, userTeamId }: TradeAnalysisPanelProps) {
  const givePlayers = (trade.players ?? []).filter(
    (p) => p.fromTeamId === userTeamId,
  );
  const getPlayers = (trade.players ?? []).filter(
    (p) => p.fromTeamId !== userTeamId,
  );

  const giveValue = tradeValue(givePlayers);
  const getValue = tradeValue(getPlayers);
  const totalMax = Math.max(giveValue, getValue, 1) * 1.1;

  const verdict = getVerdict(giveValue, getValue);
  const vConfig = VERDICT_CONFIG[verdict];

  return (
    <Card
      backgroundColor={withAlpha(SURFACE_PANEL, 0.8)}
      borderColor="$surfacePanelBorder"
      borderWidth={1}
      borderRadius="$5"
      padding="$4"
      gap="$4"
      data-testid="trade-analysis-panel"
    >
      {/* Value bars */}
      <XStack gap="$4">
        <YStack flex={1} gap="$2">
          <Text
            fontSize="$2"
            color="$textMuted"
            fontWeight="700"
            textTransform="uppercase"
            letterSpacing={0.5}
          >
            You Give
          </Text>
          {givePlayers.length === 0 ? (
            <Text fontSize="$2" color="$textSubtle" fontStyle="italic">
              —
            </Text>
          ) : (
            givePlayers.map((p) => (
              <ValueBar
                key={p.id}
                label={p.playerName ?? 'Unknown'}
                value={positionValue(p.playerPosition)}
                maxValue={MAX_POSITION_VALUE}
                color="$red9"
              />
            ))
          )}
          {givePlayers.length > 0 && (
            <XStack
              borderTopWidth={1}
              borderTopColor="$outlineSubtle"
              paddingTop="$1"
              alignItems="center"
              justifyContent="space-between"
            >
              <Text fontSize="$1" color="$textMuted" fontWeight="600">
                TOTAL
              </Text>
              <Text
                fontSize="$2"
                color="$red11"
                fontWeight="700"
                fontVariant={['tabular-nums']}
              >
                {giveValue.toFixed(1)}
              </Text>
            </XStack>
          )}
        </YStack>

        <YStack
          width={1}
          backgroundColor="$outlineSubtle"
          alignSelf="stretch"
        />

        <YStack flex={1} gap="$2">
          <Text
            fontSize="$2"
            color="$textMuted"
            fontWeight="700"
            textTransform="uppercase"
            letterSpacing={0.5}
          >
            You Get
          </Text>
          {getPlayers.length === 0 ? (
            <Text fontSize="$2" color="$textSubtle" fontStyle="italic">
              —
            </Text>
          ) : (
            getPlayers.map((p) => (
              <ValueBar
                key={p.id}
                label={p.playerName ?? 'Unknown'}
                value={positionValue(p.playerPosition)}
                maxValue={MAX_POSITION_VALUE}
                color="$green9"
              />
            ))
          )}
          {getPlayers.length > 0 && (
            <XStack
              borderTopWidth={1}
              borderTopColor="$outlineSubtle"
              paddingTop="$1"
              alignItems="center"
              justifyContent="space-between"
            >
              <Text fontSize="$1" color="$textMuted" fontWeight="600">
                TOTAL
              </Text>
              <Text
                fontSize="$2"
                color="$green11"
                fontWeight="700"
                fontVariant={['tabular-nums']}
              >
                {getValue.toFixed(1)}
              </Text>
            </XStack>
          )}
        </YStack>
      </XStack>

      {/* Overall value bar comparison */}
      <YStack gap="$2">
        <ValueBar
          label="You Give"
          value={giveValue}
          maxValue={totalMax}
          color="$red9"
        />
        <ValueBar
          label="You Get"
          value={getValue}
          maxValue={totalMax}
          color="$green9"
        />
      </YStack>

      {/* Verdict badge */}
      <XStack
        backgroundColor={vConfig.bg}
        borderColor={vConfig.border}
        borderWidth={1}
        borderRadius="$4"
        padding="$3"
        alignItems="center"
        justifyContent="center"
        gap="$2"
        data-testid="trade-verdict"
      >
        {vConfig.icon === 'up' && (
          <TrendingUp size={16} color={vConfig.color} />
        )}
        {vConfig.icon === 'down' && (
          <TrendingDown size={16} color={vConfig.color} />
        )}
        {vConfig.icon === 'flat' && (
          <BarChart2 size={16} color={vConfig.color} />
        )}
        <Text fontSize="$3" fontWeight="700" color={vConfig.color}>
          {vConfig.label}
        </Text>
      </XStack>

      <Text fontSize="$1" color="$textMuted" textAlign="center">
        Values are based on positional scarcity. Use as a starting point, not a
        final verdict.
      </Text>
    </Card>
  );
}

// ── ValueCalculator ───────────────────────────────────────────────────────────

const BASEBALL_POSITIONS = [
  { pos: 'SP', label: 'Starting Pitcher', value: POSITION_VALUES.SP },
  { pos: 'SS', label: 'Shortstop', value: POSITION_VALUES.SS },
  { pos: 'C', label: 'Catcher', value: POSITION_VALUES.C },
  { pos: '3B', label: 'Third Base', value: POSITION_VALUES['3B'] },
  { pos: '2B', label: 'Second Base', value: POSITION_VALUES['2B'] },
  { pos: '1B', label: 'First Base', value: POSITION_VALUES['1B'] },
  { pos: 'CF', label: 'Center Field', value: POSITION_VALUES.CF },
  { pos: 'OF', label: 'Outfield', value: POSITION_VALUES.OF },
  { pos: 'DH', label: 'Designated Hitter', value: POSITION_VALUES.DH },
  { pos: 'RP', label: 'Relief Pitcher', value: POSITION_VALUES.RP },
];

const FOOTBALL_POSITIONS = [
  { pos: 'QB', label: 'Quarterback', value: POSITION_VALUES.QB },
  { pos: 'RB', label: 'Running Back', value: POSITION_VALUES.RB },
  { pos: 'WR', label: 'Wide Receiver', value: POSITION_VALUES.WR },
  { pos: 'TE', label: 'Tight End', value: POSITION_VALUES.TE },
  { pos: 'FLEX', label: 'Flex', value: POSITION_VALUES.FLEX },
  { pos: 'DEF', label: 'Defense / ST', value: POSITION_VALUES.DEF },
  { pos: 'K', label: 'Kicker', value: POSITION_VALUES.K },
];

function PositionValueTable({
  rows,
}: {
  rows: { pos: string; label: string; value: number }[];
}) {
  return (
    <YStack gap="$1.5">
      {rows.map(({ pos, label, value }) => (
        <XStack
          key={pos}
          alignItems="center"
          gap="$3"
          paddingVertical="$1"
          paddingHorizontal="$2"
          borderRadius="$3"
          hoverStyle={{ backgroundColor: '$surfaceSubtle' }}
        >
          <XStack
            width={36}
            backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
            borderRadius="$2"
            paddingHorizontal="$1.5"
            paddingVertical={2}
            alignItems="center"
            justifyContent="center"
          >
            <Text fontSize="$1" color={BRAND_GOLD_LIGHT} fontWeight="700">
              {pos}
            </Text>
          </XStack>
          <Text fontSize="$2" color="$color" flex={1}>
            {label}
          </Text>
          <XStack alignItems="center" gap="$2" width={80}>
            <YStack
              flex={1}
              height={4}
              backgroundColor="$surfaceSubtle"
              borderRadius="$10"
              overflow="hidden"
            >
              <YStack
                height="100%"
                width={`${(value / MAX_POSITION_VALUE) * 100}%`}
                backgroundColor={BRAND_GOLD_LIGHT}
                borderRadius="$10"
              />
            </YStack>
            <Text
              fontSize="$2"
              color="$textMuted"
              fontVariant={['tabular-nums']}
              minWidth={28}
              textAlign="right"
            >
              {value.toFixed(1)}
            </Text>
          </XStack>
        </XStack>
      ))}
    </YStack>
  );
}

function ValueCalculator() {
  const [sport, setSport] = useState<'baseball' | 'football'>('baseball');

  return (
    <YStack gap="$3" data-testid="value-calculator">
      {/* Sport toggle */}
      <XStack
        backgroundColor="$surfaceSubtle"
        borderRadius="$4"
        padding="$0.5"
        alignSelf="flex-start"
      >
        {(['baseball', 'football'] as const).map((s) => (
          <Button
            key={s}
            size="$2"
            backgroundColor={sport === s ? BRAND_NAVY_LIGHT : 'transparent'}
            borderWidth={0}
            borderRadius="$3"
            onPress={() => setSport(s)}
            animation="quick"
          >
            <Text
              fontSize="$2"
              fontWeight={sport === s ? '700' : '400'}
              color={sport === s ? 'white' : '$textMuted'}
              textTransform="capitalize"
            >
              {s}
            </Text>
          </Button>
        ))}
      </XStack>

      <Text fontSize="$2" color="$textMuted">
        Position value scores reflect fantasy scarcity (scale: 1–10). Higher
        scores indicate positions that are harder to replace on the waiver wire.
      </Text>

      <PositionValueTable
        rows={sport === 'baseball' ? BASEBALL_POSITIONS : FOOTBALL_POSITIONS}
      />
    </YStack>
  );
}

// ── PremiumTradeTools (main export) ───────────────────────────────────────────

export interface PremiumTradeToolsProps {
  userTeamId: number;
  pendingTrades: TradeOfferFragment[];
  /** Whether the current user/league has the `premium` entitlement. */
  isPremium?: boolean;
  /** Called when a non-premium user presses "Upgrade to Premium". */
  onUpgrade?: () => void;
}

type ActiveTab = 'analyzer' | 'calculator';

export function PremiumTradeTools({
  userTeamId,
  pendingTrades,
  isPremium = false,
  onUpgrade,
}: PremiumTradeToolsProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('analyzer');

  return (
    <YStack gap="$3" data-testid="premium-trade-tools">
      {/* Section header / toggle */}
      <Button
        backgroundColor="transparent"
        borderWidth={0}
        onPress={() => setExpanded((v) => !v)}
        paddingHorizontal={0}
        justifyContent="flex-start"
        alignSelf="flex-start"
      >
        <XStack alignItems="center" gap="$2">
          <Zap size={16} color={BRAND_GOLD_LIGHT} />
          <Text fontSize="$4" fontWeight="700" color={BRAND_GOLD_LIGHT}>
            Premium Trade Tools
          </Text>
          {expanded ? (
            <ChevronUp size={14} color={BRAND_GOLD_LIGHT} />
          ) : (
            <ChevronDown size={14} color={BRAND_GOLD_LIGHT} />
          )}
        </XStack>
      </Button>

      {expanded &&
        (isPremium ? (
          <YStack gap="$4">
            {/* Tab bar */}
            <XStack
              backgroundColor="$surfaceSubtle"
              borderRadius="$4"
              padding="$0.5"
              alignSelf="flex-start"
              gap="$0.5"
            >
              <Button
                size="$2"
                backgroundColor={
                  activeTab === 'analyzer' ? BRAND_NAVY_LIGHT : 'transparent'
                }
                borderWidth={0}
                borderRadius="$3"
                onPress={() => setActiveTab('analyzer')}
                animation="quick"
                icon={
                  <BarChart2
                    size={13}
                    color={activeTab === 'analyzer' ? 'white' : '$textMuted'}
                  />
                }
              >
                <Text
                  fontSize="$2"
                  fontWeight={activeTab === 'analyzer' ? '700' : '400'}
                  color={activeTab === 'analyzer' ? 'white' : '$textMuted'}
                >
                  Trade Analyzer
                </Text>
              </Button>
              <Button
                size="$2"
                backgroundColor={
                  activeTab === 'calculator' ? BRAND_NAVY_LIGHT : 'transparent'
                }
                borderWidth={0}
                borderRadius="$3"
                onPress={() => setActiveTab('calculator')}
                animation="quick"
                icon={
                  <Calculator
                    size={13}
                    color={activeTab === 'calculator' ? 'white' : '$textMuted'}
                  />
                }
              >
                <Text
                  fontSize="$2"
                  fontWeight={activeTab === 'calculator' ? '700' : '400'}
                  color={activeTab === 'calculator' ? 'white' : '$textMuted'}
                >
                  Value Calculator
                </Text>
              </Button>
            </XStack>

            {/* Tab content */}
            {activeTab === 'analyzer' ? (
              <TradeAnalyzer
                userTeamId={userTeamId}
                pendingTrades={pendingTrades}
              />
            ) : (
              <ValueCalculator />
            )}
          </YStack>
        ) : (
          /* Premium gate overlay */
          <YStack
            data-testid="premium-trade-tools-gate"
            backgroundColor={withAlpha(SURFACE_CARD, 0.94)}
            borderWidth={1}
            borderColor={withAlpha(BRAND_GOLD, 0.4)}
            borderRadius="$5"
            paddingHorizontal="$5"
            paddingVertical="$5"
            alignItems="center"
            gap="$3"
            style={{ boxShadow: `0 8px 32px ${withAlpha(BRAND_NAVY, 0.5)}` }}
          >
            <Lock size={28} color={BRAND_GOLD_LIGHT} />
            <YStack alignItems="center" gap="$1">
              <Text
                color={BRAND_GOLD}
                fontSize="$5"
                fontWeight="bold"
                textAlign="center"
              >
                Premium Feature
              </Text>
              <Text
                color="$colorSubtle"
                fontSize="$3"
                textAlign="center"
                maxWidth={300}
              >
                Unlock the Trade Analyzer and Value Calculator to make smarter
                deals.
              </Text>
            </YStack>
            {onUpgrade && (
              <Button
                onPress={onUpgrade}
                style={{
                  background: `linear-gradient(135deg, ${BRAND_GOLD} 0%, ${BRAND_GOLD_LIGHT} 100%)`,
                }}
                color={BRAND_NAVY}
                fontWeight="bold"
                pressStyle={{ opacity: 0.85, scale: 0.97 }}
                hoverStyle={{ opacity: 0.92 }}
                borderRadius="$4"
                paddingHorizontal="$5"
              >
                Upgrade to Premium
              </Button>
            )}
          </YStack>
        ))}
    </YStack>
  );
}
