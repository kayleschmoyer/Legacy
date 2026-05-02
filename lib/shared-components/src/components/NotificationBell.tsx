import React, { useState } from 'react';
import { Button, Text, XStack, YStack } from 'tamagui';
import { Bell } from '@tamagui/lucide-icons';
import { Popover } from './Popover';

export interface NotificationItem {
  id: string;
  title: string;
  body?: string;
  time: string;
  unread?: boolean;
}

export interface NotificationBellProps {
  items: NotificationItem[];
  onItemPress?: (id: string) => void;
}

/**
 * Bell icon with unread badge dot. Click to open a popover with the
 * notification list.
 */
export function NotificationBell({
  items,
  onItemPress,
}: NotificationBellProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const unread = items.filter((i) => i.unread).length;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      arrow={false}
      placement="bottom-end"
      trigger={
        <Button
          chromeless
          size="$3"
          circular
          aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
          position="relative"
        >
          <Bell size={20} color="$color" />
          {unread > 0 ? (
            <YStack
              position="absolute"
              top={6}
              right={6}
              width={8}
              height={8}
              borderRadius={9999}
              backgroundColor="$brandSeamRed"
              borderWidth={1.5}
              borderColor="$bg"
            />
          ) : null}
        </Button>
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
        <YStack>
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
            items.map((it) => (
              <YStack
                key={it.id}
                padding="$3"
                borderRadius={8}
                hoverStyle={{ backgroundColor: '$surfaceInteractive' }}
                cursor={onItemPress ? 'pointer' : undefined}
                onPress={() => onItemPress?.(it.id)}
                gap={2}
              >
                <XStack alignItems="center" justifyContent="space-between">
                  <XStack gap="$2" alignItems="center" flex={1}>
                    {it.unread ? (
                      <YStack
                        width={6}
                        height={6}
                        borderRadius={9999}
                        backgroundColor="$brandSeamRed"
                      />
                    ) : null}
                    <Text
                      fontFamily="$body"
                      fontWeight="600"
                      fontSize={14}
                      color="$color"
                    >
                      {it.title}
                    </Text>
                  </XStack>
                  <Text fontFamily="$mono" fontSize={10} color="$textMuted">
                    {it.time}
                  </Text>
                </XStack>
                {it.body ? (
                  <Text fontFamily="$body" fontSize={12} color="$textMuted">
                    {it.body}
                  </Text>
                ) : null}
              </YStack>
            ))
          )}
        </YStack>
      </YStack>
    </Popover>
  );
}
