import React from 'react';
import { Card } from 'tamagui';
import { tamaguiStyled } from '../../utils/tamaguiStyled';
import './HolographicCard.css';

/**
 * Props for HolographicCard. The component operates in two mutually exclusive modes:
 *
 * **Generic mode** (pass `children`, omit `playerName`): wraps arbitrary content with a
 * holographic shimmer border. `children` is required in this mode — omitting it renders
 * a silently empty card.
 *
 * **Player-card mode** (pass `playerName`): renders a fixed 240×340 trading card with a
 * 3D perspective tilt and brand gradient. `children` is ignored in this mode.
 */
export interface HolographicCardProps {
  /** Required in generic mode (omit when using player-card mode via `playerName`). */
  children?: React.ReactNode;
  /** Animation intensity: 'subtle', 'normal', 'intense' */
  intensity?: 'subtle' | 'normal' | 'intense';
  /**
   * Card variant:
   * - `'default'` — heritage gold gradient (player-card default)
   * - `'legend'`  — seam-red glow (glory-era)
   * - `'rookie'`  — turf-green gradient (emergence)
   * - `'rainbow'` / `'chrome'` / `'aurora'` — generic shimmer variants
   */
  variant?: 'default' | 'rainbow' | 'chrome' | 'aurora' | 'legend' | 'rookie';
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
  /**
   * Activates player-card mode when provided. When set, `children` is ignored and the
   * component renders a fixed 240×340 trading card layout with 3D perspective tilt.
   */
  playerName?: string;
  jerseyNumber?: string | number;
  position?: string;
  playerMeta?: string;
  stats?: Array<{ value: string | number; label: string }>;
}

const StyledCard = tamaguiStyled(Card, {
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
      legend: {},
      rookie: {},
    },
  },

  defaultVariants: {
    intensity: 'normal',
    variant: 'rainbow',
  },
}) as React.ComponentType<
  Omit<React.ComponentProps<typeof Card>, 'variant'> & {
    intensity?: 'subtle' | 'normal' | 'intense';
    variant?: 'default' | 'rainbow' | 'chrome' | 'aurora' | 'legend' | 'rookie';
  }
>;

export const HolographicCard: React.FC<HolographicCardProps> = ({
  children,
  intensity = 'normal',
  variant = 'rainbow',
  enableHover = true,
  animationDelay = 0,
  className = '',
  onPress,
  style,
  jerseyNumber,
  position,
  playerName,
  playerMeta,
  stats,
  ...props
}) => {
  const [mousePosition, setMousePosition] = React.useState({ x: 50, y: 50 });
  const cardRef = React.useRef<HTMLDivElement>(null);

  const handleMouseMove = React.useCallback(
    (e: React.MouseEvent) => {
      if (!enableHover || !cardRef.current) return;

      const rect = cardRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      setMousePosition({ x, y });
    },
    [enableHover],
  );

  const handleMouseLeave = React.useCallback(() => {
    setMousePosition({ x: 50, y: 50 });
  }, []);

  const combinedStyle = React.useMemo(
    () =>
      ({
        ...style,
        '--mouse-x': `${mousePosition.x}%`,
        '--mouse-y': `${mousePosition.y}%`,
        '--animation-delay': `${animationDelay}ms`,
      }) as React.CSSProperties,
    [mousePosition, animationDelay, style],
  );

  // Player card mode — renders structured trading card layout
  if (playerName !== undefined) {
    const cardClasses = [
      'holographic-card',
      'holographic-card--player-card',
      `holographic-card--${variant}`,
      enableHover ? 'holographic-card--hover' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div
        ref={cardRef}
        className={cardClasses}
        style={combinedStyle}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={onPress}
        role={onPress ? 'button' : undefined}
        tabIndex={onPress ? 0 : undefined}
      >
        <div className="holo-top">
          <span className="holo-num">{jerseyNumber}</span>
          <span
            className={`holo-pos${variant === 'rookie' ? ' holo-pos--rookie' : ''}`}
          >
            {position}
          </span>
        </div>
        <div className="holo-bot">
          <div className="holo-name">{playerName}</div>
          {playerMeta && <div className="holo-meta">{playerMeta}</div>}
          {stats && stats.length > 0 && (
            <div className="holo-stats">
              {stats.map((s) => (
                <div key={s.label} className="holo-stat">
                  <div className="holo-sv">{s.value}</div>
                  <div className="holo-sl">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Generic mode — wraps arbitrary children with holographic border/shimmer effects
  const cardClasses = [
    'holographic-card',
    `holographic-card--${variant}`,
    `holographic-card--${intensity}`,
    enableHover ? 'holographic-card--hover' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

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
