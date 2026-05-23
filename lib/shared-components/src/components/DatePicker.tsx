import React, { useState } from 'react';
import { Button, Popover, Text, XStack, YStack } from 'tamagui';
import { Calendar, ChevronLeft, ChevronRight } from '@tamagui/lucide-icons';
import { Platform } from '../platform-components';

export interface DatePickerProps {
  value?: Date;
  onChange: (date: Date) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  error?: boolean;
  errorMessage?: string;
  /**
   * Whether to use native HTML5 date input on web
   * @default true - uses native input on web, custom calendar on mobile
   * Set to false to always use custom calendar popup
   */
  useNativeInput?: boolean;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  disabled = false,
  minDate,
  maxDate,
  error = false,
  errorMessage,
  useNativeInput = true,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(
    value ? new Date(value.getFullYear(), value.getMonth(), 1) : new Date(),
  );

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatInputDate = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  const parseInputDate = (dateString: string): Date | null => {
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  };

  const isDateDisabled = (date: Date): boolean => {
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;
    return false;
  };

  const getDaysInMonth = (month: Date): Date[] => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstDay = new Date(year, monthIndex, 1);
    const lastDay = new Date(year, monthIndex + 1, 0);

    const days: Date[] = [];

    const firstDayOfWeek = firstDay.getDay();
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(new Date(year, monthIndex, -firstDayOfWeek + i + 1));
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      days.push(new Date(year, monthIndex, day));
    }

    const totalCells = Math.ceil(days.length / 7) * 7;
    const remainingCells = totalCells - days.length;
    for (let day = 1; day <= remainingCells; day++) {
      days.push(new Date(year, monthIndex + 1, day));
    }

    return days;
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth((prev) => {
      const newMonth = new Date(prev);
      if (direction === 'prev') {
        newMonth.setMonth(prev.getMonth() - 1);
      } else {
        newMonth.setMonth(prev.getMonth() + 1);
      }
      return newMonth;
    });
  };

  const selectDate = (date: Date) => {
    if (!isDateDisabled(date)) {
      onChange(date);
      setIsOpen(false);
    }
  };

  const isToday = (date: Date): boolean => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isSameMonth = (date: Date, month: Date): boolean => {
    return (
      date.getMonth() === month.getMonth() &&
      date.getFullYear() === month.getFullYear()
    );
  };

  const isSelected = (date: Date): boolean => {
    return value ? date.toDateString() === value.toDateString() : false;
  };

  // On web, optionally use native date input
  if (Platform.OS === 'web' && useNativeInput) {
    return (
      <YStack>
        <input
          type="date"
          value={value ? formatInputDate(value) : ''}
          onChange={(e) => {
            const parsedDate = parseInputDate(e.target.value);
            if (parsedDate) {
              onChange(parsedDate);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          min={minDate ? formatInputDate(minDate) : undefined}
          max={maxDate ? formatInputDate(maxDate) : undefined}
          style={{
            width: '100%',
            padding: '11px 14px',
            fontSize: '14px',
            fontFamily:
              "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
            border: error
              ? '1px solid var(--color-red6)'
              : '1px solid var(--color-borderColor)',
            borderRadius: '6px',
            backgroundColor: 'var(--color-surfaceCard)',
            color: 'var(--color-color)',
            boxShadow: error ? '0 0 0 3px rgba(176, 46, 68, 0.22)' : 'none',
            outline: 'none',
            colorScheme: 'dark',
            opacity: disabled ? 0.5 : 1,
            cursor: disabled ? 'not-allowed' : 'default',
          }}
        />
        {errorMessage && (
          <Text fontSize={12} color="$red7" marginTop={4}>
            {errorMessage}
          </Text>
        )}
      </YStack>
    );
  }

  // Custom calendar popup for both web and mobile
  return (
    <YStack>
      <Popover
        size="$5"
        allowFlip
        placement="bottom"
        open={isOpen}
        onOpenChange={setIsOpen}
      >
        <Popover.Trigger asChild>
          <Button
            size="$4"
            backgroundColor="$surfaceCard"
            borderColor={error ? '$red6' : '$borderColor'}
            borderWidth={1}
            borderRadius={6}
            justifyContent="space-between"
            disabled={disabled}
            pressStyle={{ opacity: 0.8 }}
            style={
              error
                ? { boxShadow: '0 0 0 3px rgba(176, 46, 68, 0.22)' }
                : undefined
            }
            onPress={() => {
              setIsOpen(!isOpen);
            }}
          >
            <Text
              style={{
                fontFamily:
                  "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
              }}
              fontSize={14}
              color={value ? '$color' : '$color10'}
            >
              {value ? formatDate(value) : placeholder}
            </Text>
            <Calendar size="$1" color="$textMuted" />
          </Button>
        </Popover.Trigger>

        <Popover.Content
          borderWidth={1}
          borderColor="$borderColor"
          elevate
          animation={[
            'quick',
            {
              opacity: {
                overshootClamping: true,
              },
            },
          ]}
          enterStyle={{ y: -10, opacity: 0 }}
          exitStyle={{ y: -10, opacity: 0 }}
          padding="$3"
          backgroundColor="$surfaceCard"
          minWidth={300}
        >
          <YStack padding="$3" space="$3" backgroundColor="$surfaceCard">
            {/* Month Navigation */}
            <XStack justifyContent="space-between" alignItems="center">
              <Button
                size="$2"
                chromeless
                onPress={() => {
                  navigateMonth('prev');
                }}
                pressStyle={{ opacity: 0.7 }}
              >
                <ChevronLeft size="$1" color="$textMuted" />
              </Button>

              <Text
                style={{
                  fontFamily:
                    "'Big Shoulders Display', 'Oswald', system-ui, sans-serif",
                }}
                fontSize={15}
                fontWeight="700"
                color="$color"
                letterSpacing={0.5}
              >
                {currentMonth.toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>

              <Button
                size="$2"
                chromeless
                onPress={() => {
                  navigateMonth('next');
                }}
                pressStyle={{ opacity: 0.7 }}
              >
                <ChevronRight size="$1" color="$textMuted" />
              </Button>
            </XStack>

            {/* Weekday Headers */}
            <XStack>
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
                <Text
                  key={day}
                  flex={1}
                  textAlign="center"
                  style={{
                    fontFamily:
                      "'Big Shoulders Display', 'Oswald', system-ui, sans-serif",
                  }}
                  fontSize={11}
                  fontWeight="700"
                  letterSpacing={0.1}
                  color="$textMuted"
                  paddingVertical={4}
                >
                  {day}
                </Text>
              ))}
            </XStack>

            {/* Calendar Grid */}
            <YStack space="$1">
              {Array.from(
                { length: Math.ceil(getDaysInMonth(currentMonth).length / 7) },
                (_, weekIndex) => (
                  <XStack key={weekIndex}>
                    {getDaysInMonth(currentMonth)
                      .slice(weekIndex * 7, (weekIndex + 1) * 7)
                      .map((date, dayIndex) => {
                        const dateDisabled = isDateDisabled(date);
                        const selected = isSelected(date);
                        const today = isToday(date);
                        const currentMonthDay = isSameMonth(date, currentMonth);

                        return (
                          <Button
                            key={`${weekIndex}-${dayIndex}`}
                            size="$2"
                            flex={1}
                            chromeless={!selected}
                            backgroundColor={
                              selected
                                ? '$brandNavy'
                                : today
                                  ? '$accentMuted'
                                  : 'transparent'
                            }
                            borderRadius={4}
                            opacity={currentMonthDay ? 1 : 0.3}
                            disabled={dateDisabled}
                            onPress={() => {
                              selectDate(date);
                            }}
                            pressStyle={{ opacity: 0.7 }}
                          >
                            <Text
                              style={{
                                fontFamily:
                                  "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
                              }}
                              fontVariant={['tabular-nums']}
                              fontSize={13}
                              color={
                                selected
                                  ? '$textOnAccent'
                                  : dateDisabled
                                    ? '$color6'
                                    : '$color'
                              }
                              fontWeight={selected ? '600' : '400'}
                            >
                              {date.getDate()}
                            </Text>
                          </Button>
                        );
                      })}
                  </XStack>
                ),
              )}
            </YStack>

            {/* Today Button */}
            <Button
              size="$2"
              chromeless
              onPress={() => {
                const today = new Date();
                if (!isDateDisabled(today)) {
                  selectDate(today);
                }
              }}
              disabled={isDateDisabled(new Date())}
            >
              <Text
                style={{
                  fontFamily:
                    "'Big Shoulders Display', 'Oswald', system-ui, sans-serif",
                }}
                fontSize={12}
                fontWeight="700"
                letterSpacing={0.08}
                color="$brandNavy"
              >
                TODAY
              </Text>
            </Button>
          </YStack>
        </Popover.Content>
      </Popover>
      {errorMessage && (
        <Text fontSize={12} color="$red7" marginTop={4}>
          {errorMessage}
        </Text>
      )}
    </YStack>
  );
}
