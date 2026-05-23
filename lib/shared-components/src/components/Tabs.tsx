import React from 'react';
import { Tabs as TamaguiTabs, Text, XStack, YStack } from 'tamagui';

export interface TabItem {
  value: string;
  label: string;
  count?: number;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  /** "underline" = sticky page nav with bottom-rule indicator,
   *  "pill" = secondary segmented sub-nav. */
  variant?: 'underline' | 'pill';
  /** Optional content rendered below the tab list, keyed by tab value. */
  children?: React.ReactNode;
}

/**
 * Underline tabs (with optional counts) or pill segmented sub-nav.
 * Numbers in count badges use tabular figures.
 */
export function Tabs({
  items,
  value,
  onValueChange,
  variant = 'underline',
  children,
}: TabsProps): React.JSX.Element {
  if (variant === 'pill') {
    return (
      <YStack gap="$3">
        <XStack
          gap={0}
          padding={3}
          borderRadius={9999}
          backgroundColor="$surfaceCard"
          borderWidth={1}
          borderColor="$outlineStrong"
          alignSelf="flex-start"
        >
          {items.map((it) => {
            const active = it.value === value;
            return (
              <XStack
                key={it.value}
                paddingHorizontal={14}
                paddingVertical={7}
                borderRadius={9999}
                backgroundColor={active ? '$brandNavy' : 'transparent'}
                onPress={() => !it.disabled && onValueChange(it.value)}
                cursor={it.disabled ? 'not-allowed' : 'pointer'}
                opacity={it.disabled ? 0.5 : 1}
                animation="quick"
              >
                <Text
                  fontFamily="$heading"
                  fontWeight="700"
                  fontSize={11}
                  letterSpacing={0.88}
                  textTransform="uppercase"
                  color={active ? '$textOnAccent' : '$textMuted'}
                >
                  {it.label}
                </Text>
              </XStack>
            );
          })}
        </XStack>
        {children}
      </YStack>
    );
  }

  return (
    <TamaguiTabs
      value={value}
      onValueChange={onValueChange}
      orientation="horizontal"
      flexDirection="column"
    >
      <TamaguiTabs.List
        borderBottomWidth={1}
        borderColor="$outlineStrong"
        gap={0}
        paddingBottom={0}
      >
        {items.map((it) => {
          const active = it.value === value;
          return (
            <TamaguiTabs.Tab
              key={it.value}
              value={it.value}
              disabled={it.disabled}
              unstyled
              paddingHorizontal={18}
              paddingVertical={14}
              borderBottomWidth={2}
              borderColor={active ? '$brandGold' : 'transparent'}
              cursor={it.disabled ? 'not-allowed' : 'pointer'}
              opacity={it.disabled ? 0.5 : 1}
              animation="quick"
              hoverStyle={
                !active ? { borderColor: '$outlineStrong' } : undefined
              }
            >
              <XStack gap={6} alignItems="center">
                <Text
                  fontFamily="$heading"
                  fontWeight="700"
                  fontSize={13}
                  letterSpacing={0.78}
                  textTransform="uppercase"
                  color={active ? '$color12' : '$textMuted'}
                >
                  {it.label}
                </Text>
                {typeof it.count === 'number' ? (
                  <Text
                    fontFamily="$mono"
                    fontSize={11}
                    fontVariant={['tabular-nums']}
                    color={active ? '$brandGoldLight' : '$color11'}
                    paddingHorizontal={6}
                    paddingVertical={1}
                    borderRadius={9999}
                    backgroundColor={
                      active ? 'rgba(197, 165, 90, 0.18)' : '$surfaceCard'
                    }
                  >
                    {it.count}
                  </Text>
                ) : null}
              </XStack>
            </TamaguiTabs.Tab>
          );
        })}
      </TamaguiTabs.List>
      {children}
    </TamaguiTabs>
  );
}
