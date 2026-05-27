export type NotificationTypeCategory =
  | 'matchup'
  | 'result'
  | 'trade'
  | 'draft'
  | 'system';

export function categorize(
  notificationType: string | null | undefined,
): NotificationTypeCategory {
  const t = (notificationType ?? '').toLowerCase();
  if (t.includes('draft')) return 'draft';
  if (t.includes('trade')) return 'trade';
  if (t.includes('ended') || t.includes('result') || t.includes('lost'))
    return 'result';
  if (t.includes('matchup') || t.includes('reminder') || t.includes('close'))
    return 'matchup';
  return 'system';
}
