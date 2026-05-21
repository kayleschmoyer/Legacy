import * as React from 'react';
import { forwardRef } from 'react';
import { Button as TamaguiButton } from 'tamagui';
import { VARIANT_STYLES } from './button-variants';
import type { ButtonProps, ButtonRef } from '../types/ui';

// Button component with stable types and consistent API
export const Button = forwardRef<ButtonRef, ButtonProps>(
  (
    {
      children,
      title,
      variant = 'primary',
      size = 'medium',
      disabled = false,
      loading = false,
      onPress,
      ...props
    },
    ref,
  ) => {
    const variantStyle = React.useMemo(
      () => VARIANT_STYLES[variant],
      [variant],
    );

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
        variant={variantStyle.tamaguiVariant}
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
        backgroundColor={props.backgroundColor ?? variantStyle.backgroundColor}
        borderColor={props.borderColor ?? variantStyle.borderColor}
        borderWidth={props.borderWidth ?? variantStyle.borderWidth}
        borderRadius={props.borderRadius}
        color={variantStyle.color}
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
