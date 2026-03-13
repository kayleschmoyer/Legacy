import * as React from 'react';
import { forwardRef } from 'react';
import {
  H1 as TamaguiH1,
  H2 as TamaguiH2,
  H3 as TamaguiH3,
  H4 as TamaguiH4,
  H5 as TamaguiH5,
  H6 as TamaguiH6,
  Paragraph as TamaguiParagraph,
  Text as TamaguiText,
} from 'tamagui';
import type { TextProps, TextRef } from '../types/ui';

// Import Tamagui Text and related components

// Base Text component with stable types
export const Text = forwardRef<
  TextRef,
  TextProps & { variant?: 'body' | 'caption' | 'label' }
>(({ children, variant = 'body', ...props }, ref) => {
  return (
    <TamaguiText
      ref={ref}
      color={props.color}
      fontSize={props.fontSize}
      fontWeight={props.fontWeight}
      fontFamily={props.fontFamily}
      lineHeight={props.lineHeight}
      textAlign={props.textAlign}
      numberOfLines={props.numberOfLines}
      selectable={props.selectable}
      testID={props.testID}
      id={props.id}
      accessibilityLabel={props.accessibilityLabel}
      {...(variant === 'caption' && { fontSize: '$sm', color: '$gray11' })}
      {...(variant === 'label' && { fontSize: '$sm', fontWeight: '600' })}
    >
      {children}
    </TamaguiText>
  );
});

Text.displayName = 'Text';

// Heading components with consistent sizing
export const H1 = forwardRef<TextRef, TextProps>(
  ({ children, ...props }, ref) => (
    <TamaguiH1
      ref={ref}
      color={props.color}
      fontWeight={props.fontWeight || 'bold'}
      textAlign={props.textAlign}
      testID={props.testID}
      id={props.id}
      accessibilityLabel={props.accessibilityLabel}
    >
      {children}
    </TamaguiH1>
  ),
);

H1.displayName = 'H1';

export const H2 = forwardRef<TextRef, TextProps>(
  ({ children, ...props }, ref) => (
    <TamaguiH2
      ref={ref}
      color={props.color}
      fontWeight={props.fontWeight || 'bold'}
      textAlign={props.textAlign}
      testID={props.testID}
      id={props.id}
      accessibilityLabel={props.accessibilityLabel}
    >
      {children}
    </TamaguiH2>
  ),
);

H2.displayName = 'H2';

export const H3 = forwardRef<TextRef, TextProps>(
  ({ children, ...props }, ref) => (
    <TamaguiH3
      ref={ref}
      color={props.color}
      fontWeight={props.fontWeight || 'bold'}
      textAlign={props.textAlign}
      testID={props.testID}
      id={props.id}
      accessibilityLabel={props.accessibilityLabel}
    >
      {children}
    </TamaguiH3>
  ),
);

H3.displayName = 'H3';

export const H4 = forwardRef<TextRef, TextProps>(
  ({ children, ...props }, ref) => (
    <TamaguiH4
      ref={ref}
      color={props.color}
      fontWeight={props.fontWeight || '600'}
      textAlign={props.textAlign}
      testID={props.testID}
      id={props.id}
      accessibilityLabel={props.accessibilityLabel}
    >
      {children}
    </TamaguiH4>
  ),
);

H4.displayName = 'H4';

export const H5 = forwardRef<TextRef, TextProps>(
  ({ children, ...props }, ref) => (
    <TamaguiH5
      ref={ref}
      color={props.color}
      fontWeight={props.fontWeight || '600'}
      textAlign={props.textAlign}
      testID={props.testID}
      id={props.id}
      accessibilityLabel={props.accessibilityLabel}
    >
      {children}
    </TamaguiH5>
  ),
);

H5.displayName = 'H5';

export const H6 = forwardRef<TextRef, TextProps>(
  ({ children, ...props }, ref) => (
    <TamaguiH6
      ref={ref}
      color={props.color}
      fontWeight={props.fontWeight || '600'}
      textAlign={props.textAlign}
      testID={props.testID}
      id={props.id}
      accessibilityLabel={props.accessibilityLabel}
    >
      {children}
    </TamaguiH6>
  ),
);

H6.displayName = 'H6';

export const Paragraph = forwardRef<TextRef, TextProps>(
  ({ children, ...props }, ref) => (
    <TamaguiParagraph
      ref={ref}
      color={props.color}
      fontSize={props.fontSize}
      fontWeight={props.fontWeight}
      lineHeight={props.lineHeight}
      textAlign={props.textAlign}
      numberOfLines={props.numberOfLines}
      testID={props.testID}
      id={props.id}
      accessibilityLabel={props.accessibilityLabel}
    >
      {children}
    </TamaguiParagraph>
  ),
);

Paragraph.displayName = 'Paragraph';

// Text utility components
export const Label = forwardRef<TextRef, TextProps>(
  ({ children, ...props }, ref) => (
    <Text ref={ref} variant="label" {...props}>
      {children}
    </Text>
  ),
);

Label.displayName = 'Label';

export const Caption = forwardRef<TextRef, TextProps>(
  ({ children, ...props }, ref) => (
    <Text ref={ref} variant="caption" {...props}>
      {children}
    </Text>
  ),
);

Caption.displayName = 'Caption';
