import React, { useCallback, useEffect, useRef } from 'react';

// Web-compatible implementations
const StyleSheet = {
  create: (styles: Record<string, React.CSSProperties>) => styles,
};

// Simple animation value for web
class WebAnimatedValue {
  constructor(private _value: number) {}
  
  setValue(value: number) {
    this._value = value;
  }
  
  interpolate({ inputRange, outputRange }: { inputRange: number[]; outputRange: string[] }) {
    // Simple interpolation for web
    const index = inputRange.findIndex(val => this._value <= val);
    return outputRange[index >= 0 ? index : outputRange.length - 1];
  }
}

interface AnimationConfig {
  duration?: number;
  toValue: number;
  useNativeDriver?: boolean;
}

const Animated = {
  Value: WebAnimatedValue,
  timing: (value: WebAnimatedValue, config: AnimationConfig) => ({
    start: () => {
      // Simple immediate animation for web
      value.setValue(config.toValue);
    }
  }),
  View: ({ style, children, ...props }: { style?: React.CSSProperties; children?: React.ReactNode; [key: string]: unknown }) => 
    <div style={style} {...props}>{children}</div>,
};

const Platform = {
  OS: 'web' as const,
};

const Vibration = {
  vibrate: (duration: number) => {
    // Web vibration API if available
    if ('vibrate' in navigator) {
      navigator.vibrate(duration);
    }
  },
};

export interface TimerProps {
  initialTime: number;
  onTimeUpdate?: (time: number) => void;
  onTimeExpired?: () => void;
  autoStart?: boolean;
  showWarnings?: boolean;
  warningThresholds?: number[];
}

export interface TimerBarProps {
  time: number;
  maxTime: number;
  colorAnim?: WebAnimatedValue;
  label?: string;
  variant?: 'default' | 'compact' | 'large';
}

/**
 * Custom hook for draft timer with color transitions and vibration alerts
 */
export function useTimer({
  initialTime,
  onTimeUpdate,
  onTimeExpired,
  autoStart = false,
  showWarnings = true,
  warningThresholds = [30, 10, 5, 3, 2, 1],
}: TimerProps) {
  const [time, setTime] = React.useState(initialTime);
  const [isActive, setIsActive] = React.useState(autoStart);
  const colorAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isActive && time > 0) {
      interval = setInterval(() => {
        setTime((prevTime) => {
          const newTime = prevTime - 1;

          // Trigger callbacks
          onTimeUpdate?.(newTime);

          if (newTime === 0) {
            onTimeExpired?.();
            setIsActive(false);
          }

          // Warning vibrations and color changes
          if (showWarnings && warningThresholds.includes(newTime)) {
            if (Platform.OS !== 'web') {
              Vibration.vibrate(50);
            }
          }

          // Animate color based on remaining time percentage
          const percentage = newTime / initialTime;
          let animationValue = 1; // Green

          if (percentage <= 0.1) {
            animationValue = 0; // Red
          } else if (percentage <= 0.33) {
            animationValue = 0.5; // Yellow
          }

          Animated.timing(colorAnim, {
            duration: 300,
            toValue: animationValue,
            useNativeDriver: false,
          }).start();

          return newTime;
        });
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [
    isActive,
    time,
    colorAnim,
    initialTime,
    onTimeUpdate,
    onTimeExpired,
    showWarnings,
    warningThresholds,
  ]);

  const start = useCallback(() => {
    setIsActive(true);
  }, []);

  const pause = useCallback(() => {
    setIsActive(false);
  }, []);

  const reset = useCallback(
    (newTime: number = initialTime) => {
      setTime(newTime);
      setIsActive(false);
      colorAnim.setValue(1);
    },
    [initialTime, colorAnim],
  );

  const toggle = useCallback(() => {
    setIsActive((prev) => !prev);
  }, []);

  return {
    time,
    isActive,
    colorAnim,
    start,
    pause,
    reset,
    toggle,
    progress: time / initialTime,
  };
}

/**
 * Timer Bar Component with smooth color transitions
 */
export function TimerBar({
  time,
  maxTime,
  colorAnim,
  label = 'Time Remaining',
  variant = 'default',
}: TimerBarProps): React.JSX.Element {
  const minutes = Math.floor(time / 60);
  const seconds = time % 60;

  // Create default color animation if not provided
  const defaultColorAnim = useRef(new Animated.Value(1)).current;
  const activeColorAnim = colorAnim || defaultColorAnim;

  // Update default animation if no external animation provided
  useEffect(() => {
    if (!colorAnim) {
      const percentage = time / maxTime;
      let animationValue = 1;

      if (percentage <= 0.1) {
        animationValue = 0;
      } else if (percentage <= 0.33) {
        animationValue = 0.5;
      }

      Animated.timing(defaultColorAnim, {
        duration: 300,
        toValue: animationValue,
        useNativeDriver: false,
      }).start();
    }
  }, [time, maxTime, colorAnim, defaultColorAnim]);

  const backgroundColor = activeColorAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['#ef4444', '#f59e0b', '#10b981'], // Red, Yellow, Green
  });

  const timerStyle = {
    ...styles.timerBar,
    ...styles[`${variant}Timer`],
  };

  return (
    <Animated.View style={{
      ...timerStyle,
      backgroundColor: typeof backgroundColor === 'string' ? backgroundColor : '#10b981'
    }}>
      <div style={styles.timerContent}>
        <span style={{
          ...styles.timerText,
          ...styles[`${variant}Text`],
        }}>
          {minutes}:{seconds.toString().padStart(2, '0')}
        </span>
        {label && (
          <span style={{
            ...styles.timerLabel,
            ...styles[`${variant}Label`],
          }}>
            {label}
          </span>
        )}
      </div>

      {/* Progress indicator */}
      <div style={styles.progressContainer}>
        <div
          style={{
            ...styles.progressBar,
            width: `${Math.max(0, (time / maxTime) * 100)}%`,
          }}
        />
      </div>
    </Animated.View>
  );
}

/**
 * Countdown Timer Component (combines hook and bar)
 */
export interface CountdownTimerProps extends TimerProps {
  label?: string;
  variant?: 'default' | 'compact' | 'large';
  showProgress?: boolean;
}

export function CountdownTimer({
  initialTime,
  onTimeUpdate,
  onTimeExpired,
  autoStart = false,
  showWarnings = true,
  warningThresholds = [30, 10, 5, 3, 2, 1],
  label = 'Time Remaining',
  variant = 'default',
  showProgress = true,
}: CountdownTimerProps): React.JSX.Element {
  const timer = useTimer({
    initialTime,
    onTimeUpdate,
    onTimeExpired,
    autoStart,
    showWarnings,
    warningThresholds,
  });

  return (
    <TimerBar
      time={timer.time}
      maxTime={initialTime}
      colorAnim={timer.colorAnim}
      label={label}
      variant={variant}
    />
  );
}

const styles = StyleSheet.create({
  timerBar: {
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 8,
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.25)',
    position: 'relative',
  },

  defaultTimer: {
    minHeight: 60,
  },

  compactTimer: {
    minHeight: 40,
    paddingTop: 8,
    paddingBottom: 8,
  },

  largeTimer: {
    minHeight: 80,
    paddingTop: 16,
    paddingBottom: 16,
  },

  timerContent: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    flexDirection: 'column',
  },

  timerText: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    margin: 0,
  },

  defaultText: {
    fontSize: '24px',
  },

  compactText: {
    fontSize: '18px',
  },

  largeText: {
    fontSize: '32px',
  },

  timerLabel: {
    fontSize: '12px',
    color: '#ffffff',
    opacity: 0.8,
    marginTop: 4,
    textAlign: 'center',
    margin: 0,
  },

  defaultLabel: {
    fontSize: '12px',
  },

  compactLabel: {
    fontSize: '10px',
  },

  largeLabel: {
    fontSize: '14px',
  },

  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    overflow: 'hidden',
  },

  progressBar: {
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderBottomLeftRadius: 12,
  },
});
