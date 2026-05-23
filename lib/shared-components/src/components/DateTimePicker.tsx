import React, { useState } from 'react';
import { Button, Popover, Text, XStack, YStack } from 'tamagui';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  X,
} from '@tamagui/lucide-icons';
import { to12Hour, to24Hour } from './dateTimePickerUtils';
import { Platform } from '../platform-components';

export interface DateTimePickerProps {
  value?: Date;
  onChange: (date: Date) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  error?: boolean;
  errorMessage?: string;
  /**
   * Whether to use native HTML5 datetime-local input on web
   * @default true - uses native input on web, custom picker on mobile
   * Set to false to always use custom picker popup
   */
  useNativeInput?: boolean;
  /** Extra CSS class applied to the native <input> on web (e.g. for pseudo-element styling). */
  inputClassName?: string;
  /** Inline style overrides merged onto the native <input> on web. */
  inputStyle?: React.CSSProperties;
  /** Called when the user clears the selected date. Only shown when a value is set. */
  onClear?: () => void;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = 'Select date and time',
  disabled = false,
  minDate,
  maxDate,
  error = false,
  errorMessage,
  useNativeInput = true,
  inputClassName,
  inputStyle,
  onClear,
}: DateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(
    value ? new Date(value.getFullYear(), value.getMonth(), 1) : new Date(),
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(value || null);
  const [hour, setHour] = useState(value ? to12Hour(value.getHours()) : 12);
  const [minute, setMinute] = useState(value ? value.getMinutes() : 0);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>(
    value ? (value.getHours() >= 12 ? 'PM' : 'AM') : 'PM',
  );

  const formatDateShort = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime12h = (date: Date): string => {
    const h = to12Hour(date.getHours());
    const m = String(date.getMinutes()).padStart(2, '0');
    const period = date.getHours() >= 12 ? 'PM' : 'AM';
    return `${h}:${m} ${period}`;
  };

  const formatInputDateTime = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const parseInputDateTime = (dateTimeString: string): Date | null => {
    try {
      const date = new Date(dateTimeString);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  };

  const isDateDisabled = (date: Date): boolean => {
    // Compare calendar dates only (ignoring time) so that "today" remains
    // selectable even when minDate carries a non-midnight timestamp.
    const startOfDay = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

    if (minDate && startOfDay(date) < startOfDay(minDate)) return true;
    if (maxDate && startOfDay(date) > startOfDay(maxDate)) return true;
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
      setSelectedDate(date);
    }
  };

  const applyDateTime = () => {
    if (selectedDate) {
      const newDateTime = new Date(selectedDate);
      const adjustedHour = to24Hour(hour, ampm);

      newDateTime.setHours(adjustedHour, minute, 0, 0);

      // Clamp to min/max so that selecting a time on the boundary day
      // cannot produce a value outside the allowed range.
      if (minDate && newDateTime.getTime() < minDate.getTime()) {
        newDateTime.setTime(minDate.getTime());
      }
      if (maxDate && newDateTime.getTime() > maxDate.getTime()) {
        newDateTime.setTime(maxDate.getTime());
      }

      onChange(newDateTime);
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
    return selectedDate
      ? date.toDateString() === selectedDate.toDateString()
      : false;
  };

  const handleClear = () => {
    setSelectedDate(null);
    setIsOpen(false);
    onClear?.();
  };

  // On web, optionally use native datetime-local input
  if (Platform.OS === 'web' && useNativeInput) {
    return (
      <YStack>
        <XStack alignItems="center" space="$2">
          <YStack flex={1}>
            <input
              type="datetime-local"
              className={inputClassName}
              value={value ? formatInputDateTime(value) : ''}
              onChange={(e) => {
                if (!e.target.value) {
                  handleClear();
                  return;
                }
                const parsedDate = parseInputDateTime(e.target.value);
                if (parsedDate) {
                  onChange(parsedDate);
                }
              }}
              placeholder={placeholder}
              disabled={disabled}
              min={minDate ? formatInputDateTime(minDate) : undefined}
              max={maxDate ? formatInputDateTime(maxDate) : undefined}
              style={{
                colorScheme: 'dark',
                fontFamily:
                  "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
                width: '100%',
                padding: '10px 14px',
                fontSize: '14px',
                border: error
                  ? '1px solid var(--color-red6)'
                  : '1px solid var(--color-borderColor)',
                borderRadius: '6px',
                backgroundColor: 'var(--color-surfaceCard)',
                color: 'var(--color-color)',
                boxShadow: error ? '0 0 0 3px rgba(176, 46, 68, 0.22)' : 'none',
                opacity: disabled ? 0.5 : 1,
                cursor: disabled ? 'not-allowed' : 'default',
                outline: 'none',
                ...inputStyle,
              }}
            />
          </YStack>
          {value && onClear && (
            <Button
              size="$3"
              chromeless
              onPress={handleClear}
              disabled={disabled}
              pressStyle={{ opacity: 0.7 }}
              aria-label="Clear date/time"
              accessibilityLabel="Clear date/time"
            >
              <X size="$1" color="$textMuted" />
            </Button>
          )}
        </XStack>
        {errorMessage && (
          <Text fontSize={12} color="$red7" marginTop={4}>
            {errorMessage}
          </Text>
        )}
      </YStack>
    );
  }

  // Custom date and time picker popup for both web and mobile
  return (
    <YStack>
      <Popover
        size="$5"
        allowFlip
        placement="bottom"
        open={isOpen}
        onOpenChange={setIsOpen}
      >
        <XStack alignItems="center" space="$2">
          {/* Two-field trigger: date field + time field side by side */}
          <Popover.Trigger asChild flex={1}>
            <XStack
              flex={1}
              cursor="pointer"
              pressStyle={{ opacity: 0.8 }}
              role="button"
              tabIndex={0}
              onPress={() => {
                setIsOpen(!isOpen);
              }}
            >
              {/* Date sub-field */}
              <XStack
                flex={1}
                backgroundColor="$surfaceCard"
                borderWidth={1}
                borderColor={error ? '$red6' : '$borderColor'}
                borderTopLeftRadius={6}
                borderBottomLeftRadius={6}
                borderRightWidth={0}
                paddingVertical={11}
                paddingHorizontal={14}
                alignItems="center"
                justifyContent="space-between"
                style={
                  error
                    ? { boxShadow: '0 0 0 3px rgba(176, 46, 68, 0.22)' }
                    : undefined
                }
              >
                <Text
                  style={{
                    fontFamily:
                      "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
                  }}
                  fontSize={14}
                  color={value ? '$color' : '$color10'}
                >
                  {value ? formatDateShort(value) : 'Date…'}
                </Text>
                <Calendar size={16} color="$textMuted" />
              </XStack>
              {/* Time sub-field */}
              <XStack
                flex={1}
                backgroundColor="$surfaceCard"
                borderWidth={1}
                borderColor={error ? '$red6' : '$borderColor'}
                borderTopRightRadius={6}
                borderBottomRightRadius={6}
                paddingVertical={11}
                paddingHorizontal={14}
                alignItems="center"
                justifyContent="space-between"
                style={
                  error
                    ? { boxShadow: '0 0 0 3px rgba(176, 46, 68, 0.22)' }
                    : undefined
                }
              >
                <Text
                  style={{
                    fontFamily:
                      "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
                  }}
                  fontSize={14}
                  color={value ? '$color' : '$color10'}
                >
                  {value ? formatTime12h(value) : 'Time…'}
                </Text>
                <Clock size={16} color="$textMuted" />
              </XStack>
            </XStack>
          </Popover.Trigger>
          {value && onClear && (
            <Button
              size="$3"
              chromeless
              onPress={handleClear}
              disabled={disabled}
              aria-label="Clear date/time"
              accessibilityLabel="Clear date/time"
              pressStyle={{ opacity: 0.7 }}
            >
              <X size={14} color="$textMuted" />
            </Button>
          )}
        </XStack>

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
          minWidth={350}
        >
          <YStack space="$4">
            {/* Calendar Section */}
            <YStack space="$3">
              <Text
                style={{
                  fontFamily:
                    "'Big Shoulders Display', 'Oswald', system-ui, sans-serif",
                }}
                fontSize={13}
                fontWeight="700"
                letterSpacing={0.1}
                color="$textMuted"
              >
                SELECT DATE
              </Text>

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
                  letterSpacing={0.5}
                  color="$color"
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
                  {
                    length: Math.ceil(getDaysInMonth(currentMonth).length / 7),
                  },
                  (_, weekIndex) => (
                    <XStack key={weekIndex}>
                      {getDaysInMonth(currentMonth)
                        .slice(weekIndex * 7, (weekIndex + 1) * 7)
                        .map((date, dayIndex) => {
                          const dateDisabled = isDateDisabled(date);
                          const selected = isSelected(date);
                          const today = isToday(date);
                          const currentMonthDay = isSameMonth(
                            date,
                            currentMonth,
                          );

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
            </YStack>

            {/* Time Section */}
            <YStack space="$3">
              <Text
                style={{
                  fontFamily:
                    "'Big Shoulders Display', 'Oswald', system-ui, sans-serif",
                }}
                fontSize={13}
                fontWeight="700"
                letterSpacing={0.1}
                color="$textMuted"
              >
                SELECT TIME
              </Text>

              {/* Time Display + AM/PM */}
              <XStack alignItems="center" justifyContent="center">
                {/* Hour */}
                <YStack alignItems="center" gap={4}>
                  <Text
                    fontSize={11}
                    style={{
                      fontFamily:
                        "'Big Shoulders Display', 'Oswald', system-ui, sans-serif",
                    }}
                    fontWeight="700"
                    letterSpacing={0.1}
                    color="$textMuted"
                  >
                    HR
                  </Text>
                  <XStack alignItems="center" gap={4}>
                    <Button
                      size="$1"
                      chromeless
                      onPress={() =>
                        setHour((prev) => (prev === 1 ? 12 : prev - 1))
                      }
                      pressStyle={{ opacity: 0.7 }}
                    >
                      <Text color="$textMuted" fontSize={16} fontWeight="600">
                        −
                      </Text>
                    </Button>
                    <Text
                      style={{
                        fontFamily:
                          "'Big Shoulders Display', 'Oswald', system-ui, sans-serif",
                        fontVariantNumeric: 'tabular-nums',
                      }}
                      fontVariant={['tabular-nums']}
                      fontSize={22}
                      fontWeight="800"
                      color="$color"
                      minWidth={34}
                      textAlign="center"
                    >
                      {String(hour).padStart(2, '0')}
                    </Text>
                    <Button
                      size="$1"
                      chromeless
                      onPress={() =>
                        setHour((prev) => (prev === 12 ? 1 : prev + 1))
                      }
                      pressStyle={{ opacity: 0.7 }}
                    >
                      <Text color="$textMuted" fontSize={16} fontWeight="600">
                        +
                      </Text>
                    </Button>
                  </XStack>
                </YStack>

                {/* Colon */}
                <Text
                  style={{
                    fontFamily:
                      "'Big Shoulders Display', 'Oswald', system-ui, sans-serif",
                  }}
                  fontSize={22}
                  fontWeight="800"
                  color="$textMuted"
                  marginHorizontal={4}
                  marginTop={16}
                >
                  :
                </Text>

                {/* Minute */}
                <YStack alignItems="center" gap={4}>
                  <Text
                    fontSize={11}
                    style={{
                      fontFamily:
                        "'Big Shoulders Display', 'Oswald', system-ui, sans-serif",
                    }}
                    fontWeight="700"
                    letterSpacing={0.1}
                    color="$textMuted"
                  >
                    MIN
                  </Text>
                  <XStack alignItems="center" gap={4}>
                    <Button
                      size="$1"
                      chromeless
                      onPress={() =>
                        setMinute((prev) => (prev === 0 ? 45 : prev - 15))
                      }
                      pressStyle={{ opacity: 0.7 }}
                    >
                      <Text color="$textMuted" fontSize={16} fontWeight="600">
                        −
                      </Text>
                    </Button>
                    <Text
                      style={{
                        fontFamily:
                          "'Big Shoulders Display', 'Oswald', system-ui, sans-serif",
                        fontVariantNumeric: 'tabular-nums',
                      }}
                      fontVariant={['tabular-nums']}
                      fontSize={22}
                      fontWeight="800"
                      color="$color"
                      minWidth={34}
                      textAlign="center"
                    >
                      {String(minute).padStart(2, '0')}
                    </Text>
                    <Button
                      size="$1"
                      chromeless
                      onPress={() =>
                        setMinute((prev) => (prev === 45 ? 0 : prev + 15))
                      }
                      pressStyle={{ opacity: 0.7 }}
                    >
                      <Text color="$textMuted" fontSize={16} fontWeight="600">
                        +
                      </Text>
                    </Button>
                  </XStack>
                </YStack>

                {/* AM/PM Toggle */}
                <XStack
                  backgroundColor="$surfaceCard"
                  borderWidth={1}
                  borderColor="$borderColor"
                  borderRadius={6}
                  padding={3}
                  marginLeft={8}
                  marginTop={16}
                >
                  {(['AM', 'PM'] as const).map((period) => (
                    <Button
                      key={period}
                      chromeless
                      backgroundColor={
                        ampm === period ? '$brandNavy' : 'transparent'
                      }
                      borderRadius={4}
                      paddingHorizontal={10}
                      paddingVertical={6}
                      onPress={() => setAmpm(period)}
                      pressStyle={{ opacity: 0.8 }}
                    >
                      <Text
                        style={{
                          fontFamily:
                            "'Big Shoulders Display', 'Oswald', system-ui, sans-serif",
                        }}
                        fontSize={11}
                        fontWeight="700"
                        letterSpacing={0.08}
                        color={ampm === period ? '$textOnAccent' : '$textMuted'}
                      >
                        {period}
                      </Text>
                    </Button>
                  ))}
                </XStack>
              </XStack>
            </YStack>

            {/* Action Buttons */}
            <XStack space="$2" justifyContent="flex-end">
              <Button size="$3" chromeless onPress={() => setIsOpen(false)}>
                <Text
                  style={{
                    fontFamily:
                      "'Big Shoulders Display', 'Oswald', system-ui, sans-serif",
                  }}
                  fontSize={13}
                  fontWeight="700"
                  letterSpacing={0.06}
                  color="$textMuted"
                >
                  CANCEL
                </Text>
              </Button>
              <Button
                size="$3"
                backgroundColor="$brandNavy"
                disabled={!selectedDate}
                onPress={applyDateTime}
                pressStyle={{ opacity: 0.85 }}
              >
                <Text
                  style={{
                    fontFamily:
                      "'Big Shoulders Display', 'Oswald', system-ui, sans-serif",
                  }}
                  fontSize={13}
                  fontWeight="700"
                  letterSpacing={0.06}
                  color="$textOnAccent"
                >
                  APPLY
                </Text>
              </Button>
            </XStack>
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
