import * as React from 'react';
import { forwardRef } from 'react';
import type { ScrollViewProps, ViewRef } from '../types/ui';

// Import Tamagui ScrollView
import { ScrollView as TamaguiScrollView } from 'tamagui';

// ScrollView component with stable types
export const ScrollView = forwardRef<ViewRef, ScrollViewProps>(
  ({
    children,
    horizontal = false,
    showsHorizontalScrollIndicator = true,
    showsVerticalScrollIndicator = true,
    scrollEnabled = true,
    onScroll,
    contentContainerStyle,
    ...props
  }, ref) => {
    return (
      <TamaguiScrollView
        ref={ref as any}
        horizontal={horizontal}
        showsHorizontalScrollIndicator={showsHorizontalScrollIndicator}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        scrollEnabled={scrollEnabled}
        onScroll={onScroll}
        contentContainerStyle={contentContainerStyle}
        flex={props.flex}
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
        backgroundColor={props.backgroundColor}
        borderColor={props.borderColor}
        borderWidth={props.borderWidth}
        borderRadius={props.borderRadius}
        opacity={props.opacity}
        overflow={props.overflow}
        testID={props.testID}
        id={props.id}
        accessibilityLabel={props.accessibilityLabel}

      >
        {children}
      </TamaguiScrollView>
    );
  }
);

ScrollView.displayName = 'ScrollView';

// Specialized ScrollView components
export const HorizontalScrollView = forwardRef<ViewRef, Omit<ScrollViewProps, 'horizontal'>>(
  (props, ref) => <ScrollView ref={ref} horizontal {...props} />
);

HorizontalScrollView.displayName = 'HorizontalScrollView';

export const VerticalScrollView = forwardRef<ViewRef, Omit<ScrollViewProps, 'horizontal'>>(
  (props, ref) => <ScrollView ref={ref} horizontal={false} {...props} />
);

VerticalScrollView.displayName = 'VerticalScrollView';
