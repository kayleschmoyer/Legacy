// Internal cross-platform building blocks shared by the premium league-create
// field components. Ported from the web LeagueCreatePage local helpers so web
// and mobile render identical controls (LS-5174). Built from pressable Tamagui
// stacks (no raw `div`/`span` web-isms, no `Button` dependency) so they render
// on both web and React Native.

import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { Lock } from '@tamagui/lucide-icons';
import { BRAND_GOLD } from '../../../utils/colors';

interface OptionButtonGroupProps<T extends string | number> {
  value: T;
  options: readonly (
    | T
    | { value: T; label: string; disabled?: boolean; locked?: boolean }
  )[];
  onChange: (v: T) => void;
  disabled?: boolean;
  /** Stretch each button to fill the row evenly. */
  wide?: boolean;
  /** testID prefix; each button gets `${testIDPrefix}-${value}`. */
  testIDPrefix?: string;
}

/** Segmented button group. Selected option uses the navy/gold brand treatment. */
export function OptionButtonGroup<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  wide,
  testIDPrefix,
}: OptionButtonGroupProps<T>): React.JSX.Element {
  return (
    <XStack flexWrap="wrap" gap="$1.5">
      {options.map((o) => {
        const val = typeof o === 'object' ? o.value : o;
        const label = typeof o === 'object' ? o.label : String(o);
        const itemDisabled = disabled || (typeof o === 'object' && o.disabled);
        const selected = value === val;
        // A locked option is a premium-gated choice. It stays pressable (so the
        // caller's onChange can route to an upgrade flow) but shows a proactive
        // Lock icon + dashed gold border so free users see it is gated before
        // they tap. Mirrors EraFilterGrid's locked treatment.
        const locked = !selected && typeof o === 'object' && !!o.locked;
        return (
          <XStack
            key={String(val)}
            testID={testIDPrefix ? `${testIDPrefix}-${String(val)}` : undefined}
            accessibilityRole="button"
            accessibilityLabel={label}
            aria-label={label}
            onPress={() => !itemDisabled && onChange(val)}
            flex={wide ? 1 : undefined}
            minWidth={44}
            gap="$1.5"
            paddingHorizontal="$3"
            paddingVertical="$2"
            alignItems="center"
            justifyContent="center"
            borderRadius="$4"
            borderWidth={selected ? 2 : 1}
            borderStyle={locked ? 'dashed' : 'solid'}
            backgroundColor={selected ? '$brandNavyLight' : '$color2'}
            borderColor={
              selected
                ? '$brandNavyLight'
                : locked
                  ? '$brandGold'
                  : '$borderColor'
            }
            opacity={itemDisabled ? 0.5 : 1}
            cursor={itemDisabled ? 'default' : 'pointer'}
            hoverStyle={
              itemDisabled
                ? undefined
                : {
                    backgroundColor: selected ? '$brandNavy' : '$color3',
                    borderColor: selected ? '$brandNavy' : '$borderColorHover',
                  }
            }
            pressStyle={itemDisabled ? undefined : { scale: 0.95 }}
          >
            {locked && <Lock size={12} color={BRAND_GOLD} />}
            <Text
              color={selected ? '$brandGold' : '$color'}
              fontWeight={selected ? '600' : '400'}
            >
              {label}
            </Text>
          </XStack>
        );
      })}
    </XStack>
  );
}

interface PillToggleProps {
  value: boolean;
  offLabel: string;
  onLabel: string;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  testID?: string;
}

/** Rounded on/off toggle matching the web league-create pill control. */
export function PillToggle({
  value,
  offLabel,
  onLabel,
  onChange,
  disabled,
  testID,
}: PillToggleProps): React.JSX.Element {
  return (
    <XStack
      testID={testID}
      borderWidth={1}
      borderColor="$borderColor"
      borderRadius={9999}
      padding={3}
      alignSelf="flex-start"
    >
      {[
        { label: offLabel, v: false },
        { label: onLabel, v: true },
      ].map(({ label, v }) => {
        const selected = value === v;
        return (
          <XStack
            key={label}
            accessibilityRole="button"
            accessibilityLabel={label}
            aria-label={label}
            onPress={() => !disabled && onChange(v)}
            paddingHorizontal="$3"
            paddingVertical="$1.5"
            alignItems="center"
            justifyContent="center"
            borderRadius={9999}
            backgroundColor={selected ? '$brandNavyLight' : 'transparent'}
            opacity={disabled ? 0.5 : 1}
            cursor={disabled ? 'default' : 'pointer'}
            hoverStyle={
              disabled
                ? undefined
                : { backgroundColor: selected ? '$brandNavy' : '$color3' }
            }
            pressStyle={disabled ? undefined : { scale: 0.97 }}
          >
            <Text
              fontFamily="$display"
              fontWeight="700"
              fontSize={12}
              letterSpacing={0.8}
              textTransform="uppercase"
              color={selected ? 'white' : '$gray10'}
            >
              {label}
            </Text>
          </XStack>
        );
      })}
    </XStack>
  );
}

interface LeagueFieldRowProps {
  label: string;
  labelId?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}

/** Labeled field wrapper (uppercase display label + optional hint). */
export function LeagueFieldRow({
  label,
  labelId,
  hint,
  required,
  children,
}: LeagueFieldRowProps): React.JSX.Element {
  return (
    <YStack gap="$2">
      <XStack gap="$2" alignItems="center">
        <Text
          id={labelId}
          fontFamily="$display"
          fontWeight="700"
          fontSize={11}
          letterSpacing={1.4}
          textTransform="uppercase"
          color="$color11"
        >
          {label}
        </Text>
        {required && (
          <Text
            fontFamily="$body"
            fontWeight="700"
            fontSize={12}
            color="$red10"
          >
            Required
          </Text>
        )}
      </XStack>
      {children}
      {hint && (
        <Text fontFamily="$body" fontSize={12} color="$gray9">
          {hint}
        </Text>
      )}
    </YStack>
  );
}
