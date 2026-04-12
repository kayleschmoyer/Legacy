/** Convert a 12-hour value + AM/PM to 24-hour (0-23). Clamps hour to 1-12. */
export function to24Hour(hour12: number, ampm: 'AM' | 'PM'): number {
  if (!Number.isFinite(hour12)) return ampm === 'AM' ? 0 : 12;
  const clamped = Math.min(12, Math.max(1, Math.round(hour12)));
  return ampm === 'AM'
    ? clamped === 12
      ? 0
      : clamped
    : clamped === 12
      ? 12
      : clamped + 12;
}

/** Convert a 24-hour value (0-23) to 12-hour (1-12). */
export function to12Hour(hour24: number): number {
  if (!Number.isFinite(hour24)) return 12;
  return hour24 % 12 || 12;
}
