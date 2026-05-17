/**
 * Recursively freeze an object and all of its nested objects/arrays.
 *
 * Used to make baseline mock responses immutable so a test that mutates a
 * shared response in-place fails loudly instead of poisoning sibling tests
 * in the same worker.
 */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const key of Object.keys(value as object)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}
