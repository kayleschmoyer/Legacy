import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Linking, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import type { NotablePlaySummary } from './types';

// ---------------------------------------------------------------------------
// PickSplashStatGraphic (native) — notable-play stat graphic for the native
// spectator pick splash (LS-9112).
//
// Native sibling of the web `PickSplashStatGraphic.tsx` (LS-9095), following
// the same deliberate platform fork as the rest of the announcement tree: the
// web graphic is bespoke SVG + CSS keyframes, so this one re-renders the same
// data with RN `Animated` (the pattern already used by the confetti burst in
// `DraftPickAnnouncement.native.tsx`). A single progress value staggers the
// event label and stat chips and completes within ~1.6s, so the graphic reads
// fully even in the 4s catch-up splash window (8s normal hold).
//
// ToS note (spike LS-8945): this renders numbers we computed from feed data —
// no MLB video is embedded, proxied, or rehosted. The optional "Watch on MLB
// Film Room" affordance is a plain user-initiated link-out to MLB's own site
// via `Linking.openURL`.
// ---------------------------------------------------------------------------

/** Human label for the MLB eventType codes the scorer emits. */
const EVENT_LABELS: Record<string, string> = {
  home_run: 'HOME RUN',
  grand_slam: 'GRAND SLAM',
  triple: 'TRIPLE',
  double: 'DOUBLE',
  single: 'SINGLE',
  sac_fly: 'SAC FLY',
  strikeout: 'STRIKEOUT',
  strike_out: 'STRIKEOUT',
  field_out: 'HARD-HIT OUT',
};

function eventLabel(play: NotablePlaySummary): string {
  return (
    EVENT_LABELS[play.eventType] ??
    play.eventType.replace(/_/g, ' ').toUpperCase()
  );
}

const REVEAL_DURATION_MS = 1600;

/**
 * Only ever link out to MLB Film Room itself. The cache row's URL is built
 * server-side, but guarding here keeps a compromised or malformed value from
 * reaching `Linking.openURL` (open-redirect / `javascript:` scheme risk) —
 * anything not under this prefix renders no affordance at all.
 */
const TRUSTED_FILM_ROOM_PREFIX = 'https://www.mlb.com/video/';

function trustedFilmRoomUrl(play: NotablePlaySummary): string | null {
  return play.filmRoomUrl?.startsWith(TRUSTED_FILM_ROOM_PREFIX)
    ? play.filmRoomUrl
    : null;
}

interface StatChip {
  label: string;
  value: string;
}

function chipsFor(play: NotablePlaySummary): StatChip[] {
  if (play.playerRole === 'pitcher') {
    return play.pitchSpeed != null
      ? [
          {
            label: play.pitchType?.toUpperCase() ?? 'PUT-AWAY PITCH',
            value: `${play.pitchSpeed.toFixed(1)} MPH`,
          },
        ]
      : [];
  }
  return [
    play.exitVelocity != null && {
      label: 'EXIT VELO',
      value: `${play.exitVelocity.toFixed(1)} MPH`,
    },
    play.launchAngle != null && {
      label: 'LAUNCH',
      value: `${Math.round(play.launchAngle)}°`,
    },
    play.hitDistance != null && {
      label: 'DISTANCE',
      value: `${Math.round(play.hitDistance)} FT`,
    },
  ].filter((c): c is StatChip => Boolean(c));
}

export interface PickSplashStatGraphicProps {
  /** Cached notable play for the drafted player — null renders nothing. */
  play: NotablePlaySummary | null;
}

export function PickSplashStatGraphic({
  play,
}: PickSplashStatGraphicProps): React.JSX.Element | null {
  const progress = useRef(new Animated.Value(0)).current;

  // Restart the reveal whenever a new play lands (the announcement card stays
  // mounted between queued splashes).
  useEffect(() => {
    if (!play) return;
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: REVEAL_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, play]);

  if (!play) return null;

  const chips = chipsFor(play);
  const isPitcher = play.playerRole === 'pitcher';
  const filmRoomUrl = trustedFilmRoomUrl(play);

  // Each element reveals over its own slice of the shared progress value —
  // label first, then chips left to right (same staggering idea as the web
  // graphic's CSS animation delays). Clamped extrapolation holds the settled
  // values on both sides of the slice.
  const reveal = (from: number) => ({
    opacity: progress.interpolate({
      inputRange: [from, Math.min(from + 0.3, 1)],
      outputRange: [0, 1],
      extrapolate: 'clamp' as const,
    }),
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [from, Math.min(from + 0.3, 1)],
          outputRange: [10, 0],
          extrapolate: 'clamp' as const,
        }),
      },
    ],
  });

  return (
    <YStack
      alignItems="center"
      gap="$2"
      marginTop={10}
      accessibilityRole="summary"
      accessibilityLabel={`Notable play: ${play.description}`}
      testID="splash-stat-graphic"
    >
      <Animated.View style={reveal(0)}>
        <XStack alignItems="center" gap="$2">
          {isPitcher && (
            <Text
              fontFamily="$heading"
              fontSize={26}
              fontWeight="800"
              color="$brandGold"
              accessibilityElementsHidden
            >
              K
            </Text>
          )}
          <Text
            fontFamily="$heading"
            fontSize={17}
            fontWeight="800"
            letterSpacing={1.5}
            color="$brandGoldLight"
            textAlign="center"
          >
            {eventLabel(play)}
          </Text>
        </XStack>
      </Animated.View>

      {chips.length > 0 ? (
        <XStack gap="$2" justifyContent="center" flexWrap="wrap">
          {chips.map((chip, i) => (
            <Animated.View key={chip.label} style={reveal(0.25 + i * 0.18)}>
              <YStack
                alignItems="center"
                backgroundColor="$surfaceCard"
                borderWidth={1}
                borderColor="$outlineDefault"
                borderRadius={10}
                paddingVertical={6}
                paddingHorizontal={12}
              >
                <Text
                  fontFamily="$heading"
                  fontSize={15}
                  fontWeight="800"
                  color="$color"
                >
                  {chip.value}
                </Text>
                <Text
                  fontSize={8.5}
                  fontWeight="700"
                  letterSpacing={1}
                  color="$fg4"
                  marginTop={1}
                >
                  {chip.label}
                </Text>
              </YStack>
            </Animated.View>
          ))}
        </XStack>
      ) : (
        <Animated.View style={reveal(0.25)}>
          <Text
            fontSize={12}
            color="$textMuted"
            textAlign="center"
            numberOfLines={2}
            maxWidth={280}
          >
            {play.description}
          </Text>
        </Animated.View>
      )}

      {filmRoomUrl != null && (
        <Animated.View style={reveal(0.55)}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Watch on MLB Film Room"
            onPress={() => {
              // User-initiated link-out to MLB's own site — never an embedded
              // video (ToS, spike LS-8945). URL is prefix-validated above.
              void Linking.openURL(filmRoomUrl);
            }}
          >
            <Text
              fontSize={11.5}
              fontWeight="700"
              letterSpacing={0.5}
              color="$brandGoldLight"
              textDecorationLine="underline"
              paddingVertical={4}
            >
              Watch on MLB Film Room ↗
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </YStack>
  );
}

export default PickSplashStatGraphic;
