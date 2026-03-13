import * as React from 'react';
import { forwardRef } from 'react';
import {
  Card as TamaguiCard,
  View as TamaguiView,
  XStack as TamaguiXStack,
  YStack as TamaguiYStack,
  ZStack as TamaguiZStack,
} from 'tamagui';
import type { ViewProps, ViewRef } from '../types/ui';

// Import Tamagui View and Stack components

// Base View component with stable types
export const View = forwardRef<ViewRef, ViewProps>(
  ({ children, onPress, onLayout, ...props }, ref) => {
    const tamaguiProps = {
      ref: ref,
      flex: props.flex,
      flexDirection: props.flexDirection,
      justifyContent: props.justifyContent,
      alignItems: props.alignItems,
      alignSelf: props.alignSelf,
      width: props.width,
      height: props.height,
      minWidth: props.minWidth,
      minHeight: props.minHeight,
      maxWidth: props.maxWidth,
      maxHeight: props.maxHeight,
      margin: props.margin,
      marginTop: props.marginTop,
      marginRight: props.marginRight,
      marginBottom: props.marginBottom,
      marginLeft: props.marginLeft,
      marginHorizontal: props.marginHorizontal,
      marginVertical: props.marginVertical,
      padding: props.padding,
      paddingTop: props.paddingTop,
      paddingRight: props.paddingRight,
      paddingBottom: props.paddingBottom,
      paddingLeft: props.paddingLeft,
      paddingHorizontal: props.paddingHorizontal,
      paddingVertical: props.paddingVertical,
      position: props.position,
      top: props.top,
      right: props.right,
      bottom: props.bottom,
      left: props.left,
      zIndex: props.zIndex,
      backgroundColor: props.backgroundColor,
      borderColor: props.borderColor,
      borderWidth: props.borderWidth,
      borderRadius: props.borderRadius,
      opacity: props.opacity,
      overflow: props.overflow,
      testID: props.testID,
      id: props.id,
      accessibilityLabel: props.accessibilityLabel,
      onPress: onPress,
      onLayout: onLayout,
    };

    return <TamaguiView {...tamaguiProps}>{children}</TamaguiView>;
  },
);

View.displayName = 'View';

// Stack components for layout
export const XStack = forwardRef<
  ViewRef,
  ViewProps & { space?: number | string; separator?: React.ReactNode }
>(({ children, space, separator, ...props }, ref) => {
  return (
    <TamaguiXStack
      ref={ref}
      space={space}
      separator={separator}
      flex={props.flex}
      justifyContent={props.justifyContent}
      alignItems={props.alignItems}
      alignSelf={props.alignSelf}
      width={props.width}
      height={props.height}
      minWidth={props.minWidth}
      minHeight={props.minHeight}
      maxWidth={props.maxWidth}
      maxHeight={props.maxHeight}
      margin={props.margin}
      marginTop={props.marginTop}
      marginRight={props.marginRight}
      marginBottom={props.marginBottom}
      marginLeft={props.marginLeft}
      marginHorizontal={props.marginHorizontal}
      marginVertical={props.marginVertical}
      padding={props.padding}
      paddingTop={props.paddingTop}
      paddingRight={props.paddingRight}
      paddingBottom={props.paddingBottom}
      paddingLeft={props.paddingLeft}
      paddingHorizontal={props.paddingHorizontal}
      paddingVertical={props.paddingVertical}
      position={props.position}
      top={props.top}
      right={props.right}
      bottom={props.bottom}
      left={props.left}
      zIndex={props.zIndex}
      backgroundColor={props.backgroundColor}
      borderColor={props.borderColor}
      borderWidth={props.borderWidth}
      borderRadius={props.borderRadius}
      opacity={props.opacity}
      overflow={props.overflow}
      testID={props.testID}
      id={props.id}
      accessibilityLabel={props.accessibilityLabel}
      onPress={props.onPress}
      onLayout={props.onLayout}
    >
      {children}
    </TamaguiXStack>
  );
});

XStack.displayName = 'XStack';

export const YStack = forwardRef<
  ViewRef,
  ViewProps & { space?: number | string; separator?: React.ReactNode }
>(({ children, space, separator, ...props }, ref) => {
  return (
    <TamaguiYStack
      ref={ref}
      space={space}
      separator={separator}
      flex={props.flex}
      justifyContent={props.justifyContent}
      alignItems={props.alignItems}
      alignSelf={props.alignSelf}
      width={props.width}
      height={props.height}
      minWidth={props.minWidth}
      minHeight={props.minHeight}
      maxWidth={props.maxWidth}
      maxHeight={props.maxHeight}
      margin={props.margin}
      marginTop={props.marginTop}
      marginRight={props.marginRight}
      marginBottom={props.marginBottom}
      marginLeft={props.marginLeft}
      marginHorizontal={props.marginHorizontal}
      marginVertical={props.marginVertical}
      padding={props.padding}
      paddingTop={props.paddingTop}
      paddingRight={props.paddingRight}
      paddingBottom={props.paddingBottom}
      paddingLeft={props.paddingLeft}
      paddingHorizontal={props.paddingHorizontal}
      paddingVertical={props.paddingVertical}
      position={props.position}
      top={props.top}
      right={props.right}
      bottom={props.bottom}
      left={props.left}
      zIndex={props.zIndex}
      backgroundColor={props.backgroundColor}
      borderColor={props.borderColor}
      borderWidth={props.borderWidth}
      borderRadius={props.borderRadius}
      opacity={props.opacity}
      overflow={props.overflow}
      testID={props.testID}
      id={props.id}
      accessibilityLabel={props.accessibilityLabel}
      onPress={props.onPress}
      onLayout={props.onLayout}
    >
      {children}
    </TamaguiYStack>
  );
});

YStack.displayName = 'YStack';

export const ZStack = forwardRef<ViewRef, ViewProps>(
  ({ children, ...props }, ref) => {
    return (
      <TamaguiZStack
        ref={ref}
        flex={props.flex}
        width={props.width}
        height={props.height}
        margin={props.margin}
        padding={props.padding}
        backgroundColor={props.backgroundColor}
        borderRadius={props.borderRadius}
        testID={props.testID}
        id={props.id}
        accessibilityLabel={props.accessibilityLabel}
      >
        {children}
      </TamaguiZStack>
    );
  },
);

ZStack.displayName = 'ZStack';

// Card component with consistent styling
export const Card = forwardRef<ViewRef, ViewProps & { elevated?: boolean }>(
  ({ children, elevated = false, ...props }, ref) => {
    return (
      <TamaguiCard
        ref={ref}
        elevate={elevated}
        flex={props.flex}
        width={props.width}
        height={props.height}
        margin={props.margin}
        padding={props.padding}
        backgroundColor={props.backgroundColor}
        borderColor={props.borderColor}
        borderWidth={props.borderWidth}
        borderRadius={props.borderRadius}
        testID={props.testID}
        id={props.id}
        accessibilityLabel={props.accessibilityLabel}
        onPress={props.onPress}
      >
        {children}
      </TamaguiCard>
    );
  },
);

Card.displayName = 'Card';

// Container component for screens
export const Container = forwardRef<ViewRef, ViewProps & { safe?: boolean }>(
  ({ children, safe = false, ...props }, ref) => {
    return (
      <View
        ref={ref}
        flex={1}
        backgroundColor={props.backgroundColor || '$background'}
        {...(safe && { paddingTop: '$4' })}
        {...props}
      >
        {children}
      </View>
    );
  },
);

Container.displayName = 'Container';
