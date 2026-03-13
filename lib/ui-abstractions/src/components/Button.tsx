import * as React from 'react';
import { forwardRef } from 'react';
import { Button as TamaguiButton } from 'tamagui';
import type { ButtonProps, ButtonRef } from '../types/ui';

// Import Tamagui Button component

// Button component with stable types and consistent API
export const Button = forwardRef<ButtonRef, ButtonProps>(
  (
    {
      children,
      title,
      variant: _variant = 'primary',
      size = 'medium',
      disabled = false,
      loading = false,
      onPress,
      ...props
    },
    ref,
  ) => {
    // Map our variant to Tamagui variant
    const tamaguiVariant = React.useMemo(() => {
      // For now, Tamagui Button only supports 'outlined', so we use that consistently
      return 'outlined' as const;
    }, []);

    // Map our size to Tamagui size
    const tamaguiSize = React.useMemo(() => {
      switch (size) {
        case 'small':
          return '$3';
        case 'medium':
          return '$4';
        case 'large':
          return '$5';
        default:
          return '$4';
      }
    }, [size]);

    const buttonContent = children || title;

    return (
      <TamaguiButton
        ref={ref}
        variant={tamaguiVariant}
        size={tamaguiSize}
        disabled={disabled || loading}
        onPress={onPress}
        flex={props.flex}
        width={props.width}
        height={props.height}
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
        testID={props.testID}
        id={props.id}
        accessibilityLabel={props.accessibilityLabel}
      >
        {loading ? 'Loading...' : buttonContent}
      </TamaguiButton>
    );
  },
);

Button.displayName = 'Button';

// Specialized button variants
export const PrimaryButton = forwardRef<
  ButtonRef,
  Omit<ButtonProps, 'variant'>
>((props, ref) => <Button ref={ref} variant="primary" {...props} />);

PrimaryButton.displayName = 'PrimaryButton';

export const SecondaryButton = forwardRef<
  ButtonRef,
  Omit<ButtonProps, 'variant'>
>((props, ref) => <Button ref={ref} variant="secondary" {...props} />);

SecondaryButton.displayName = 'SecondaryButton';

export const OutlineButton = forwardRef<
  ButtonRef,
  Omit<ButtonProps, 'variant'>
>((props, ref) => <Button ref={ref} variant="outline" {...props} />);

OutlineButton.displayName = 'OutlineButton';

export const GhostButton = forwardRef<ButtonRef, Omit<ButtonProps, 'variant'>>(
  (props, ref) => <Button ref={ref} variant="ghost" {...props} />,
);

GhostButton.displayName = 'GhostButton';

export const LinkButton = forwardRef<ButtonRef, Omit<ButtonProps, 'variant'>>(
  (props, ref) => <Button ref={ref} variant="link" {...props} />,
);

LinkButton.displayName = 'LinkButton';
