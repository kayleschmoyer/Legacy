import React from 'react';
import { Input as TamaguiInput, Text, TextArea, XStack, YStack } from 'tamagui';
import type { GetProps } from 'tamagui';
import { tamaguiStyled } from '../utils/tamaguiStyled';

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
  /** Disables the input. */
  disabled?: boolean;
}

const SIZE_HEIGHT: Record<InputSize, number> = { sm: 32, md: 40, lg: 48 };
const SIZE_FONT: Record<InputSize, number> = { sm: 13, md: 15, lg: 16 };

/** Focus-ring shadows — matches the design spec CSS variables */
const SHADOW_FOCUS = '0 0 0 3px rgba(78, 142, 214, 0.22)'; // --focus-ring alpha
const SHADOW_ERROR = '0 0 0 3px rgba(176, 46, 68, 0.22)'; // --danger-soft

// ─────────────────────────────────────────────────────────────────────────────
// Styled primitives
//
// tamaguiStyled() isolates Tamagui's any-typed styled() API from strict lint.
// The `Record<string, unknown> & HasErrorProp` cast avoids `any` in the type
// (which would trigger no-redundant-type-constituents) while accepting all
// props we need to pass. Pattern approved by tamaguiStyled.ts contract.
// ─────────────────────────────────────────────────────────────────────────────

type HasErrorProp = { hasError?: boolean };
type StyledProps = Record<string, unknown> & HasErrorProp;

/**
 * TamaguiInput with hasError variant: routes border, shadow, and focus ring
 * through Tamagui's variant system so focusStyle.style works (see Card.tsx).
 */
const StyledInput = tamaguiStyled(TamaguiInput, {
  variants: {
    hasError: {
      true: {
        borderColor: '$brandSeamRed',
        style: { boxShadow: SHADOW_ERROR },
        focusStyle: {
          borderColor: '$brandSeamRed',
          style: { boxShadow: SHADOW_ERROR },
        },
      },
      false: {
        borderColor: '$outlineStrong',
        style: { boxShadow: 'none' },
        focusStyle: {
          borderColor: '$focusRing',
          style: { boxShadow: SHADOW_FOCUS },
        },
      },
    },
  },
}) as React.ComponentType<StyledProps>;

/** TextArea variant with the same hasError pattern. */
const StyledTextArea = tamaguiStyled(TextArea, {
  variants: {
    hasError: {
      true: {
        borderColor: '$brandSeamRed',
        style: { boxShadow: SHADOW_ERROR },
        focusStyle: {
          borderColor: '$brandSeamRed',
          style: { boxShadow: SHADOW_ERROR },
        },
      },
      false: {
        borderColor: '$outlineStrong',
        style: { boxShadow: 'none' },
        focusStyle: {
          borderColor: '$focusRing',
          style: { boxShadow: SHADOW_FOCUS },
        },
      },
    },
  },
}) as React.ComponentType<StyledProps>;

// ─────────────────────────────────────────────────────────────────────────────

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
 * type, focus-ring border + glow, seam-red error treatment.
 *
 * Variants: default · filled · focused · error · disabled
 * Supports leading / trailing icon adornments and sm/md/lg sizes.
 */
export function Input({
  label,
  helperText,
  error,
  leading,
  trailing,
  size = 'md',
  disabled,
  ...props
}: InputProps): React.JSX.Element {
  const hasError = Boolean(error);
  const height = SIZE_HEIGHT[size];
  const fontSize = SIZE_FONT[size];

  return (
    <YStack
      gap="$1"
      width="100%"
      opacity={disabled ? 0.5 : 1}
      pointerEvents={disabled ? 'none' : 'auto'}
    >
      {label ? <FormLabelText>{label}</FormLabelText> : null}

      {/* Relative wrapper so icon overlays can use position="absolute" */}
      <XStack position="relative" alignItems="center">
        {leading ? (
          <XStack
            position="absolute"
            left={12}
            zIndex={1}
            alignItems="center"
            justifyContent="center"
            height={height}
            pointerEvents="none"
          >
            {leading}
          </XStack>
        ) : null}

        <StyledInput
          unstyled
          hasError={hasError}
          width="100%"
          height={height}
          fontFamily="$body"
          fontSize={fontSize}
          color="$color"
          placeholderTextColor="$color10"
          borderWidth={1}
          borderRadius={6}
          backgroundColor="$surfaceCard"
          paddingLeft={leading ? 38 : 14}
          paddingRight={trailing ? 38 : 14}
          paddingVertical={0}
          disabled={disabled}
          opacity={1}
          {...props}
        />

        {trailing ? (
          <XStack
            position="absolute"
            right={12}
            zIndex={1}
            alignItems="center"
            justifyContent="center"
            height={height}
            pointerEvents="none"
          >
            {trailing}
          </XStack>
        ) : null}
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
  /** Disables the textarea. */
  disabled?: boolean;
}

/** Multi-line variant of Input. Same design tokens and states. */
export function Textarea({
  label,
  helperText,
  error,
  disabled,
  ...props
}: TextareaProps): React.JSX.Element {
  const hasError = Boolean(error);

  return (
    <YStack
      gap="$1"
      width="100%"
      opacity={disabled ? 0.5 : 1}
      pointerEvents={disabled ? 'none' : 'auto'}
    >
      {label ? <FormLabelText>{label}</FormLabelText> : null}
      <StyledTextArea
        unstyled
        hasError={hasError}
        minHeight={88}
        borderWidth={1}
        borderRadius={6}
        backgroundColor="$surfaceCard"
        paddingHorizontal={14}
        paddingVertical={11}
        fontFamily="$body"
        fontSize={15}
        lineHeight={22}
        color="$color"
        placeholderTextColor="$color10"
        disabled={disabled}
        opacity={1}
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
