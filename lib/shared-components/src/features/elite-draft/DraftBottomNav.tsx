import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import {
  ClipboardList,
  LayoutGrid,
  MessageCircle,
} from '@tamagui/lucide-icons';
import type { DraftRoomTab } from './hooks/useDraftUIState';

export interface DraftBottomNavProps {
  activeTab: DraftRoomTab;
  onChangeTab: (tab: DraftRoomTab) => void;
  /** Shows a 7px seam-red dot on the Chat tab icon (LS-9401, README "Chat
   *  tab" / "Bottom nav"). Driven by `useDraftUIState`'s unread-chat flag. */
  unreadChat?: boolean;
  /**
   * Bottom safe-area inset (e.g. from `useSafeAreaInsets().bottom`), reserved
   * below the tab row. The Draft Room is pushed on top of the root Stack, so —
   * unlike the `(tabs)` shell, whose React Navigation tab bar pads itself — no
   * ancestor accounts for Android's edge-to-edge system navigation bar here,
   * and it drew straight over the tabs (LS-9444). Defaults to 0 for platforms
   * without a safe-area concept (web), mirroring `HomeScreen`/`PlayersCardFeed`'s
   * `topInset` prop.
   */
  bottomInset?: number;
}

/** Height of the tab row itself, excluding any safe-area inset. */
export const DRAFT_BOTTOM_NAV_ROW_HEIGHT = 56;

/**
 * Total height of the bottom nav: the tab row plus the safe-area inset
 * reserved beneath it. The inset is padding, not extra tappable row — the tab
 * targets stay `DRAFT_BOTTOM_NAV_ROW_HEIGHT` tall and sit entirely above the
 * system navigation bar (LS-9444).
 */
export function draftBottomNavHeight(bottomInset = 0): number {
  return DRAFT_BOTTOM_NAV_ROW_HEIGHT + Math.max(bottomInset, 0);
}

const TABS: ReadonlyArray<{
  tab: DraftRoomTab;
  label: string;
  Icon: typeof LayoutGrid;
}> = [
  { tab: 'board', label: 'Board', Icon: LayoutGrid },
  { tab: 'queue', label: 'Queue', Icon: ClipboardList },
  { tab: 'chat', label: 'Chat', Icon: MessageCircle },
];

/**
 * Persistent bottom nav for the Draft Room v2 shell (LS-9397) — README
 * "Bottom nav (persistent)". This component only owns tab selection.
 *
 * No Players tab: the phone player browser lives in the pick sheet raised
 * over the Board tab (LS-10002), so a second route to the same list would
 * only compete with it.
 *
 * No Team tab either, for the same reason: LS-10001 moved the roster into the
 * persistent squad strip pinned directly above this nav, which expands into
 * the full squad sheet (team switcher included). The roster is now always
 * visible rather than one of four destinations.
 */
export function DraftBottomNav({
  activeTab,
  onChangeTab,
  unreadChat,
  bottomInset = 0,
}: DraftBottomNavProps): React.JSX.Element {
  // Clamped once so the padding and the height it is subtracted from can never
  // disagree — a negative inset would otherwise shrink the row below
  // DRAFT_BOTTOM_NAV_ROW_HEIGHT while `draftBottomNavHeight` clamped it.
  const safeBottomInset = Math.max(bottomInset, 0);

  return (
    <XStack
      testID="draft-bottom-nav"
      backgroundColor="$surfaceSubtle"
      borderTopWidth={1}
      borderTopColor="$surfacePanelBorder"
      height={draftBottomNavHeight(safeBottomInset)}
      paddingBottom={safeBottomInset}
    >
      {TABS.map(({ tab, label, Icon }) => {
        const active = tab === activeTab;
        return (
          <XStack
            key={tab}
            testID={`draft-bottom-nav-${tab}`}
            flex={1}
            alignItems="center"
            justifyContent="center"
            onPress={() => onChangeTab(tab)}
            pressStyle={{ opacity: 0.85 }}
            role="tab"
            accessibilityRole="tab"
            aria-label={label}
            accessibilityLabel={label}
            aria-selected={active}
            accessibilityState={{ selected: active }}
          >
            <YStack alignItems="center" justifyContent="center" gap={2}>
              <YStack>
                <Icon size={16} color={active ? '$brandGoldLight' : '$fg4'} />
                {tab === 'chat' && unreadChat && (
                  <YStack
                    testID="draft-bottom-nav-chat-unread-dot"
                    position="absolute"
                    top={-2}
                    right={-4}
                    width={7}
                    height={7}
                    borderRadius={4}
                    backgroundColor="$brandSeamRed"
                  />
                )}
              </YStack>
              <Text
                fontSize={9.5}
                fontWeight="700"
                color={active ? '$brandGoldLight' : '$fg4'}
              >
                {label}
              </Text>
            </YStack>
          </XStack>
        );
      })}
    </XStack>
  );
}
