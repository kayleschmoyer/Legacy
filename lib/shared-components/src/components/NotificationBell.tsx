import React, { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import {
  Activity,
  ArrowLeftRight,
  Bell,
  Info,
  Star,
} from '@tamagui/lucide-icons';
import { Popover } from './Popover';

export type NotificationItemType = 'draft' | 'trade' | 'matchup' | 'system';

/**
 * A single segment in a notification body. Either plain text or a bold span.
 * Using a data-only union (no JSX) prevents `dangerouslySetInnerHTML` and
 * other arbitrary JSX from being passed.
 */
export type NotificationBodySegment = string | { bold: string };

/**
 * Structured notification body. Pass a plain string for simple messages, or
 * an array of {@link NotificationBodySegment} values to include inline-bold
 * spans interleaved with regular text.
 *
 * @example
 * // Plain string
 * body: "Trade deadline moved to Friday."
 * // Inline bold
 * body: [{ bold: "Iron Horse" }, " accepted the trade."]
 */
export type NotificationBody =
  | NotificationBodySegment
  | NotificationBodySegment[];

export interface NotificationItem {
  id: string;
  type?: NotificationItemType;
  title: string;
  /** Structured body using {@link NotificationBody}. Arbitrary JSX is excluded by type. */
  body?: NotificationBody;
  time: string;
  unread?: boolean;
}

export interface NotificationBellProps {
  items: NotificationItem[];
  onItemPress?: (id: string) => void;
}

function renderBody(body: NotificationBody): React.ReactNode {
  const parts: NotificationBodySegment[] = Array.isArray(body) ? body : [body];
  return parts.map((part, i) =>
    typeof part === 'string' ? (
      <React.Fragment key={i}>{part}</React.Fragment>
    ) : (
      <Text
        key={i}
        fontFamily="$body"
        fontWeight="600"
        fontSize={14}
        color="$color"
      >
        {part.bold}
      </Text>
    ),
  );
}

const TYPE_ICON = {
  draft: Star,
  trade: ArrowLeftRight,
  matchup: Activity,
  system: Info,
} as const;

function NotificationTypeIcon({ type }: { type: NotificationItemType }) {
  const Icon = TYPE_ICON[type];
  let backgroundColor: string;
  let borderColor: string | undefined;
  let iconColor: string;

  switch (type) {
    case 'draft':
      backgroundColor = '$brandSeamRed';
      iconColor = '#fff';
      break;
    case 'trade':
      backgroundColor = '$brandGold';
      iconColor = '#111';
      break;
    case 'matchup':
      backgroundColor = '$brandNavy';
      borderColor = '$brandNavyLight';
      iconColor = '#fff';
      break;
    case 'system':
      backgroundColor = '$surfaceCard';
      borderColor = '$outlineStrong';
      iconColor = '$textMuted';
      break;
  }

  return (
    <YStack
      width={32}
      height={32}
      borderRadius={9999}
      backgroundColor={backgroundColor}
      borderWidth={borderColor ? 1 : 0}
      borderColor={borderColor}
      alignItems="center"
      justifyContent="center"
    >
      <Icon size={16} color={iconColor} />
    </YStack>
  );
}

/**
 * Notification bell with unread count badge (capped at 99+) and a popover
 * list. Trigger is a 44×44 square button styled to the design-system spec.
 * Each item accepts an optional `type` to render a category icon
 * (draft / trade / matchup / system).
 *
 * @see NotificationItem.body for trust requirements on rich-text content.
 */
export function NotificationBell({
  items,
  onItemPress,
}: NotificationBellProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const unread = items.filter((i) => i.unread).length;
  const badgeLabel = unread > 99 ? '99+' : String(unread);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      arrow={false}
      placement="bottom-end"
      trigger={
        <YStack
          width={44}
          height={44}
          borderRadius={12}
          backgroundColor="$surfaceCard"
          borderWidth={1}
          borderColor="$outlineStrong"
          alignItems="center"
          justifyContent="center"
          position="relative"
          cursor="pointer"
          role="button"
          tabIndex={0}
          aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
          onPress={() => setOpen((v) => !v)}
          pressStyle={{ backgroundColor: '$surfacePanel' }}
          hoverStyle={{ borderColor: '$glassBorderHover' }}
        >
          <Bell size={20} color="$fg2" />
          {unread > 0 ? (
            <YStack
              position="absolute"
              top={-5}
              right={-5}
              minWidth={18}
              height={18}
              paddingHorizontal={5}
              borderRadius={9999}
              backgroundColor="$brandSeamRed"
              alignItems="center"
              justifyContent="center"
            >
              <Text
                fontFamily="$heading"
                fontWeight="800"
                fontSize={10}
                color="white"
                lineHeight={18}
              >
                {badgeLabel}
              </Text>
            </YStack>
          ) : null}
        </YStack>
      }
    >
      <YStack minWidth={320} maxWidth={380} gap="$2">
        <XStack
          alignItems="center"
          justifyContent="space-between"
          paddingHorizontal="$2"
        >
          <Text
            fontFamily="$heading"
            fontSize={11}
            letterSpacing={1.4}
            color="$textMuted"
          >
            NOTIFICATIONS
          </Text>
          {unread > 0 ? (
            <Text fontFamily="$mono" fontSize={11} color="$brandGold">
              {unread} new
            </Text>
          ) : null}
        </XStack>
        <YStack
          backgroundColor="$surfacePanel"
          borderWidth={1}
          borderColor="$surfacePanelBorder"
          borderRadius="$5"
          overflow="hidden"
        >
          {items.length === 0 ? (
            <Text
              fontFamily="$body"
              fontSize={13}
              color="$textMuted"
              padding="$3"
            >
              No notifications. The dugout is quiet.
            </Text>
          ) : (
            items.map((it, idx) => (
              <XStack
                key={it.id}
                paddingVertical={14}
                paddingHorizontal={16}
                gap={12}
                alignItems="flex-start"
                borderBottomWidth={idx < items.length - 1 ? 1 : 0}
                borderColor="$outlineSubtle"
                backgroundColor={
                  it.unread ? 'rgba(27, 58, 92, 0.18)' : undefined
                }
                cursor={onItemPress ? 'pointer' : undefined}
                onPress={() => onItemPress?.(it.id)}
                hoverStyle={{ backgroundColor: '$surfaceInteractive' }}
                position="relative"
              >
                {it.unread ? (
                  <YStack
                    position="absolute"
                    left={6}
                    top={18}
                    width={5}
                    height={5}
                    borderRadius={9999}
                    backgroundColor="$brandGold"
                  />
                ) : null}
                <NotificationTypeIcon type={it.type ?? 'system'} />
                <YStack flex={1} gap={2}>
                  <Text
                    fontFamily="$body"
                    fontSize={14}
                    color="$color"
                    lineHeight={20}
                  >
                    {it.body != null ? renderBody(it.body) : it.title}
                  </Text>
                </YStack>
                <Text
                  fontFamily="$mono"
                  fontSize={11}
                  color="$textMuted"
                  whiteSpace="nowrap"
                >
                  {it.time}
                </Text>
              </XStack>
            ))
          )}
        </YStack>
      </YStack>
    </Popover>
  );
}
