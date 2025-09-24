/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import React, { useCallback, useEffect, useRef } from 'react';
import { Text as TamaguiText, View as TamaguiView, YStack } from 'tamagui';
import { Animated, Platform, Vibration, View } from '../../platform-components';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  colorAnim?: any;
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
function TimerBar({
  time,
  maxTime,
  colorAnim,
  label = 'Time Remaining',
  variant = 'default',
}: TimerBarProps) {
  const minutes = Math.floor(time / 60);
  const seconds = time % 60;

  // Create default color animation if not provided
  const defaultColorAnim = useRef(new Animated.Value(1)).current;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      Animated.timing(defaultColorAnim, {
        duration: 300,
        toValue: animationValue,
        useNativeDriver: false,
      }).start();
    }
  }, [time, maxTime, colorAnim, defaultColorAnim]);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
  const backgroundColor = activeColorAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['#ef4444', '#f59e0b', '#10b981'], // Red, Yellow, Green
  });

  const getTimerHeight = () => {
    switch (variant) {
      case 'compact':
        return 40;
      case 'large':
        return 80;
      default:
        return 60;
    }
  };

  const getTextSize = () => {
    switch (variant) {
      case 'compact':
        return '$3';
      case 'large':
        return '$6';
      default:
        return '$4';
    }
  };

  return (
    <Animated.View
      style={{
        paddingLeft: 20,
        paddingRight: 20,
        paddingTop: 12,
        paddingBottom: 12,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
        marginBottom: 8,
        minHeight: getTimerHeight(),
        backgroundColor,
      }}
    >
      <YStack alignItems="center" justifyContent="center" flex={1}>
        <TamaguiText
          fontSize={getTextSize()}
          fontWeight="700"
          color="white"
          textAlign="center"
        >
          {minutes}:{seconds.toString().padStart(2, '0')}
        </TamaguiText>
        {label && (
          <TamaguiText
            fontSize="$2"
            color="rgba(255,255,255,0.8)"
            textAlign="center"
            marginTop="$1"
          >
            {label}
          </TamaguiText>
        )}
      </YStack>

      {/* Progress indicator */}
      <TamaguiView
        position="absolute"
        bottom={0}
        left={0}
        right={0}
        height={4}
        backgroundColor="rgba(255,255,255,0.2)"
        borderRadius={2}
      >
        <View
          style={{
            width: `${Math.max(0, (time / maxTime) * 100)}%`,
            height: '100%',
            backgroundColor: 'rgba(255,255,255,0.6)',
            borderRadius: 2,
          }}
        />
      </TamaguiView>
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

function CountdownTimer({
  initialTime,
  onTimeUpdate,
  onTimeExpired,
  autoStart = false,
  showWarnings = true,
  warningThresholds = [30, 10, 5, 3, 2, 1],
  label = 'Time Remaining',
  variant = 'default',
  showProgress = true,
}: CountdownTimerProps) {
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

export { TimerBar };
export { CountdownTimer };
