import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { StatusBadge, type StatusBadgeVariant } from './StatusBadge';

export interface LeagueCardProps {
  name: string;
  /** e.g. "12 teams · Week 14/22" */
  meta?: string;
  status?: { label: string; variant: StatusBadgeVariant };
  /** Up to 4 avatar URLs/initials for the stack. */
  members?: { name: string; src?: string }[];
  /** Footer text — e.g. "Draft: Fri Apr 12 · 8:00 PM". */
  footer?: string;
  /** Mark as a gold-rimmed premium league. */
  premium?: boolean;
  onPress?: () => void;
}

const Initials = ({ name }: { name: string }): React.JSX.Element => {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <XStack
      width={28}
      height={28}
      borderRadius={9999}
      backgroundColor="$brandNavy"
      borderWidth={1}
      borderColor="$brandGold"
      alignItems="center"
      justifyContent="center"
    >
      <Text
        fontFamily="$heading"
        fontSize={11}
        fontWeight="800"
        color="$color12"
      >
        {initials}
      </Text>
    </XStack>
  );
};

/**
 * Dashboard "My Leagues" tile. Header: title + status; Footer: meta /
 * member stack. Premium variant gets the aged-gold border + glow.
 */
export function LeagueCard({
  name,
  meta,
  status,
  members = [],
  footer,
  premium = false,
  onPress,
}: LeagueCardProps): React.JSX.Element {
  return (
    <YStack
      borderRadius={16}
      borderWidth={1}
      borderColor={premium ? '$brandGold' : '$glassBorder'}
      backgroundColor="$surfaceCard"
      padding="$4"
      gap="$3"
      width="100%"
      cursor={onPress ? 'pointer' : undefined}
      onPress={onPress}
      hoverStyle={
        onPress
          ? {
              borderColor: premium ? '$brandGoldLight' : '$glassBorderHover',
              y: -2,
            }
          : undefined
      }
      pressStyle={onPress ? { scale: 0.98 } : undefined}
      animation="medium"
      shadowColor="rgba(8, 12, 20, 0.55)"
      shadowOffset={{ width: 0, height: 4 }}
      shadowRadius={14}
    >
      <XStack alignItems="flex-start" justifyContent="space-between" gap="$3">
        <YStack flex={1} gap={4}>
          <Text
            fontFamily="$heading"
            fontWeight="800"
            fontSize={20}
            letterSpacing={-0.2}
            color="$color12"
          >
            {name}
          </Text>
          {meta ? (
            <Text fontFamily="$body" fontSize={13} color="$textMuted">
              {meta}
            </Text>
          ) : null}
        </YStack>
        {status ? (
          <StatusBadge label={status.label} variant={status.variant} />
        ) : null}
      </XStack>

      {members.length > 0 ? (
        <XStack gap={-8} alignItems="center">
          {members.slice(0, 4).map((m) => (
            <Initials key={m.name} name={m.name} />
          ))}
          {members.length > 4 ? (
            <Text
              fontFamily="$mono"
              fontSize={12}
              color="$textMuted"
              marginLeft={12}
            >
              +{members.length - 4}
            </Text>
          ) : null}
        </XStack>
      ) : null}

      {footer ? (
        <Text fontFamily="$body" fontSize={12} color="$textMuted">
          {footer}
        </Text>
      ) : null}
    </YStack>
  );
}
