import React, { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { History } from '@tamagui/lucide-icons/icons/History';
import { Popover } from '../../components/Popover';

/**
 * One `league_scoring_change_log` row, shaped for display (mirrors the
 * generated `ScoringChangeLogEntry` GraphQL type without coupling this
 * presentational component to a codegen import). `statDisplayName` and
 * `changedAt` are always present on a real entry (non-null in the GraphQL
 * schema); `previousMultiplier`/`newMultiplier`/`changedByUsername` are
 * genuinely nullable — a newly-added or disabled stat has no "before" or
 * "after" multiplier, and a change may have no attributable user. Those
 * three also allow `undefined`, matching the generated type: a GraphQL
 * field that's merely nullable (not `!`) comes through codegen as an
 * optional property (`field?: Maybe<T>`), not just `T | null`.
 */
export interface StaleScoringChangeLogEntry {
  statDisplayName: string;
  previousMultiplier?: number | null;
  newMultiplier?: number | null;
  /** ISO 8601 */
  changedAt: string;
  changedByUsername?: string | null;
}

export interface StaleScoringIndicatorProps {
  /**
   * `Matchup.scoringIsStale`. Renders nothing for `false` (fresh), `null`
   * (unknown — no false positive before provenance is stamped) or
   * `undefined`. Only `true` renders the indicator (AC1, AC3).
   */
  scoringIsStale: boolean | null | undefined;
  /**
   * `Matchup.scoringChangeLog` — what changed and when, shown on interaction
   * (AC2). May be empty while still stale (e.g. a pre-provenance score with
   * no logged change), in which case the indicator explains staleness
   * without a change list.
   */
  changeLog?: readonly StaleScoringChangeLogEntry[] | null;
}

function formatMultiplier(value: number | null | undefined): string {
  return value == null ? '—' : value.toFixed(2);
}

function formatChangedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * StaleScoringIndicator — small informational badge shown on a completed
 * matchup whose persisted score was computed under scoring settings that
 * have since changed (LS-9667).
 *
 * Deliberately styled as neutral provenance, not an error state — a stale
 * score is not a broken score (see docs/design/brand.md). One shared
 * component for web and mobile (AC1); tapping/clicking reveals what changed
 * and when, sourced from the league's scoring change log (AC2).
 */
export function StaleScoringIndicator({
  scoringIsStale,
  changeLog,
}: StaleScoringIndicatorProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false);

  if (!scoringIsStale) return null;

  const entries = changeLog ?? [];
  const toggleOpen = () => setOpen((v) => !v);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="top"
      arrow
      trigger={
        <XStack
          testID="stale-scoring-indicator"
          alignItems="center"
          justifyContent="center"
          width={22}
          height={22}
          borderRadius={11}
          backgroundColor="$accentMuted"
          borderWidth={1}
          borderColor="$brandNavyLight"
          cursor="pointer"
          role="button"
          tabIndex={0}
          aria-label="Scoring settings changed since this matchup was scored"
          onPress={toggleOpen}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleOpen();
            }
          }}
          pressStyle={{ opacity: 0.8 }}
          hoverStyle={{ borderColor: '$brandNavy' }}
        >
          <History size={13} color="var(--brandGoldLight)" />
        </XStack>
      }
    >
      <YStack gap="$2" maxWidth={280}>
        <Text fontSize="$3" fontWeight="700" color="$color12">
          Scoring settings changed
        </Text>
        <Text fontSize="$2" color="$textMuted">
          This score was computed under scoring rules that have since changed.
          The displayed total reflects the rules in effect at the time.
        </Text>
        {entries.length > 0 && (
          <YStack gap="$1.5" marginTop="$1">
            {entries.map((entry) => (
              <XStack
                key={`${entry.statDisplayName}-${entry.changedAt}`}
                justifyContent="space-between"
                alignItems="center"
                gap="$2"
              >
                <YStack flex={1} minWidth={0}>
                  <Text
                    fontSize="$1"
                    fontWeight="600"
                    color="$color12"
                    numberOfLines={1}
                  >
                    {entry.statDisplayName}
                  </Text>
                  <Text fontSize="$1" color="$textMuted">
                    {formatChangedAt(entry.changedAt)}
                    {entry.changedByUsername
                      ? ` · ${entry.changedByUsername}`
                      : ''}
                  </Text>
                </YStack>
                <Text
                  fontSize="$1"
                  fontWeight="600"
                  color="$brandGoldLight"
                  fontVariant={['tabular-nums']}
                >
                  {formatMultiplier(entry.previousMultiplier)} →{' '}
                  {formatMultiplier(entry.newMultiplier)}
                </Text>
              </XStack>
            ))}
          </YStack>
        )}
      </YStack>
    </Popover>
  );
}
