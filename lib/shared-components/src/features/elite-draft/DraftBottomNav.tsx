import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import {
  ClipboardList,
  LayoutGrid,
  List,
  MessageCircle,
  Users,
} from '@tamagui/lucide-icons';
import type { DraftRoomTab } from './hooks/useDraftUIState';

export interface DraftBottomNavProps {
  activeTab: DraftRoomTab;
  onChangeTab: (tab: DraftRoomTab) => void;
}

const TABS: ReadonlyArray<{
  tab: DraftRoomTab;
  label: string;
  Icon: typeof LayoutGrid;
}> = [
  { tab: 'board', label: 'Board', Icon: LayoutGrid },
  { tab: 'players', label: 'Players', Icon: List },
  { tab: 'queue', label: 'Queue', Icon: ClipboardList },
  { tab: 'team', label: 'Team', Icon: Users },
  { tab: 'chat', label: 'Chat', Icon: MessageCircle },
];

/**
 * Persistent 5-tab bottom nav for the Draft Room v2 shell (LS-9397) —
 * README "Bottom nav (persistent)". Tab bodies are wired by siblings 2-6;
 * this component only owns tab selection.
 */
export function DraftBottomNav({
  activeTab,
  onChangeTab,
}: DraftBottomNavProps): React.JSX.Element {
  return (
    <XStack
      testID="draft-bottom-nav"
      backgroundColor="$surfaceSubtle"
      borderTopWidth={1}
      borderTopColor="$surfacePanelBorder"
      height={56}
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
              <Icon size={16} color={active ? '$brandGoldLight' : '$fg4'} />
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
