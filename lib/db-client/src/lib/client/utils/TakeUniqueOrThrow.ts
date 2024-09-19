export function TakeUniqueOrThrow<T>(values: T[]): T {
  if (values.length !== 1)
    throw new Error('Found non unique or inexistent value');
  return values[0];
}
export function TakeUniqueOrNull<T>(values: T[]): T | null {
  if (values.length > 1) throw new Error('Found non unique value');
  return values[0] || null;
}
