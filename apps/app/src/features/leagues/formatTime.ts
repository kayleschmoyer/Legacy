function normalizeTimestamp(raw: string): string {
  // Replace SQL-style space separator with T so Date can parse it
  const s = raw.replace(' ', 'T');
  // Append Z only when there is no explicit timezone indicator
  return /[Zz]|[+-]\d{2}:\d{2}$/.test(s) ? s : s + 'Z';
}

export function formatTime(isoString: string): string {
  const date = new Date(normalizeTimestamp(isoString));
  if (isNaN(date.getTime())) {
    return '--:--';
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
