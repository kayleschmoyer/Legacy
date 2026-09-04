import React from 'react';
import { Text, YStack } from 'tamagui';

/**
 * Opening Day banner for the pre-draft lobby (LS-9858).
 *
 * The mock presents the pre-draft state as an event rather than a waiting
 * room: an "Opening Day" eyebrow, the scheduled start, a live-ticking
 * countdown, and a manager/round summary line. The backing value is
 * `drafts.scheduled_at`, already exposed as `getLeagueDraft.scheduledAt`.
 *
 * Two constraints shape this file:
 *
 *  1. The mock hardcodes "ET". Real users are not all in ET, so the start is
 *     rendered in the *viewer's* zone with the zone abbreviation appended —
 *     "8:00 PM" alone is ambiguous. Same `timeZoneName: 'short'` recipe
 *     MatchupDetailLayout already uses.
 *  2. The countdown ticks once a second. Keeping that state inside
 *     `DraftCountdown` (rather than in PreDraftLobby) means each tick
 *     re-renders one `<Text>`, not the whole lobby with its team list and
 *     trade panel.
 */

/** Milliseconds in a day — countdown day/hour split. */
const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_MINUTE = 60_000;
const MS_PER_SECOND = 1000;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * `2d 14:32:06` when a day or more remains, `14:32:06` below that — the
 * leading `0d` in the mock is an artifact of its frozen sample time, not a
 * format we want to render at 11pm the night before.
 *
 * Returns `null` at or past the start, which is the signal to stop ticking.
 * Exported pure for direct unit testing (no fake timers needed).
 */
export function formatCountdown(msRemaining: number): string | null {
  if (!Number.isFinite(msRemaining) || msRemaining <= 0) return null;
  const days = Math.floor(msRemaining / MS_PER_DAY);
  const hours = Math.floor((msRemaining % MS_PER_DAY) / MS_PER_HOUR);
  const minutes = Math.floor((msRemaining % MS_PER_HOUR) / MS_PER_MINUTE);
  const seconds = Math.floor((msRemaining % MS_PER_MINUTE) / MS_PER_SECOND);
  const clock = `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

/**
 * `Fri, Apr 24 · 8:00 PM PDT` — in the viewer's own timezone, never a
 * hardcoded ET. Returns `null` for an unparseable timestamp so the caller
 * falls back to the un-scheduled lobby rather than rendering "Invalid Date".
 */
export function formatOpeningDay(scheduledAt: string): string | null {
  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const time = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  return `${day} · ${time}`;
}

/** `12 managers locked in · 23 rounds`; the round clause is dropped when the league has no roster size on file. */
export function formatLobbySummary(
  managerCount: number,
  roundCount: number | null | undefined,
): string {
  const managers = `${managerCount} ${managerCount === 1 ? 'manager' : 'managers'} locked in`;
  if (roundCount == null || roundCount <= 0) return managers;
  return `${managers} · ${roundCount} ${roundCount === 1 ? 'round' : 'rounds'}`;
}

/**
 * Self-contained ticking clock. Owns its own interval and its own state so a
 * tick never re-renders the lobby around it.
 *
 * The remaining time is recomputed from `Date.now()` on every tick rather
 * than decremented, so a throttled background tab resyncs on return instead
 * of drifting. The interval is cleared the moment the target passes — the
 * clock stops at zero and does not keep firing.
 */
export function DraftCountdown({
  targetMs,
}: {
  targetMs: number;
}): React.JSX.Element {
  const [label, setLabel] = React.useState<string | null>(() =>
    formatCountdown(targetMs - Date.now()),
  );

  React.useEffect(() => {
    // Re-seed synchronously: a changed target must not show the previous
    // draft's remaining time for up to a second.
    const seed = formatCountdown(targetMs - Date.now());
    setLabel(seed);
    if (seed === null) return undefined;

    const id = setInterval(() => {
      const next = formatCountdown(targetMs - Date.now());
      setLabel(next);
      if (next === null) clearInterval(id);
    }, MS_PER_SECOND);

    return () => {
      clearInterval(id);
    };
  }, [targetMs]);

  return (
    <Text
      fontFamily="$heading"
      fontSize={32}
      fontWeight="800"
      letterSpacing={1.2}
      color="$brandGold"
      textAlign="center"
      $sm={{ fontSize: 26 }}
      aria-label={
        label === null ? 'Draft is starting now' : `${label} until the draft`
      }
    >
      {label ?? 'Starting now'}
    </Text>
  );
}

interface OpeningDayBannerProps {
  /** ISO timestamp from `getLeagueDraft.scheduledAt`. */
  scheduledAt: string;
  /** Teams seated in the league — the mock's "12 managers locked in". */
  managerCount: number;
  /** Draft rounds, i.e. the league's roster size. Omitted from the summary when unknown. */
  roundCount?: number | null;
}

/**
 * Renders `null` for a timestamp that does not parse, so a bad value degrades
 * to the existing lobby instead of a fabricated date (LS-9858 AC4).
 */
export function OpeningDayBanner({
  scheduledAt,
  managerCount,
  roundCount,
}: OpeningDayBannerProps): React.JSX.Element | null {
  const opensAt = formatOpeningDay(scheduledAt);
  if (opensAt === null) return null;

  const targetMs = new Date(scheduledAt).getTime();

  return (
    <YStack
      width="100%"
      maxWidth={420}
      alignItems="center"
      gap="$2"
      paddingVertical="$4"
      paddingHorizontal="$4"
      borderRadius="$4"
      borderWidth={1}
      backgroundColor="$accentMuted"
      borderColor="$brandGold"
    >
      <Text
        fontSize={11}
        fontWeight="700"
        letterSpacing={1.5}
        textTransform="uppercase"
        color="$brandGold"
      >
        Opening Day
      </Text>
      <Text
        fontFamily="$heading"
        fontSize={22}
        fontWeight="800"
        lineHeight={26}
        color="$color"
        textAlign="center"
        $sm={{ fontSize: 18, lineHeight: 22 }}
      >
        {`Your draft opens ${opensAt}`}
      </Text>
      <DraftCountdown targetMs={targetMs} />
      <Text color="$textMuted" fontSize={12} textAlign="center">
        {formatLobbySummary(managerCount, roundCount)}
      </Text>
    </YStack>
  );
}
