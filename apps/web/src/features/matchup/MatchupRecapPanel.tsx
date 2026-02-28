/**
 * MatchupRecapPanel — auto-generated narrative recap for a completed matchup.
 *
 * Displayed on the MatchupDetailPage when the matchup status is `completed`.
 * The recap is generated server-side by the @legacy-sports/narrative library
 * and exposed via the `recap` field on the `Matchup` GraphQL type.
 */

import React from 'react';
import {
  Card,
  Paragraph,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { BookOpen, Star, Trophy } from '@tamagui/lucide-icons';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../constants/colors';
import { useGetMatchupRecapQuery } from '../../api/db/graphql.generated';

// ── Props ─────────────────────────────────────────────────────────────────────

interface MatchupRecapPanelProps {
  matchupId: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Fetches and renders the narrative recap for a completed matchup.
 * Returns null while loading or if the matchup has no recap yet.
 */
export function MatchupRecapPanel({ matchupId }: MatchupRecapPanelProps) {
  const { data, loading, error } = useGetMatchupRecapQuery({
    variables: { id: matchupId },
    fetchPolicy: 'cache-first',
  });

  if (loading) {
    return (
      <YStack alignItems="center" padding="$4">
        <Spinner size="small" color={BRAND_NAVY_LIGHT} />
      </YStack>
    );
  }

  if (error || !data?.getMatchupById?.recap) {
    // Silently hide — recap is only available for completed matchups
    return null;
  }

  const { headline, narrative, highlights, matchupType } =
    data.getMatchupById.recap;

  const isBlowout = matchupType === 'blowout';
  const isClose = matchupType === 'close';

  return (
    <Card
      overflow="hidden"
      borderRadius="$6"
      borderWidth={1}
      borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.35)}
      width="100%"
    >
      {/* Header */}
      <XStack
        alignItems="center"
        gap="$2"
        paddingHorizontal="$4"
        paddingVertical="$3"
        backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
        borderBottomWidth={1}
        borderBottomColor={withAlpha(BRAND_NAVY_LIGHT, 0.25)}
      >
        <BookOpen size={16} color={BRAND_GOLD_LIGHT} />
        <Text
          fontSize="$3"
          fontWeight="700"
          color={BRAND_GOLD_LIGHT}
          letterSpacing={0.5}
        >
          MATCHUP RECAP
        </Text>
        {isBlowout && (
          <XStack
            marginLeft="auto"
            paddingHorizontal="$2"
            paddingVertical="$0.5"
            borderRadius="$4"
            backgroundColor={withAlpha(BRAND_GOLD, 0.15)}
          >
            <Text fontSize="$1" color={BRAND_GOLD} fontWeight="600">
              BLOWOUT
            </Text>
          </XStack>
        )}
        {isClose && (
          <XStack
            marginLeft="auto"
            paddingHorizontal="$2"
            paddingVertical="$0.5"
            borderRadius="$4"
            backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.2)}
          >
            <Text fontSize="$1" color={BRAND_NAVY_LIGHT} fontWeight="600">
              CLOSE GAME
            </Text>
          </XStack>
        )}
      </XStack>

      <YStack padding="$4" gap="$3">
        {/* Headline */}
        <XStack alignItems="flex-start" gap="$2">
          <Trophy size={18} color={BRAND_GOLD} marginTop={2} />
          <Text
            flex={1}
            fontSize="$5"
            fontWeight="800"
            lineHeight={24}
            color="$color12"
          >
            {headline}
          </Text>
        </XStack>

        <Separator borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.2)} />

        {/* Narrative */}
        <Paragraph fontSize="$3" lineHeight={22} color="$color11">
          {narrative}
        </Paragraph>

        {/* Highlights */}
        {(highlights?.length ?? 0) > 0 && (
          <>
            <Separator borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.2)} />
            <YStack gap="$2">
              <XStack alignItems="center" gap="$1.5">
                <Star size={14} color={BRAND_GOLD_LIGHT} />
                <Text
                  fontSize="$2"
                  fontWeight="700"
                  color={BRAND_GOLD_LIGHT}
                  letterSpacing={0.4}
                >
                  STANDOUT PERFORMANCES
                </Text>
              </XStack>
              {(highlights ?? []).map((highlight, idx) => (
                <XStack key={idx} alignItems="flex-start" gap="$2">
                  <Text fontSize="$2" color={BRAND_GOLD} marginTop={1}>
                    •
                  </Text>
                  <Text flex={1} fontSize="$2" lineHeight={18} color="$color11">
                    {highlight}
                  </Text>
                </XStack>
              ))}
            </YStack>
          </>
        )}
      </YStack>
    </Card>
  );
}
