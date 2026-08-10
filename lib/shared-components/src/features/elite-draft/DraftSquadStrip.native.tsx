/**
 * DraftSquadStrip (native) — the persistent "My Squad" bar pinned above the
 * player list, plus the roster sheet it opens.
 *
 * The strip shows one slot per draft round so the viewer can see their roster
 * filling in without leaving the board; tapping it raises a sheet with the full
 * picks, which is how mobile reaches "My Team" now that the tab bar is gone.
 *
 * Stays native-only: react-native's Pressable has no web build in this
 * codebase; see ./DraftSquadStrip.tsx for the DOM/Tamagui capability shim.
 */
import React from 'react';
import { Pressable } from 'react-native';
import { ScrollView, Text, XStack, YStack } from 'tamagui';
import type { DraftPickRecord, DraftPlayer } from './types';
import {
  buildSquadSlots,
  describeSquadNeed,
  shortPlayerName,
} from './nativeDraftBoard';
import { useDraftPalette } from './nativeDraftPalette';
import { getPositionColor } from './utils';
import { withAlpha } from '../../utils/colors';

export interface DraftSquadStripProps {
  myPicks: DraftPickRecord[];
  myTeam: DraftPlayer[];
  statsLookup: Map<number, DraftPlayer>;
  rounds: number;
  teamName: string;
  /** The viewer is on the clock — light the empty slots up in gold. */
  isMyPick: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

export function DraftSquadStrip({
  myPicks,
  myTeam,
  statsLookup,
  rounds,
  teamName,
  isMyPick,
  open,
  onOpen,
  onClose,
}: DraftSquadStripProps): React.JSX.Element {
  const palette = useDraftPalette();
  const slots = buildSquadSlots({ myPicks, statsLookup, rounds });
  const needText = describeSquadNeed(myTeam);
  // The strip only has room for a handful of slots side by side, so it shows
  // the first six rounds — the filled end of the roster. The sheet below has
  // the complete list.
  const visibleSlots = slots.slice(0, 6);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`My squad, ${myTeam.length} of ${rounds} picks made. Open roster.`}
        onPress={onOpen}
      >
        <YStack
          backgroundColor="$background075"
          borderTopWidth={1}
          borderTopColor="$surfacePanelBorder"
          paddingHorizontal="$3"
          paddingTop={9}
          paddingBottom={13}
        >
          <XStack
            justifyContent="space-between"
            alignItems="baseline"
            marginBottom={7}
          >
            <Text
              fontFamily="$heading"
              fontSize={10}
              fontWeight="800"
              letterSpacing={2}
              textTransform="uppercase"
              color="$brandGoldLight"
            >
              My Squad · {myTeam.length}/{rounds}
            </Text>
            <Text fontSize={10.5} color="$fg4" numberOfLines={1} flexShrink={1}>
              {needText} ▴
            </Text>
          </XStack>

          <XStack gap={6}>
            {visibleSlots.map((slot) => {
              const player = slot.player;
              const positionColor = player
                ? getPositionColor('baseball', player.position)
                : null;
              return (
                <YStack
                  key={slot.round}
                  flex={1}
                  borderWidth={1}
                  borderRadius={9}
                  paddingVertical={5}
                  paddingHorizontal={4}
                  alignItems="center"
                  borderColor={
                    positionColor ??
                    (isMyPick
                      ? withAlpha(palette.gold.gold, 0.45)
                      : palette.surface.outlineDefault)
                  }
                  backgroundColor={
                    positionColor
                      ? withAlpha(positionColor, 0.18)
                      : 'transparent'
                  }
                >
                  <Text
                    fontSize={10.5}
                    fontWeight="800"
                    numberOfLines={1}
                    color={
                      positionColor ??
                      (isMyPick ? palette.gold.goldLight : palette.text.fg4)
                    }
                  >
                    {player ? player.position : `R${slot.round}`}
                  </Text>
                  <Text
                    fontSize={9.5}
                    marginTop={1}
                    numberOfLines={1}
                    color={player ? '$fg1' : '$fg4'}
                  >
                    {player ? shortPlayerName(player.name) : 'open'}
                  </Text>
                </YStack>
              );
            })}
          </XStack>
        </YStack>
      </Pressable>

      {open && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close roster"
            onPress={onClose}
            style={scrimStyle}
          >
            <YStack flex={1} backgroundColor={palette.scrim} />
          </Pressable>

          <YStack
            position="absolute"
            left={0}
            right={0}
            bottom={0}
            zIndex={25}
            maxHeight="64%"
            backgroundColor="$surfacePanel"
            borderTopWidth={1}
            borderTopColor="$brandGold"
            borderTopLeftRadius={18}
            borderTopRightRadius={18}
            paddingHorizontal="$4"
            paddingTop="$3"
            paddingBottom="$5"
            animation="quick"
            enterStyle={{ opacity: 0, y: 40 }}
          >
            <YStack
              width={40}
              height={4}
              borderRadius={2}
              backgroundColor="$outlineDefault"
              alignSelf="center"
              marginBottom={12}
            />
            <XStack
              justifyContent="space-between"
              alignItems="baseline"
              marginBottom={4}
            >
              <Text
                fontFamily="$heading"
                fontSize={19}
                fontWeight="800"
                color="$color"
                flex={1}
                numberOfLines={1}
              >
                {teamName.toUpperCase()}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close roster"
                onPress={onClose}
              >
                <Text fontSize={15} color="$fg4" padding={4}>
                  ✕
                </Text>
              </Pressable>
            </XStack>
            <Text fontSize={11.5} color="$brandGoldLight" marginBottom={12}>
              {needText}
            </Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              <YStack gap={7} paddingBottom="$2">
                {slots.map((slot) => {
                  const player = slot.player;
                  const positionColor = player
                    ? getPositionColor('baseball', player.position)
                    : null;
                  const pick = myPicks.find((p) => p.round === slot.round);
                  return (
                    <XStack
                      key={slot.round}
                      alignItems="center"
                      gap={11}
                      borderWidth={1}
                      borderRadius={12}
                      paddingVertical={11}
                      paddingHorizontal={13}
                      borderColor={
                        positionColor
                          ? '$surfacePanelBorder'
                          : '$outlineDefault'
                      }
                      backgroundColor={
                        positionColor
                          ? withAlpha(positionColor, 0.14)
                          : 'transparent'
                      }
                    >
                      <YStack width={46} flexShrink={0} alignItems="center">
                        <Text
                          fontFamily="$heading"
                          fontSize={15}
                          fontWeight="800"
                          color={positionColor ?? palette.text.fg4}
                        >
                          {player ? player.position : `R${slot.round}`}
                        </Text>
                        <Text fontSize={8.5} color="$fg4" letterSpacing={0.3}>
                          Rd {slot.round}
                        </Text>
                      </YStack>

                      {player ? (
                        <>
                          <YStack flex={1}>
                            <Text
                              fontWeight="600"
                              fontSize={15}
                              color="$color"
                              numberOfLines={1}
                            >
                              {player.name}
                            </Text>
                            <Text fontSize={11} color="$textMuted">
                              {player.position}
                              {pick ? ` · Pick #${pick.overallPick}` : ''}
                            </Text>
                          </YStack>
                          {player.ppg != null && (
                            <Text
                              fontFamily="$heading"
                              fontSize={17}
                              fontWeight="700"
                              color="$brandGoldLight"
                            >
                              {player.ppg.toFixed(1)}
                            </Text>
                          )}
                        </>
                      ) : (
                        <YStack
                          flex={1}
                          borderWidth={1}
                          borderColor="$outlineDefault"
                          borderStyle="dashed"
                          borderRadius={9}
                          paddingVertical={9}
                          paddingHorizontal={12}
                        >
                          <Text fontSize={12.5} fontStyle="italic" color="$fg4">
                            Round {slot.round} — not drafted yet
                          </Text>
                        </YStack>
                      )}
                    </XStack>
                  );
                })}
              </YStack>
            </ScrollView>
          </YStack>
        </>
      )}
    </>
  );
}

const scrimStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 24,
} as const;

export default DraftSquadStrip;
