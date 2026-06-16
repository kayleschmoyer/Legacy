import React, { useCallback } from 'react';
import { Button, Text, XStack, YStack } from 'tamagui';
import { Platform } from '../../platform-components';

/**
 * Column visibility / order / pin state for the GameLogsTable customizer.
 *
 * - `order`: explicit column key order; columns not listed retain their
 *   API-returned order *behind* the listed ones.
 * - `hidden`: columns the user has hidden via the visibility checkbox.
 * - `pinned`: columns pinned to the left edge of the horizontal scroll
 *   wrapper (LS-7464). Pinned columns always lead, regardless of `order`.
 */
export interface ColumnPreferences {
  order: string[];
  hidden: string[];
  pinned: string[];
}

interface ColumnCustomizerProps {
  /** All currently-available column keys after premium gating. */
  allColumns: string[];
  prefs: ColumnPreferences;
  onChange: (next: ColumnPreferences) => void;
  onClose: () => void;
}

/**
 * Combined visible-then-hidden column list using the user's current order.
 * Pinned columns lead; remaining columns follow in `prefs.order` (then
 * insertion order for columns not yet customized).
 */
function combinedOrder(
  allColumns: string[],
  prefs: ColumnPreferences,
): string[] {
  const orderIndex = (k: string) => {
    const i = prefs.order.indexOf(k);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...allColumns].sort((a, b) => {
    const pa = prefs.pinned.includes(a) ? 0 : 1;
    const pb = prefs.pinned.includes(b) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const oi = orderIndex(a) - orderIndex(b);
    if (oi !== 0) return oi;
    return allColumns.indexOf(a) - allColumns.indexOf(b);
  });
}

/**
 * Move `key` one slot up or down within the order. We snapshot the full
 * derived order (including columns the user hasn't touched yet) so the new
 * `order` is complete and predictable on subsequent renders.
 */
function moveInOrder(
  allColumns: string[],
  prefs: ColumnPreferences,
  key: string,
  delta: -1 | 1,
): ColumnPreferences {
  const current = combinedOrder(allColumns, prefs);
  const idx = current.indexOf(key);
  if (idx === -1) return prefs;
  const target = idx + delta;
  if (target < 0 || target >= current.length) return prefs;
  // Don't let an unpinned column jump above a pinned column (or vice versa).
  const isPinned = prefs.pinned.includes(key);
  const neighborPinned = prefs.pinned.includes(current[target]);
  if (isPinned !== neighborPinned) return prefs;

  const next = [...current];
  [next[idx], next[target]] = [next[target], next[idx]];
  return { ...prefs, order: next };
}

/**
 * Cross-platform column customizer rendered inline beneath the table.
 *
 * dnd-kit would give a nicer reorder UX on web but it's a web-only library
 * and this component ships in `lib/shared-components` (consumed by both web
 * and native). Up/down arrows keep the interaction model identical on both
 * platforms — the brief explicitly endorses this as a fallback.
 */
export const ColumnCustomizer: React.FC<ColumnCustomizerProps> = ({
  allColumns,
  prefs,
  onChange,
  onClose,
}) => {
  const ordered = combinedOrder(allColumns, prefs);

  const toggleHidden = useCallback(
    (key: string) => {
      const hidden = prefs.hidden.includes(key)
        ? prefs.hidden.filter((k) => k !== key)
        : [...prefs.hidden, key];
      onChange({ ...prefs, hidden });
    },
    [prefs, onChange],
  );

  const togglePinned = useCallback(
    (key: string) => {
      const pinned = prefs.pinned.includes(key)
        ? prefs.pinned.filter((k) => k !== key)
        : [...prefs.pinned, key];
      onChange({ ...prefs, pinned });
    },
    [prefs, onChange],
  );

  const move = useCallback(
    (key: string, delta: -1 | 1) => {
      onChange(moveInOrder(allColumns, prefs, key, delta));
    },
    [allColumns, prefs, onChange],
  );

  const resetAll = useCallback(() => {
    onChange({ order: [], hidden: [], pinned: [] });
  }, [onChange]);

  const isWeb = Platform.OS === 'web';

  return (
    <YStack
      marginTop="$3"
      padding="$3"
      borderWidth={1}
      borderColor="$gray6"
      borderRadius="$3"
      backgroundColor="$gray2"
      data-testid="column-customizer"
      // Cap height + scroll on web so the drawer doesn't push the table
      // off-screen for a 30-column stat payload.
      {...(isWeb
        ? {
            style: { maxHeight: 360, overflowY: 'auto' } as React.CSSProperties,
          }
        : {})}
    >
      <XStack
        justifyContent="space-between"
        alignItems="center"
        marginBottom="$2"
      >
        <Text fontSize="$5" fontWeight="bold">
          Customize columns
        </Text>
        <XStack gap="$2">
          <Button
            size="$2"
            onPress={resetAll}
            data-testid="column-customizer-reset"
          >
            <Text>Reset</Text>
          </Button>
          <Button
            size="$2"
            onPress={onClose}
            data-testid="column-customizer-close"
          >
            <Text>Done</Text>
          </Button>
        </XStack>
      </XStack>

      <YStack gap="$1">
        {ordered.map((key, idx) => {
          const visible = !prefs.hidden.includes(key);
          const pinned = prefs.pinned.includes(key);
          const isFirstInGroup =
            idx === 0 || prefs.pinned.includes(ordered[idx - 1]) !== pinned;
          const isLastInGroup =
            idx === ordered.length - 1 ||
            prefs.pinned.includes(ordered[idx + 1]) !== pinned;
          return (
            <XStack
              key={key}
              padding="$2"
              gap="$2"
              alignItems="center"
              backgroundColor="$background"
              borderRadius="$2"
              data-testid={`column-customizer-row-${key}`}
            >
              {/* Visibility checkbox — native-friendly toggle button. */}
              <Button
                size="$2"
                backgroundColor={visible ? '$blue10' : '$gray4'}
                onPress={() => toggleHidden(key)}
                data-testid={`column-customizer-visible-${key}`}
                aria-label={`${visible ? 'Hide' : 'Show'} ${key}`}
              >
                <Text color={visible ? '$white' : '$gray12'}>
                  {visible ? '✓' : ''}
                </Text>
              </Button>
              <Text flex={1} fontWeight={pinned ? '700' : '500'}>
                {key}
              </Text>
              <Button
                size="$2"
                backgroundColor={pinned ? '$yellow8' : '$gray4'}
                onPress={() => togglePinned(key)}
                data-testid={`column-customizer-pin-${key}`}
                aria-label={`${pinned ? 'Unpin' : 'Pin'} ${key}`}
              >
                <Text>{pinned ? '📌' : 'Pin'}</Text>
              </Button>
              <Button
                size="$2"
                disabled={isFirstInGroup}
                opacity={isFirstInGroup ? 0.4 : 1}
                onPress={() => move(key, -1)}
                data-testid={`column-customizer-up-${key}`}
                aria-label={`Move ${key} up`}
              >
                <Text>▲</Text>
              </Button>
              <Button
                size="$2"
                disabled={isLastInGroup}
                opacity={isLastInGroup ? 0.4 : 1}
                onPress={() => move(key, 1)}
                data-testid={`column-customizer-down-${key}`}
                aria-label={`Move ${key} down`}
              >
                <Text>▼</Text>
              </Button>
            </XStack>
          );
        })}
      </YStack>
    </YStack>
  );
};

export default ColumnCustomizer;
