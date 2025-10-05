import React from 'react';
import {
  Button as TamaguiButton,
  styled,
  YStack,
  Text,
} from 'tamagui';
import { Icon } from './platform-components';
import type {
  IconButtonProps,
  IconButtonSize,
  IconButtonVariant,
  IconButtonColorScheme,
} from './types/IconButton.types';

// Styled button with gradient shadow effects
const StyledIconButton = styled(TamaguiButton, {
  name: 'IconButton',
  borderRadius: 16,
  borderWidth: 0,
  overflow: 'hidden',
  position: 'relative',
  cursor: 'pointer',
  userSelect: 'none',
  
  variants: {
    size: {
      sm: {
        width: 60,
        height: 60,
        padding: 12,
      },
      md: {
        width: 80,
        height: 80,
        padding: 16,
      },
      lg: {
        width: 100,
        height: 100,
        padding: 20,
      },
    },
    
    variant: {
      default: {
        backgroundColor: '$color3',
        hoverStyle: {
          backgroundColor: '$color4',
          scale: 1.05,
        },
        pressStyle: {
          backgroundColor: '$color2',
          scale: 0.95,
        },
      },
      primary: {
        backgroundColor: '$blue4',
        hoverStyle: {
          backgroundColor: '$blue5',
          scale: 1.05,
        },
        pressStyle: {
          backgroundColor: '$blue3',
          scale: 0.95,
        },
      },
      secondary: {
        backgroundColor: '$purple4',
        hoverStyle: {
          backgroundColor: '$purple5',
          scale: 1.05,
        },
        pressStyle: {
          backgroundColor: '$purple3',
          scale: 0.95,
        },
      },
      accent: {
        backgroundColor: '$green4',
        hoverStyle: {
          backgroundColor: '$green5',
          scale: 1.05,
        },
        pressStyle: {
          backgroundColor: '$green3',
          scale: 0.95,
        },
      },
    },
    
    showGradient: {
      true: {
        // Enhanced shadow for gradient effect
        shadowColor: '$shadowColor',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
        
        hoverStyle: {
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.4,
          shadowRadius: 16,
          elevation: 12,
        },
      },
    },
  },
  
  // Animation configuration
  animation: 'quick',
  
  // Default props
  defaultVariants: {
    size: 'md',
    variant: 'default',
    showGradient: true,
  },
});

// Gradient overlay component for enhanced visual effects
const GradientOverlay = styled(YStack, {
  name: 'GradientOverlay',
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  borderRadius: 16,
  opacity: 0,
  zIndex: 1,
  
  variants: {
    colorScheme: {
      blue: {
        backgroundColor: 'linear-gradient(135deg, $blue6, $blue8)',
      },
      purple: {
        backgroundColor: 'linear-gradient(135deg, $purple6, $purple8)',
      },
      green: {
        backgroundColor: 'linear-gradient(135deg, $green6, $green8)',
      },
      red: {
        backgroundColor: 'linear-gradient(135deg, $red6, $red8)',
      },
      gold: {
        backgroundColor: 'linear-gradient(135deg, #FFD700, #FFA500)',
      },
    },
  },
  
  hoverStyle: {
    opacity: 0.2,
  },
  
  animation: 'quick',
});

function IconButton({
  icon,
  label,
  size = 'md',
  variant = 'default',
  colorScheme = 'blue',
  showGradient = true,
  accessibilityLabel,
  testID,
  children,
  ...props
}: IconButtonProps) {
  const getIconSize = () => {
    switch (size) {
      case 'sm':
        return 20;
      case 'md':
        return 28;
      case 'lg':
        return 36;
      default:
        return 28;
    }
  };

  const getTextSize = () => {
    switch (size) {
      case 'sm':
        return '$2';
      case 'md':
        return '$3';
      case 'lg':
        return '$4';
      default:
        return '$3';
    }
  };

  return (
    <YStack alignItems="center" gap="$2">
      <StyledIconButton
        size={size}
        variant={variant}
        showGradient={showGradient}
        accessibilityLabel={accessibilityLabel || label || `${icon} button`}
        testID={testID}
        {...props}
      >
        {/* Gradient overlay for enhanced hover effects */}
        {showGradient && (
          <GradientOverlay colorScheme={colorScheme} />
        )}
        
        {/* Icon content */}
        <YStack
          position="relative"
          zIndex={2}
          alignItems="center"
          justifyContent="center"
        >
          <Icon
            name={icon}
            size={getIconSize()}
            color="$color"
          />
        </YStack>
        
        {children}
      </StyledIconButton>
      
      {/* Optional label below the button */}
      {label && (
        <Text
          fontSize={getTextSize()}
          color="$color11"
          textAlign="center"
          fontWeight="500"
        >
          {label}
        </Text>
      )}
    </YStack>
  );
}

export { IconButton };
