/**
 * DraftDetailsPanel (LS-9857) — read-only summary of the draft/league settings
 * managers ask about mid-draft: format, pick clock, player pool, minimum
 * career games, auto-pick, and draft order.
 *
 * Ported from the "Draft Details" block in the draft-board mock
 * (`.detail-line`: label left / value right, hairline separators, last row
 * unruled). Rows come from {@link buildDraftDetailRows}, which derives every
 * value from data the board already fetches — the panel itself is pure
 * presentation and issues no queries.
 *
 * Rendered in both draft-room shells: the desktop rail (DraftRail) and the
 * compact/narrow branch's Team tab (EliteDraftBoardScreen).
 */
import React, { useMemo } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import {
  buildDraftDetailRows,
  type DraftDetailsSettings,
} from './draftDetails';
import {
  SURFACE_PANEL,
  TEXT_MUTED,
  TEXT_PRIMARY,
  WHITE,
  withAlpha,
} from '../../utils/colors';
import { FONT_DISPLAY } from '../../utils/typography';

// Derived via withAlpha() rather than literal rgba() strings so the
// theme-compliance ratchet (scripts/check-theme-compliance.mjs) doesn't flag
// them; see .agents/skills/ui/SKILL.md (epic LS-8518).
const BORDER_HAIRLINE = withAlpha(WHITE, 0.06);

export interface DraftDetailsPanelProps {
  settings: DraftDetailsSettings;
  testID?: string;
}

export function DraftDetailsPanel({
  settings,
  testID = 'draft-details-panel',
}: DraftDetailsPanelProps): React.JSX.Element {
  const rows = useMemo(() => buildDraftDetailRows(settings), [settings]);

  return (
    <YStack
      testID={testID}
      role="region"
      aria-label="Draft details"
      backgroundColor={SURFACE_PANEL}
      borderWidth={1}
      borderColor={BORDER_HAIRLINE}
      borderRadius={12}
      paddingHorizontal={14}
      paddingVertical={12}
      flexShrink={0}
    >
      <Text
        tag="h4"
        margin={0}
        marginBottom={4}
        fontFamily={FONT_DISPLAY}
        fontWeight="700"
        fontSize={11}
        letterSpacing={1.54}
        textTransform="uppercase"
        color={TEXT_MUTED}
      >
        Draft Details
      </Text>
      <YStack role="list">
        {rows.map((row, index) => (
          <XStack
            key={row.key}
            testID={`draft-detail-${row.key}`}
            role="listitem"
            aria-label={`${row.label}: ${row.value}`}
            justifyContent="space-between"
            alignItems="center"
            gap={8}
            paddingVertical={6}
            borderBottomWidth={index === rows.length - 1 ? 0 : 1}
            borderBottomColor={BORDER_HAIRLINE}
          >
            <Text fontSize={13} color={TEXT_MUTED} flexShrink={0}>
              {row.label}
            </Text>
            <Text
              fontSize={13}
              fontWeight="600"
              color={TEXT_PRIMARY}
              textAlign="right"
              flexShrink={1}
            >
              {row.value}
            </Text>
          </XStack>
        ))}
      </YStack>
    </YStack>
  );
}
