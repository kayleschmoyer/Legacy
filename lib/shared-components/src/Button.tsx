import React from 'react';
import {
  Button as TamaguiButton,
  ButtonProps as TamaguiButtonProps,
} from 'tamagui';

export interface ButtonProps extends Omit<TamaguiButtonProps, 'children'> {
  title?: string;
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary';
}

export const Button: React.FC<ButtonProps> = ({
  title,
  children,
  variant = 'primary',
  ...props
}) => {
  const themeVariant = variant === 'primary' ? 'blue' : 'outlined';

  return (
    <TamaguiButton theme={themeVariant} size="$4" {...props}>
      {children || title}
    </TamaguiButton>
  );
};
