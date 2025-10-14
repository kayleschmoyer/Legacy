import React from 'react';
import {
  Button as TamaguiButton,
  ButtonProps as TamaguiButtonProps,
  Text,
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
      ? { chromeless: true, type: 'button' as const, ...props }
      : { type: 'button' as const, ...props };

  // Auto-wrap string children in Text component for React Native compatibility
  const processChildren = (child: React.ReactNode): React.ReactNode => {
    if (typeof child === 'string') {
      return <Text>{child}</Text>;
    }
    return child;
  };

  const content = children || title;
  const wrappedContent = React.isValidElement(content)
    ? content
    : processChildren(content);

  return (
    <TamaguiButton size="$4" {...buttonProps}>
      {wrappedContent}
    </TamaguiButton>
  );
}

export { Button };
