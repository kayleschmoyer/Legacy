/**
 * Shared Tamagui mock components for use in Jest test files.
 *
 * Usage in spec files:
 *   jest.mock('tamagui', () => jest.requireActual('../__test-utils__/tamagui-mocks').tamaguiMocks);
 *   // or with a relative path adjusted for the spec file location
 */
import React from 'react';
import type {
  Pressable as RNPressable,
  Text as RNText,
  View as RNView,
} from 'react-native';

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
  Pressable: typeof RNPressable;
};

type RNWithTextInput = RNComponents & {
  TextInput: typeof import('react-native').TextInput;
};

function getRN(): RNWithTextInput {
  // jest.requireActual is safe inside mock factories and test utilities
  return jest.requireActual<RNWithTextInput>('react-native');
}

/**
 * Full set of Tamagui component mocks backed by plain React Native primitives.
 * Each mock accepts a superset of the props used across our test suite.
 */
export const tamaguiMocks = {
  Button: ({
    children,
    onPress,
    disabled,
    ...rest
  }: {
    children: React.ReactNode;
    onPress?: (e?: unknown) => void;
    disabled?: boolean;
    [key: string]: unknown;
  }) => {
    const { Pressable, Text } = getRN();
    // Wrap plain string/number children in Text to satisfy RN's constraint;
    // render non-text children (e.g. View/XStack for loading spinners) directly.
    const content =
      typeof children === 'string' || typeof children === 'number'
        ? React.createElement(Text, null, children)
        : children;
    return React.createElement(
      Pressable,
      {
        onPress: disabled ? undefined : onPress,
        disabled,
        accessibilityRole: 'button',
        testID: rest.testID as string | undefined,
      },
      content,
    );
  },

  Card: Object.assign(
    ({
      children,
      onPress,
      ...rest
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      [key: string]: unknown;
    }) => {
      const { Pressable } = getRN();
      return React.createElement(
        Pressable,
        { onPress, testID: rest.testID as string | undefined },
        children,
      );
    },
    {
      Header: ({
        children,
      }: {
        children: React.ReactNode;
        [key: string]: unknown;
      }) => {
        const { View } = getRN();
        return React.createElement(View, null, children);
      },
    },
  ),

  H1: ({ children }: { children: React.ReactNode; [key: string]: unknown }) => {
    const { Text } = getRN();
    return React.createElement(Text, null, children);
  },

  H2: ({ children }: { children: React.ReactNode; [key: string]: unknown }) => {
    const { Text } = getRN();
    return React.createElement(Text, null, children);
  },

  H3: ({ children }: { children: React.ReactNode; [key: string]: unknown }) => {
    const { Text } = getRN();
    return React.createElement(Text, null, children);
  },

  H4: ({ children }: { children: React.ReactNode; [key: string]: unknown }) => {
    const { Text } = getRN();
    return React.createElement(Text, null, children);
  },

  Input: ({
    value,
    onChangeText,
    placeholder,
    disabled,
    maxLength,
  }: {
    value?: string;
    onChangeText?: (text: string) => void;
    placeholder?: string;
    disabled?: boolean;
    maxLength?: number;
    [key: string]: unknown;
  }) => {
    const { TextInput } = getRN();
    return React.createElement(TextInput, {
      value,
      onChangeText,
      placeholder,
      editable: !disabled,
      maxLength,
    });
  },

  ScrollView: ({
    children,
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => {
    const { View } = getRN();
    return React.createElement(View, null, children);
  },

  Spinner: () => {
    const { View } = getRN();
    return React.createElement(View, { testID: 'spinner' });
  },

  Text: ({
    children,
    onPress,
    ...rest
  }: {
    children: React.ReactNode;
    onPress?: () => void;
    [key: string]: unknown;
  }) => {
    const { Text } = getRN();
    return React.createElement(Text, { onPress, ...rest }, children);
  },

  XStack: ({
    children,
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => {
    const { View } = getRN();
    return React.createElement(View, null, children);
  },

  YStack: ({
    children,
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => {
    const { View } = getRN();
    return React.createElement(View, null, children);
  },
};
