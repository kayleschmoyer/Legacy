import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import {
  ArrowLeftRight,
  CheckCircle,
  RotateCcw,
  Settings,
  ShieldAlert,
  Trophy,
  XCircle,
} from '@tamagui/lucide-icons';
import type { ChatMessage } from '../../hooks/useLeagueChat';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  GREEN,
  INJURY_OUT,
  ORANGE,
  PURPLE,
  SLATE_400,
  withAlpha,
} from '../../constants/colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SystemMessageCardProps {
  message: ChatMessage;
  /** Callback to navigate to another tab by ID */
  onNavigate?: (tabId: string) => void;
  formatTime: (isoString: string) => string;
}

// ---------------------------------------------------------------------------
// Per-type config
// ---------------------------------------------------------------------------
type TradeAction =
  | 'proposed'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'vetoed';

function getTradeConfig(action: TradeAction) {
  switch (action) {
    case 'proposed':
      return {
        icon: <ArrowLeftRight size={16} color={BRAND_NAVY_LIGHT} />,
        accent: withAlpha(BRAND_NAVY_LIGHT, 0.15),
        border: withAlpha(BRAND_NAVY_LIGHT, 0.35),
        badge: {
          label: 'Trade Offer',
          bg: withAlpha(BRAND_NAVY_LIGHT, 0.2),
          color: BRAND_NAVY_LIGHT,
        },
      };
    case 'accepted':
      return {
        icon: <CheckCircle size={16} color="var(--green10)" />,
        accent: withAlpha(GREEN, 0.12),
        border: withAlpha(GREEN, 0.3),
        badge: {
          label: 'Accepted',
          bg: withAlpha(GREEN, 0.2),
          color: 'var(--green10)',
        },
      };
    case 'rejected':
      return {
        icon: <XCircle size={16} color="var(--red10)" />,
        accent: withAlpha(INJURY_OUT, 0.1),
        border: withAlpha(INJURY_OUT, 0.25),
        badge: {
          label: 'Rejected',
          bg: withAlpha(INJURY_OUT, 0.15),
          color: 'var(--red10)',
        },
      };
    case 'cancelled':
      return {
        icon: <RotateCcw size={16} color="var(--gray10)" />,
        accent: withAlpha(SLATE_400, 0.1),
        border: withAlpha(SLATE_400, 0.2),
        badge: {
          label: 'Cancelled',
          bg: withAlpha(SLATE_400, 0.15),
          color: 'var(--gray10)',
        },
      };
    case 'vetoed':
      return {
        icon: <ShieldAlert size={16} color="var(--orange10)" />,
        accent: withAlpha(ORANGE, 0.12),
        border: withAlpha(ORANGE, 0.3),
        badge: {
          label: 'Vetoed',
          bg: withAlpha(ORANGE, 0.2),
          color: 'var(--orange10)',
        },
      };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function SystemMessageCard({
  message,
  onNavigate,
  formatTime,
}: SystemMessageCardProps): React.JSX.Element | null {
  const { messageType, metadata, messageText, createdAt } = message;

  // ── Trade card ────────────────────────────────────────────────────────────
  if (messageType === 'trade' && metadata) {
    const action = (metadata.action as TradeAction | undefined) ?? 'proposed';
    const proposingTeamName = (metadata.proposingTeamName as string) ?? '';
    const receivingTeamName = (metadata.receivingTeamName as string) ?? '';
    const cfg = getTradeConfig(action);

    return (
      <YStack alignItems="center" paddingHorizontal="$4" paddingVertical="$1">
        <YStack
          borderRadius="$4"
          borderWidth={1}
          overflow="hidden"
          maxWidth={420}
          width="100%"
          cursor={onNavigate ? 'pointer' : 'default'}
          animation="quick"
          pressStyle={{ scale: 0.98 }}
          hoverStyle={
            onNavigate
              ? {
                  borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.6),
                  backgroundColor: cfg.accent,
                }
              : {}
          }
          onPress={onNavigate ? () => onNavigate('trades') : undefined}
          style={{
            backgroundColor: cfg.accent,
            borderColor: cfg.border,
          }}
        >
          {/* Header row */}
          <XStack
            paddingHorizontal="$3"
            paddingVertical="$2"
            alignItems="center"
            gap="$2"
            borderBottomWidth={1}
            style={{ borderBottomColor: cfg.border }}
          >
            {cfg.icon}
            <Text fontSize="$3" fontWeight="600" color="$color" flex={1}>
              {proposingTeamName && receivingTeamName
                ? `${proposingTeamName} ↔ ${receivingTeamName}`
                : 'Trade Activity'}
            </Text>
            {/* Action badge */}
            <XStack
              paddingHorizontal="$2"
              paddingVertical="$1"
              borderRadius="$2"
              style={{ backgroundColor: cfg.badge.bg }}
            >
              <Text
                fontSize="$1"
                fontWeight="700"
                style={{ color: cfg.badge.color }}
              >
                {cfg.badge.label}
              </Text>
            </XStack>
          </XStack>

          {/* Body */}
          <YStack paddingHorizontal="$3" paddingVertical="$2" gap="$1">
            <Text
              fontSize="$3"
              color="$color"
              style={{ wordBreak: 'break-word' }}
            >
              {messageText}
            </Text>
            {onNavigate && (
              <Text fontSize="$2" color={BRAND_GOLD_LIGHT} fontWeight="500">
                View in Trades tab →
              </Text>
            )}
          </YStack>

          <Text
            fontSize="$1"
            color="$textMuted"
            paddingHorizontal="$3"
            paddingBottom="$2"
          >
            {formatTime(createdAt)}
          </Text>
        </YStack>
      </YStack>
    );
  }

  // ── Waiver card ───────────────────────────────────────────────────────────
  if (messageType === 'waiver') {
    const teamName = (metadata?.teamName as string) ?? '';
    const playerName = (metadata?.playerName as string) ?? '';

    return (
      <YStack alignItems="center" paddingHorizontal="$4" paddingVertical="$1">
        <YStack
          borderRadius="$4"
          borderWidth={1}
          overflow="hidden"
          maxWidth={420}
          width="100%"
          cursor={onNavigate ? 'pointer' : 'default'}
          animation="quick"
          pressStyle={{ scale: 0.98 }}
          hoverStyle={
            onNavigate
              ? {
                  borderColor: withAlpha(GREEN, 0.5),
                  backgroundColor: withAlpha(GREEN, 0.15),
                }
              : {}
          }
          onPress={onNavigate ? () => onNavigate('free-agents') : undefined}
          style={{
            backgroundColor: withAlpha(GREEN, 0.1),
            borderColor: withAlpha(GREEN, 0.28),
          }}
        >
          {/* Header */}
          <XStack
            paddingHorizontal="$3"
            paddingVertical="$2"
            alignItems="center"
            gap="$2"
            borderBottomWidth={1}
            style={{ borderBottomColor: withAlpha(GREEN, 0.28) }}
          >
            <Trophy size={16} color="var(--green10)" />
            <Text fontSize="$3" fontWeight="600" color="$color" flex={1}>
              Waiver Wire
            </Text>
            <XStack
              paddingHorizontal="$2"
              paddingVertical="$1"
              borderRadius="$2"
              style={{ backgroundColor: withAlpha(GREEN, 0.2) }}
            >
              <Text fontSize="$1" fontWeight="700" color="$green10">
                Claim
              </Text>
            </XStack>
          </XStack>

          {/* Body */}
          <YStack paddingHorizontal="$3" paddingVertical="$2" gap="$1">
            {teamName && playerName ? (
              <XStack gap="$2" alignItems="center" flexWrap="wrap">
                <Text fontSize="$3" fontWeight="600" color="$color">
                  {teamName}
                </Text>
                <Text fontSize="$3" color="$textMuted">
                  claimed
                </Text>
                <Text fontSize="$3" fontWeight="600" color="$color">
                  {playerName}
                </Text>
              </XStack>
            ) : (
              <Text
                fontSize="$3"
                color="$color"
                style={{ wordBreak: 'break-word' }}
              >
                {messageText}
              </Text>
            )}
            {onNavigate && (
              <Text fontSize="$2" color="$green10" fontWeight="500">
                View in Free Agents →
              </Text>
            )}
          </YStack>

          <Text
            fontSize="$1"
            color="$textMuted"
            paddingHorizontal="$3"
            paddingBottom="$2"
          >
            {formatTime(createdAt)}
          </Text>
        </YStack>
      </YStack>
    );
  }

  // ── Draft settings card ───────────────────────────────────────────────────
  if (messageType === 'draft_settings') {
    const username = (metadata?.username as string) ?? '';
    const changes = metadata?.changes as string[] | undefined;

    return (
      <YStack alignItems="center" paddingHorizontal="$4" paddingVertical="$1">
        <YStack
          borderRadius="$4"
          borderWidth={1}
          overflow="hidden"
          maxWidth={420}
          width="100%"
          cursor={onNavigate ? 'pointer' : 'default'}
          animation="quick"
          pressStyle={{ scale: 0.98 }}
          hoverStyle={
            onNavigate
              ? {
                  borderColor: withAlpha(PURPLE, 0.5),
                  backgroundColor: withAlpha(PURPLE, 0.12),
                }
              : {}
          }
          onPress={onNavigate ? () => onNavigate('commissioner') : undefined}
          style={{
            backgroundColor: withAlpha(PURPLE, 0.08),
            borderColor: withAlpha(PURPLE, 0.25),
          }}
        >
          {/* Header */}
          <XStack
            paddingHorizontal="$3"
            paddingVertical="$2"
            alignItems="center"
            gap="$2"
            borderBottomWidth={1}
            style={{ borderBottomColor: withAlpha(PURPLE, 0.25) }}
          >
            <Settings size={16} color="var(--purple10)" />
            <Text fontSize="$3" fontWeight="600" color="$color" flex={1}>
              Draft Settings Updated
            </Text>
            <XStack
              paddingHorizontal="$2"
              paddingVertical="$1"
              borderRadius="$2"
              style={{ backgroundColor: withAlpha(PURPLE, 0.18) }}
            >
              <Text fontSize="$1" fontWeight="700" color="$purple10">
                Draft
              </Text>
            </XStack>
          </XStack>

          {/* Body */}
          <YStack paddingHorizontal="$3" paddingVertical="$2" gap="$1">
            {username ? (
              <XStack gap="$1" alignItems="center" flexWrap="wrap">
                <Text fontSize="$3" fontWeight="600" color="$color">
                  {username}
                </Text>
                <Text fontSize="$3" color="$textMuted">
                  updated draft settings
                </Text>
              </XStack>
            ) : (
              <Text fontSize="$3" color="$color">
                {messageText}
              </Text>
            )}
            {changes && changes.length > 0 && (
              <XStack gap="$1" flexWrap="wrap">
                {changes.map((c, i) => (
                  <XStack
                    key={i}
                    paddingHorizontal="$2"
                    paddingVertical="$0.5"
                    borderRadius="$2"
                    style={{ backgroundColor: withAlpha(PURPLE, 0.12) }}
                  >
                    <Text fontSize="$1" color="$purple10">
                      {c}
                    </Text>
                  </XStack>
                ))}
              </XStack>
            )}
            {onNavigate && (
              <Text fontSize="$2" color="$purple10" fontWeight="500">
                View in Commissioner →
              </Text>
            )}
          </YStack>

          <Text
            fontSize="$1"
            color="$textMuted"
            paddingHorizontal="$3"
            paddingBottom="$2"
          >
            {formatTime(createdAt)}
          </Text>
        </YStack>
      </YStack>
    );
  }

  // Fallback — should not normally be reached for known types
  return null;
}
