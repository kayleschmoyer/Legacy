/**
 * Day-grouping helpers for the notifications feature.
 *
 * Restores the day separators ("Today", "Yesterday", or a formatted date) that
 * the original web `NotificationsPage` rendered before LS-7724 consolidated the
 * page onto the shared, mobile-first `NotificationsScreen` (LS-7801). The logic
 * is cross-platform — `Intl.DateTimeFormat` is available on web and on React
 * Native (Hermes) — so both web and mobile share the same grouping behaviour.
 */

/** Minimal shape needed to group a notification by the day it was sent. */
export interface DayGroupable {
  sentAt?: string | null;
}

export interface DayGroup<T extends DayGroupable> {
  /** Stable key for the group (date-derived, or `'undated'`). */
  key: string;
  /** Human-readable separator label, e.g. `"Today · Saturday, Jun 7"`. */
  label: string;
  items: T[];
}

const DAY_LABEL_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
});

/** Local-day identity key (year-month-date) for an ISO timestamp. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * "Today" / "Yesterday" / formatted-date separator label for an ISO timestamp,
 * relative to the current local day.
 */
export function daySeparatorLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const prefix = isSameDay(d, today)
    ? 'Today'
    : isSameDay(d, yesterday)
      ? 'Yesterday'
      : null;
  const formatted = DAY_LABEL_FMT.format(d);
  return prefix ? `${prefix} · ${formatted}` : formatted;
}

/**
 * Group notifications into day sections, preserving the server-supplied order
 * (newest first). Items without a `sentAt` collapse into a trailing "Earlier"
 * group so they never silently disappear.
 */
export function groupNotificationsByDay<T extends DayGroupable>(
  notifications: readonly T[],
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];

  for (const n of notifications) {
    if (!n.sentAt) {
      const last = groups[groups.length - 1];
      if (last && last.key === 'undated') {
        last.items.push(n);
      } else {
        groups.push({ key: 'undated', label: 'Earlier', items: [n] });
      }
      continue;
    }

    const key = dayKey(n.sentAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(n);
    } else {
      groups.push({ key, label: daySeparatorLabel(n.sentAt), items: [n] });
    }
  }

  return groups;
}
