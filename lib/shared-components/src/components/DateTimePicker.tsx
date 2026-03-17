import React, { useState } from 'react';
import { Button, Popover, Text, XStack, YStack } from 'tamagui';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  X,
} from '@tamagui/lucide-icons';
import { Platform } from '../platform-components';

export interface DateTimePickerProps {
  value?: Date;
  onChange: (date: Date) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
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
  const [hour, setHour] = useState(value ? value.getHours() : 12);
  const [minute, setMinute] = useState(value ? value.getMinutes() : 0);
  const [ampm, setAmpm] = useState(
    value ? (value.getHours() >= 12 ? 'PM' : 'AM') : 'PM',
  );

  const formatDateTime = (date: Date): string => {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatInputDateTime = (date: Date): string => {
    // Format for datetime-local input: YYYY-MM-DDTHH:MM
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

    // Add empty cells for days before the first day of the month
    const firstDayOfWeek = firstDay.getDay();
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(new Date(year, monthIndex, -firstDayOfWeek + i + 1));
    }

    // Add all days of the current month
    for (let day = 1; day <= lastDay.getDate(); day++) {
      days.push(new Date(year, monthIndex, day));
    }

    // Add days from next month to fill the grid
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
      const adjustedHour =
        ampm === 'AM' ? (hour === 12 ? 0 : hour) : hour === 12 ? 12 : hour + 12;

      newDateTime.setHours(adjustedHour, minute, 0, 0);
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
              fontFamily: 'inherit',
              width: '100%',
              padding: '10px 14px',
              fontSize: '14px',
              border: '1px solid var(--gray7)',
              borderRadius: '8px',
              backgroundColor: 'var(--gray4)',
              color: 'var(--color)',
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
            <X size="$1" color="$color10" />
          </Button>
        )}
      </XStack>
    );
  }

  // Custom date and time picker popup for both web and mobile
  return (
    <Popover
      size="$5"
      allowFlip
      placement="bottom"
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <XStack alignItems="center" space="$2">
        <Popover.Trigger asChild flex={1}>
          <Button
            size="$4"
            flex={1}
            backgroundColor="$color1"
            borderColor="$borderColor"
            borderWidth={1}
            justifyContent="space-between"
            disabled={disabled}
            pressStyle={{ opacity: 0.8 }}
            onPress={() => {
              setIsOpen(!isOpen);
            }}
          >
            <Text color={value ? '$color' : '$placeholderColor'} flex={1}>
              {value ? formatDateTime(value) : placeholder}
            </Text>
            <XStack alignItems="center" space="$1">
              <Calendar size="$1" color="$color10" />
              <Clock size="$1" color="$color10" />
            </XStack>
          </Button>
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
            <X size={14} color="$color10" />
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
        backgroundColor="$background"
        minWidth={350}
      >
        <YStack space="$4">
          {/* Calendar Section */}
          <YStack space="$3">
            <Text fontSize="$4" fontWeight="600" color="$color">
              Select Date
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
                <ChevronLeft size="$1" />
              </Button>

              <Text fontSize="$4" fontWeight="600" color="$color">
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
                <ChevronRight size="$1" />
              </Button>
            </XStack>

            {/* Weekday Headers */}
            <XStack>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <Button key={day} size="$2" chromeless flex={1}>
                  <Text fontSize="$2" color="$color10" fontWeight="600">
                    {day}
                  </Text>
                </Button>
              ))}
            </XStack>

            {/* Calendar Grid */}
            <YStack space="$1">
              {Array.from(
                { length: Math.ceil(getDaysInMonth(currentMonth).length / 7) },
                (_, weekIndex) => (
                  <XStack key={weekIndex} space="$1">
                    {getDaysInMonth(currentMonth)
                      .slice(weekIndex * 7, (weekIndex + 1) * 7)
                      .map((date, dayIndex) => {
                        const disabled = isDateDisabled(date);
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
                                ? '$blue9'
                                : today
                                  ? '$blue4'
                                  : 'transparent'
                            }
                            opacity={currentMonthDay ? 1 : 0.3}
                            disabled={disabled}
                            onPress={() => {
                              selectDate(date);
                            }}
                            pressStyle={{ opacity: 0.7 }}
                          >
                            <Text
                              fontSize="$2"
                              color={
                                selected
                                  ? 'white'
                                  : disabled
                                    ? '$color6'
                                    : today
                                      ? '$blue11'
                                      : '$color'
                              }
                              fontWeight={today || selected ? '600' : '400'}
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
            <Text fontSize="$4" fontWeight="600" color="$color">
              Select Time
            </Text>

            <XStack space="$2" alignItems="center" justifyContent="center">
              {/* Hour */}
              <YStack alignItems="center" space="$1">
                <Text fontSize="$2" color="$color10">
                  Hour
                </Text>
                <XStack alignItems="center" space="$1">
                  <Button
                    size="$1"
                    chromeless
                    onPress={() =>
                      setHour((prev) => (prev === 1 ? 12 : prev - 1))
                    }
                  >
                    <Text>-</Text>
                  </Button>
                  <Text
                    fontSize="$4"
                    minWidth="$3"
                    textAlign="center"
                    fontWeight="600"
                  >
                    {hour}
                  </Text>
                  <Button
                    size="$1"
                    chromeless
                    onPress={() =>
                      setHour((prev) => (prev === 12 ? 1 : prev + 1))
                    }
                  >
                    <Text>+</Text>
                  </Button>
                </XStack>
              </YStack>

              <Text fontSize="$4" fontWeight="600">
                :
              </Text>

              {/* Minute */}
              <YStack alignItems="center" space="$1">
                <Text fontSize="$2" color="$color10">
                  Min
                </Text>
                <XStack alignItems="center" space="$1">
                  <Button
                    size="$1"
                    chromeless
                    onPress={() =>
                      setMinute((prev) => (prev === 0 ? 45 : prev - 15))
                    }
                  >
                    <Text>-</Text>
                  </Button>
                  <Text
                    fontSize="$4"
                    minWidth="$3"
                    textAlign="center"
                    fontWeight="600"
                  >
                    {String(minute).padStart(2, '0')}
                  </Text>
                  <Button
                    size="$1"
                    chromeless
                    onPress={() =>
                      setMinute((prev) => (prev === 45 ? 0 : prev + 15))
                    }
                  >
                    <Text>+</Text>
                  </Button>
                </XStack>
              </YStack>

              {/* AM/PM */}
              <YStack alignItems="center" space="$1">
                <Text fontSize="$2" color="$color10">
                  Period
                </Text>
                <Button
                  size="$2"
                  backgroundColor={ampm === 'AM' ? '$blue9' : '$color1'}
                  onPress={() => setAmpm(ampm === 'AM' ? 'PM' : 'AM')}
                  minWidth="$4"
                >
                  <Text
                    color={ampm === 'AM' ? 'white' : '$color'}
                    fontWeight="600"
                  >
                    {ampm}
                  </Text>
                </Button>
              </YStack>
            </XStack>
          </YStack>

          {/* Action Buttons */}
          <XStack space="$2" justifyContent="flex-end">
            <Button size="$3" chromeless onPress={() => setIsOpen(false)}>
              <Text color="$color10">Cancel</Text>
            </Button>
            <Button
              size="$3"
              backgroundColor="$blue9"
              disabled={!selectedDate}
              onPress={applyDateTime}
            >
              <Text color="white" fontWeight="600">
                Apply
              </Text>
            </Button>
          </XStack>
        </YStack>
      </Popover.Content>
    </Popover>
  );
}
