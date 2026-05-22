import React from 'react';
import { Input as TamaguiInput, Text, TextArea, XStack, YStack } from 'tamagui';
import type { GetProps } from 'tamagui';

export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<
  GetProps<typeof TamaguiInput>,
  'size'
> {
  /** Optional label rendered above the input. */
  label?: string;
  /** Optional helper / hint text rendered below the input. */
  helperText?: string;
  /** Error message — when present, the input renders in error state. */
  error?: string;
  /** Leading adornment (e.g. an icon node). */
  leading?: React.ReactNode;
  /** Trailing adornment (e.g. an icon node or button). */
  trailing?: React.ReactNode;
  /** Input size. Defaults to `md`. */
  size?: InputSize;
}

const SIZE_HEIGHT: Record<InputSize, number> = { sm: 32, md: 40, lg: 48 };
const SIZE_FONT: Record<InputSize, number> = { sm: 13, md: 15, lg: 16 };

function FormLabelText({ children }: { children: string }): React.JSX.Element {
  return (
    <Text
      fontFamily="$heading"
      fontSize={11}
      fontWeight="700"
      letterSpacing={1.1}
      textTransform="uppercase"
      color="$textMuted"
    >
      {children}
    </Text>
  );
}

/**
 * Heritage-styled text input. 6px radius (per design spec), Literata body
 * type, brand-navy focus ring, seam-red error treatment.
 */
export function Input({
  label,
  helperText,
  error,
  leading,
  trailing,
  size = 'md',
  ...props
}: InputProps): React.JSX.Element {
  const hasError = Boolean(error);
  const height = SIZE_HEIGHT[size];
  const fontSize = SIZE_FONT[size];

  return (
    <YStack gap="$1" width="100%">
      {label ? <FormLabelText>{label}</FormLabelText> : null}

      <XStack
        alignItems="center"
        height={height}
        borderWidth={1}
        borderRadius={6}
        borderColor={hasError ? '$brandSeamRed' : '$outlineStrong'}
        backgroundColor="$surfacePanel"
        paddingHorizontal={leading ? 8 : 12}
        gap="$2"
        focusStyle={{
          borderColor: hasError ? '$brandSeamRed' : '$brandNavyLight',
        }}
      >
        {leading ? <XStack alignItems="center">{leading}</XStack> : null}
        <TamaguiInput
          unstyled
          flex={1}
          height="100%"
          fontFamily="$body"
          fontSize={fontSize}
          color="$color"
          placeholderTextColor="$textMuted"
          borderWidth={0}
          backgroundColor="transparent"
          paddingHorizontal={0}
          {...props}
        />
        {trailing ? <XStack alignItems="center">{trailing}</XStack> : null}
      </XStack>

      {error ? (
        <Text fontFamily="$body" fontSize={12} color="$brandSeamRedLight">
          {error}
        </Text>
      ) : helperText ? (
        <Text fontFamily="$body" fontSize={12} color="$textMuted">
          {helperText}
        </Text>
      ) : null}
    </YStack>
  );
}

export interface TextareaProps extends Omit<GetProps<typeof TextArea>, 'size'> {
  label?: string;
  helperText?: string;
  error?: string;
}

/** Multi-line variant of Input. */
export function Textarea({
  label,
  helperText,
  error,
  ...props
}: TextareaProps): React.JSX.Element {
  const hasError = Boolean(error);
  return (
    <YStack gap="$1" width="100%">
      {label ? <FormLabelText>{label}</FormLabelText> : null}
      <TextArea
        unstyled
        minHeight={96}
        borderWidth={1}
        borderRadius={6}
        borderColor={hasError ? '$brandSeamRed' : '$outlineStrong'}
        backgroundColor="$surfacePanel"
        paddingHorizontal={12}
        paddingVertical={8}
        fontFamily="$body"
        fontSize={15}
        color="$color"
        placeholderTextColor="$textMuted"
        focusStyle={{
          borderColor: hasError ? '$brandSeamRed' : '$brandNavyLight',
        }}
        {...props}
      />
      {error ? (
        <Text fontFamily="$body" fontSize={12} color="$brandSeamRedLight">
          {error}
        </Text>
      ) : helperText ? (
        <Text fontFamily="$body" fontSize={12} color="$textMuted">
          {helperText}
        </Text>
      ) : null}
    </YStack>
  );
}
