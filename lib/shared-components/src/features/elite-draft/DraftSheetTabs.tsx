/**
 * DraftSheetTabs — the Players / Queue / History segmented control inside the
 * phone pick sheet (LS-10165), design `styles/mobile.css` `.mob-tabs` as
 * rendered in `DraftRoomMobile.html`'s `.mob-picksheet`.
 *
 * This is the phone draft room's in-page navigation. It deliberately lives
 * inside the sheet rather than in a bar of its own: on web at phone width the
 * app keeps its header and fixed `MobileBottomBar` on the draft route, so a
 * draft-owned bottom bar stacked a second nav on top of the app's (LS-10165
 * investigation). The board is the page; everything else is one sheet away.
 */
import React from 'react';
import { Text, XStack } from 'tamagui';

import type { DraftRoomTab } from './hooks/useDraftUIState';
import { handleKeyActivate } from '../../utils/keyboardActivation';

/** Touch-target floor — `.mob-tabs button { min-height: 40px }` plus the
 *  track's 3px padding lands the tap area at 44px. */
const TAB_MIN_HEIGHT = 40;

export const DRAFT_SHEET_TABS: ReadonlyArray<{
  tab: DraftRoomTab;
  label: string;
}> = [
  { tab: 'players', label: 'Players' },
  { tab: 'queue', label: 'Queue' },
  { tab: 'history', label: 'History' },
];

export interface DraftSheetTabsProps {
  activeTab: DraftRoomTab;
  onChangeTab: (tab: DraftRoomTab) => void;
}

export function DraftSheetTabs({
  activeTab,
  onChangeTab,
}: DraftSheetTabsProps): React.JSX.Element {
  return (
    <XStack
      testID="draft-sheet-tabs"
      role="tablist"
      marginHorizontal={12}
      marginTop={10}
      padding={3}
      gap={4}
      borderRadius={9999}
      borderWidth={1}
      borderColor="$surfacePanelBorder"
      backgroundColor="$surfaceSubtle"
    >
      {DRAFT_SHEET_TABS.map(({ tab, label }) => {
        const active = tab === activeTab;
        const select = (): void => onChangeTab(tab);
        return (
          <XStack
            key={tab}
            testID={`draft-sheet-tab-${tab}`}
            flex={1}
            minHeight={TAB_MIN_HEIGHT}
            alignItems="center"
            justifyContent="center"
            borderRadius={9999}
            backgroundColor={active ? '$brandNavy' : 'transparent'}
            onPress={select}
            pressStyle={{ opacity: 0.85 }}
            cursor="pointer"
            role="tab"
            accessibilityRole="tab"
            tabIndex={0}
            onKeyDown={handleKeyActivate(select)}
            aria-label={label}
            accessibilityLabel={label}
            aria-selected={active}
            accessibilityState={{ selected: active }}
          >
            <Text
              fontFamily="$heading"
              fontSize={11}
              fontWeight="700"
              letterSpacing={1.1}
              textTransform="uppercase"
              color={active ? '$color' : '$fg3'}
            >
              {label}
            </Text>
          </XStack>
        );
      })}
    </XStack>
  );
}

export default DraftSheetTabs;
