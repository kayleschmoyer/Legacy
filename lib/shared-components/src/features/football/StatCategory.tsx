import React from 'react';
import { Text, XStack } from 'tamagui';
import { TEXT_MUTED } from '../../utils/colors';
import { FONT_BODY } from '../../utils/typography';

/**
 * A single labeled stat-category row: a short caption ("Pass", "Rush", "Rec",
 * "Kick") followed by its stat chips/lines. The caption disambiguates the
 * otherwise-identical stat labels (e.g. passing YDS vs. rushing YDS) when a
 * multi-category player renders more than one row (LS-6242).
 *
 * Shared by the web player-list card ({@link FootballPlayerCard}) and the
 * mobile players list so the two stay in sync — the caller supplies the
 * per-platform stat chips as `children`.
 */
export function StatCategory({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <XStack flexWrap="wrap" gap={10} alignItems="baseline">
      <Text
        fontSize={11}
        fontWeight="700"
        color={TEXT_MUTED}
        fontFamily={FONT_BODY}
        minWidth={34}
      >
        {label}
      </Text>
      {children}
    </XStack>
  );
}

export default StatCategory;
