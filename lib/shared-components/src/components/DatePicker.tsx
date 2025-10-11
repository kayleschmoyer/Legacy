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
  placeholder = "Select date",
  disabled = false,
  minDate,
  maxDate,
  useNativeInput = true,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(
    value ? new Date(value.getFullYear(), value.getMonth(), 1) : new Date()
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
    setCurrentMonth(prev => {
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
    return date.getMonth() === month.getMonth() && date.getFullYear() === month.getFullYear();
  };

  const isSelected = (date: Date): boolean => {
    return value ? date.toDateString() === value.toDateString() : false;
  };

  // On web, optionally use native date input
  if (Platform.OS === 'web' && useNativeInput) {
    // Use a native HTML input element wrapped in Tamagui styling
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
            padding: '12px 16px',
            fontSize: '16px',
            border: '1px solid var(--color-borderColor)',
            borderRadius: '8px',
            backgroundColor: 'var(--color-color1)',
            color: 'var(--color-color)',
          }}
        />
      </YStack>
    );
  }

  // Custom calendar popup for both web and mobile
  return (
    <Popover size="$5" allowFlip placement="bottom" open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <Button
          size="$4"
          backgroundColor="$color1"
          borderColor="$borderColor"
          borderWidth={1}
          justifyContent="space-between"
          disabled={disabled}
          pressStyle={{ opacity: 0.8 }}
          onPress={() => {
            // Prevent form submission on web - simplified without event handling
            console.log('DatePicker trigger pressed, opening calendar');
            setIsOpen(!isOpen);
          }}
        >
          <Text color={value ? "$color" : "$placeholderColor"}>
            {value ? formatDate(value) : placeholder}
          </Text>
          <Calendar size="$1" color="$color10" />
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
        backgroundColor="$background"
        minWidth={300}
      >
        <YStack padding="$3" space="$3" backgroundColor="$color1">
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
            
            <Text fontSize="$5" fontWeight="600" color="$color">
              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
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
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <Button key={day} size="$2" chromeless flex={1}>
                <Text fontSize="$2" color="$color10" fontWeight="600">
                  {day}
                </Text>
              </Button>
            ))}
          </XStack>
          
          {/* Calendar Grid */}
          <YStack space="$1">
            {Array.from({ length: Math.ceil(getDaysInMonth(currentMonth).length / 7) }, (_, weekIndex) => (
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
                        size="$3"
                        flex={1}
                        chromeless={!selected}
                        backgroundColor={
                          selected ? '$blue9' : today ? '$blue4' : 'transparent'
                        }
                        opacity={currentMonthDay ? 1 : 0.3}
                        disabled={disabled}
                        onPress={() => {
                          selectDate(date);
                        }}
                        pressStyle={{ opacity: 0.7 }}
                      >
                        <Text
                          fontSize="$3"
                          color={
                            selected ? 'white' : 
                            disabled ? '$color6' : 
                            today ? '$blue11' : '$color'
                          }
                          fontWeight={today || selected ? '600' : '400'}
                        >
                          {date.getDate()}
                        </Text>
                      </Button>
                    );
                  })}
              </XStack>
            ))}
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
            <Text fontSize="$3" color="$blue10">
              Today
            </Text>
          </Button>
        </YStack>
      </Popover.Content>
    </Popover>
  );
}
