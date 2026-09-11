import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import type { LeagueTeam } from './types';
import { GradientSurface } from '../home/GradientSurface';
import { useThemeTokens } from '../../hooks/useThemeTokens';
import { handleKeyActivate } from '../../utils/keyboardActivation';

export interface DraftChatProps {
  leagueId: number;
  userId: number;
  mentionableTeams: Array<{ id: number; name: string }>;
}

export type DraftChatRenderer = (props: DraftChatProps) => React.ReactNode;

interface DraftChatOverlayProps {
  leagueId: number;
  userId: number;
  leagueTeams: LeagueTeam[];
  onClose: () => void;
  renderChat: DraftChatRenderer;
}

const OVERLAY_WIDTH = 320;

export function DraftChatOverlay({
  leagueId,
  userId,
  leagueTeams,
  onClose,
  renderChat,
}: DraftChatOverlayProps): React.JSX.Element {
  const tokens = useThemeTokens();

  return (
    <YStack
      role="complementary"
      aria-label="League chat"
      position="fixed"
      top={0}
      right={0}
      bottom={0}
      width={OVERLAY_WIDTH}
      zIndex={200}
      overflow="hidden"
      borderLeftWidth={1}
      borderLeftColor="$glassBorder"
      shadowColor="$shadowColor"
      shadowOffset={{ width: -4, height: 0 }}
      shadowRadius={32}
    >
      {/* Both stops resolve to theme tokens: 'surface.bg' is the closest match
          to the pre-port panel's darkest stop (no exact token exists), and
          'surface.surfacePanel' is an exact match for the second stop. */}
      <GradientSurface
        colors={[tokens.surface.bg, tokens.surface.surfacePanel]}
        angle={160}
        flex={1}
        flexDirection="column"
      >
        <XStack
          alignItems="center"
          justifyContent="space-between"
          paddingHorizontal="$4"
          paddingVertical="$3"
          borderBottomWidth={1}
          borderBottomColor="$glassBorder"
          flexShrink={0}
        >
          <XStack alignItems="center" gap="$1.5">
            <Text role="img" accessibilityLabel="chat" fontSize={13}>
              {'\u{1F4AC}'}
            </Text>
            <Text
              fontSize={13}
              fontWeight="700"
              letterSpacing={1.04}
              color="$brandGold"
              textTransform="uppercase"
            >
              League Chat
            </Text>
          </XStack>
          <XStack
            role="button"
            tabIndex={0}
            aria-label="Close league chat"
            onPress={onClose}
            onKeyDown={handleKeyActivate(onClose)}
            alignItems="center"
            justifyContent="center"
            paddingHorizontal={10}
            paddingVertical={4}
            borderRadius="$2"
            backgroundColor="$surfaceInteractive"
            borderWidth={1}
            borderColor="$glassBorder"
            cursor="pointer"
            hoverStyle={{
              backgroundColor: '$backgroundHover',
              borderColor: '$glassBorderHover',
            }}
            pressStyle={{ backgroundColor: '$backgroundPress' }}
          >
            <Text fontSize={14} lineHeight={14} color="$color">
              ✕
            </Text>
          </XStack>
        </XStack>
        <YStack flex={1} overflow="hidden">
          {renderChat({
            leagueId,
            userId,
            mentionableTeams: leagueTeams.map((t) => ({
              id: parseInt(t.id, 10),
              name: t.name,
            })),
          })}
        </YStack>
      </GradientSurface>
    </YStack>
  );
}
