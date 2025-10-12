import React from 'react';
import { Card, styled } from 'tamagui';
import './HolographicCard.css';

export interface HolographicCardProps {
  children: React.ReactNode;
  /** Animation intensity: 'subtle', 'normal', 'intense' */
  intensity?: 'subtle' | 'normal' | 'intense';
  /** Card variant: 'default', 'rainbow', 'chrome', 'aurora' */
  variant?: 'default' | 'rainbow' | 'chrome' | 'aurora';
  /** Enable/disable hover effects */
  enableHover?: boolean;
  /** Animation delay in milliseconds */
  animationDelay?: number;
  /** Custom className for additional styling */
  className?: string;
  /** Click handler */
  onPress?: () => void;
  /** Custom style object */
  style?: React.CSSProperties;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
const StyledCard = styled(Card, {
  position: 'relative',
  cursor: 'pointer',
  borderRadius: '$6',
  overflow: 'hidden',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  
  variants: {
    intensity: {
      subtle: {
        transform: 'none',
      },
      normal: {
        transform: 'none',
      },
      intense: {
        transform: 'none',
      },
    },
    variant: {
      default: {},
      rainbow: {},
      chrome: {},
      aurora: {},
    },
  },

  defaultVariants: {
    intensity: 'normal',
    variant: 'rainbow',
  },
});

/**
 * HolographicCard - A stunning holographic card component with rainbow effects
 * 
 * Features:
 * - Multiple holographic variants (rainbow, chrome, aurora)
 * - Adjustable animation intensity
 * - Mouse tracking effects
 * - Smooth animations and transitions
 * - Accessible and keyboard navigable
 * 
 * @example
 * ```tsx
 * <HolographicCard variant="rainbow" intensity="normal">
 *   <CardContent>Your content here</CardContent>
 * </HolographicCard>
 * ```
 */
export const HolographicCard: React.FC<HolographicCardProps> = ({
  children,
  intensity = 'normal',
  variant = 'rainbow',
  enableHover = true,
  animationDelay = 0,
  className = '',
  onPress,
  style,
  ...props
}) => {
  const [mousePosition, setMousePosition] = React.useState({ x: 0, y: 0 });
  const cardRef = React.useRef<HTMLDivElement>(null);

  const handleMouseMove = React.useCallback((e: React.MouseEvent) => {
    if (!enableHover || !cardRef.current) return;
    
    const rect = cardRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    setMousePosition({ x, y });
  }, [enableHover]);

  const handleMouseLeave = React.useCallback(() => {
    setMousePosition({ x: 50, y: 50 });
  }, []);

  // Generate CSS custom properties for mouse tracking
  const combinedStyle = React.useMemo(() => ({
    ...style,
    '--mouse-x': `${mousePosition.x}%`,
    '--mouse-y': `${mousePosition.y}%`,
    '--animation-delay': `${animationDelay}ms`,
  } as React.CSSProperties), [mousePosition, animationDelay, style]);

  const cardClasses = [
    'holographic-card',
    `holographic-card--${variant}`,
    `holographic-card--${intensity}`,
    enableHover ? 'holographic-card--hover' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div 
      className={cardClasses}
      style={combinedStyle}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <StyledCard
        ref={cardRef}
        className="holographic-card__inner"
        intensity={intensity}
        variant={variant}
        onPress={onPress}
        role={onPress ? 'button' : undefined}
        tabIndex={onPress ? 0 : undefined}
        {...props}
      >
        {children}
      </StyledCard>
    </div>
  );
};

export default HolographicCard;
