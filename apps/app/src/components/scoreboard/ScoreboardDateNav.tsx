/**
 * ScoreboardDateNav — native date navigation for the mobile scoreboard screen
 * (LS-7803). Supplies the platform-specific date control injected into the
 * shared `ScoreboardContainer`'s `dateNav` slot.
 *
 *  - Prev / Next day arrows (Next is disabled once the selected date is today)
 *  - A tappable date pill that opens a lightweight, dependency-free month
 *    calendar in a modal. Future dates (after today) are not selectable, matching
 *    the web `<input type="date" max={today}>` behaviour.
 */
import React, { useState } from 'react';
import { type GestureResponderEvent, Modal } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { offsetDate, todayISO } from '@legacy-sports/shared-components';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function parseISO(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m: m - 1, d };
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Short date label for the pill (e.g. "Apr 1"). */
function shortLabel(iso: string): string {
  const { y, m, d } = parseISO(iso);
  return new Date(y, m, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function ArrowButton({
  glyph,
  label,
  disabled,
  onPress,
  testID,
}: {
  glyph: string;
  label: string;
  disabled?: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <XStack
      tag="button"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      disabled={disabled}
      onPress={() => {
        if (!disabled) onPress();
      }}
      alignItems="center"
      justifyContent="center"
      width={36}
      height={36}
      borderRadius="$10"
      opacity={disabled ? 0.4 : 1}
      pressStyle={disabled ? undefined : { backgroundColor: '$color4' }}
    >
      <Text fontSize={18} color="$color11" selectable={false}>
        {glyph}
      </Text>
    </XStack>
  );
}

export function ScoreboardDateNav({
  date,
  onChange,
}: {
  date: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const today = todayISO();
  const isToday = date >= today;

  return (
    <>
      <XStack
        alignItems="center"
        gap="$1"
        backgroundColor="$surfacePanel"
        borderColor="$borderColor"
        borderWidth={1}
        borderRadius="$10"
        padding="$1"
        testID="scoreboard-date-nav"
      >
        <ArrowButton
          glyph="←"
          label="Previous day"
          testID="scoreboard-date-prev"
          onPress={() => onChange(offsetDate(date, -1))}
        />
        <XStack
          tag="button"
          accessibilityRole="button"
          accessibilityLabel="Choose scoreboard date"
          testID="scoreboard-date-trigger"
          onPress={() => setOpen(true)}
          alignItems="center"
          justifyContent="center"
          paddingHorizontal="$3"
          minWidth={84}
          height={36}
          borderRadius="$10"
          pressStyle={{ backgroundColor: '$color4' }}
        >
          <Text
            fontSize={14}
            fontWeight="700"
            color="$color12"
            selectable={false}
          >
            {shortLabel(date)}
          </Text>
        </XStack>
        <ArrowButton
          glyph="→"
          label="Next day"
          testID="scoreboard-date-next"
          disabled={isToday}
          onPress={() => onChange(offsetDate(date, 1))}
        />
      </XStack>

      <CalendarModal
        open={open}
        selected={date}
        maxDate={today}
        onClose={() => setOpen(false)}
        onSelect={(iso) => {
          onChange(iso);
          setOpen(false);
        }}
      />
    </>
  );
}

function CalendarModal({
  open,
  selected,
  maxDate,
  onClose,
  onSelect,
}: {
  open: boolean;
  selected: string;
  maxDate: string;
  onClose: () => void;
  onSelect: (iso: string) => void;
}) {
  const initial = parseISO(selected);
  const [view, setView] = useState({ y: initial.y, m: initial.m });

  // Re-anchor the visible month to the selected date each time the sheet opens.
  React.useEffect(() => {
    if (open) {
      const p = parseISO(selected);
      setView({ y: p.y, m: p.m });
    }
  }, [open, selected]);

  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const firstWeekday = new Date(view.y, view.m, 1).getDay();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        backgroundColor="rgba(0,0,0,0.7)"
        padding="$4"
        onPress={onClose}
      >
        <YStack
          backgroundColor="$surfaceCard"
          borderColor="$borderColor"
          borderWidth={1}
          borderRadius="$6"
          padding="$4"
          gap="$3"
          width="100%"
          maxWidth={360}
          testID="scoreboard-date-calendar"
          // Swallow taps inside the card so they don't close the modal.
          onPress={(e: GestureResponderEvent) => e.stopPropagation()}
        >
          <XStack alignItems="center" justifyContent="space-between">
            <ArrowButton
              glyph="‹"
              label="Previous month"
              testID="scoreboard-month-prev"
              onPress={() =>
                setView((v) =>
                  v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 },
                )
              }
            />
            <Text fontSize={16} fontWeight="800" color="$color12">
              {MONTH_LABELS[view.m]} {view.y}
            </Text>
            <ArrowButton
              glyph="›"
              label="Next month"
              testID="scoreboard-month-next"
              onPress={() =>
                setView((v) =>
                  v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 },
                )
              }
            />
          </XStack>

          <XStack>
            {WEEKDAY_LABELS.map((w, i) => (
              <YStack key={i} flex={1} alignItems="center">
                <Text fontSize={11} fontWeight="700" color="$color9">
                  {w}
                </Text>
              </YStack>
            ))}
          </XStack>

          <YStack gap="$1">
            {Array.from({ length: Math.ceil(cells.length / 7) }, (_, row) => (
              <XStack key={row}>
                {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                  if (day == null) {
                    return <YStack key={col} flex={1} height={40} />;
                  }
                  const iso = toISO(view.y, view.m, day);
                  const isSelected = iso === selected;
                  const isDisabled = iso > maxDate;
                  return (
                    <XStack
                      key={col}
                      flex={1}
                      height={40}
                      alignItems="center"
                      justifyContent="center"
                    >
                      <XStack
                        tag="button"
                        accessibilityRole="button"
                        accessibilityLabel={iso}
                        accessibilityState={{
                          selected: isSelected,
                          disabled: isDisabled,
                        }}
                        testID={`scoreboard-date-day-${iso}`}
                        disabled={isDisabled}
                        onPress={() => {
                          if (!isDisabled) onSelect(iso);
                        }}
                        alignItems="center"
                        justifyContent="center"
                        width={34}
                        height={34}
                        borderRadius={17}
                        backgroundColor={
                          isSelected ? '$brandNavy' : 'transparent'
                        }
                        opacity={isDisabled ? 0.3 : 1}
                        pressStyle={
                          isDisabled || isSelected
                            ? undefined
                            : { backgroundColor: '$color4' }
                        }
                      >
                        <Text
                          fontSize={14}
                          fontWeight={isSelected ? '800' : '500'}
                          color={isSelected ? 'white' : '$color12'}
                          selectable={false}
                        >
                          {day}
                        </Text>
                      </XStack>
                    </XStack>
                  );
                })}
              </XStack>
            ))}
          </YStack>
        </YStack>
      </YStack>
    </Modal>
  );
}
