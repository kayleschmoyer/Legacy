/**
 * Cross-platform list-reorder primitive (LS-10066).
 *
 * Both the web (`@dnd-kit/sortable`'s `arrayMove`) and native
 * (`useNativeListReorder`) drag mechanisms need to move one item to a new
 * index without mutating the source array. Sharing this function keeps the
 * two platform implementations' output identical for the same
 * (fromIndex, toIndex) pair, which the reorder-mutation payload depends on.
 */
export function moveItem<T>(
  items: readonly T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items.slice();
  }
  const result = items.slice();
  const [moved] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, moved);
  return result;
}
