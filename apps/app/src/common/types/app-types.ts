// Mobile app type definitions to improve type safety
// These provide better types than the current incomplete GraphQL schema

// Event handler types for form events
export type FormEventHandler = (event: {
  preventDefault(): void;
  stopPropagation(): void;
}) => void;

// Normalizes numeric identifiers that may be delivered as strings or nulls
export function normalizeNumericIdentifier(
  value: number | string | null | undefined,
): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}
