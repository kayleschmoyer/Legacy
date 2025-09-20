import React from 'react';
import {
  Button as TamaguiButton,
  ButtonProps as TamaguiButtonProps,
} from 'tamagui';

export interface ButtonProps extends Omit<TamaguiButtonProps, 'variant'> {
  title?: string;
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outlined';
}

function Button({
  title,
  children,
  variant = 'primary',
  ...props
}: ButtonProps) {
  // Use chromeless for secondary and outlined variants, default theme for primary
  const buttonProps =
    variant === 'secondary' || variant === 'outlined'
      ? { chromeless: true, ...props }
      : props;

  return (
    <TamaguiButton size="$4" {...buttonProps}>
      {children || title}
    </TamaguiButton>
  );
}

export { Button };
