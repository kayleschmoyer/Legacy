/**
 * Calculate a page range with ellipsis markers for pagination quick-jump buttons.
 * Returns page numbers (1-indexed) with -1 representing ellipsis placeholders.
 */
export function getPageRange(
  currentPageNumber: number,
  totalPages: number,
  maxButtons = 5,
): number[] {
  const range: number[] = [];

  if (totalPages <= maxButtons) {
    for (let i = 1; i <= totalPages; i++) {
      range.push(i);
    }
  } else {
    const start = Math.max(1, currentPageNumber - 2);
    const end = Math.min(totalPages, currentPageNumber + 2);

    for (let i = start; i <= end; i++) {
      range.push(i);
    }

    if (!range.includes(1)) {
      range.unshift(1);
      if (range[1] !== 2) {
        range.splice(1, 0, -1); // -1 represents ellipsis
      }
    }

    if (!range.includes(totalPages)) {
      if (range[range.length - 1] !== totalPages - 1) {
        range.push(-1); // -1 represents ellipsis
      }
      range.push(totalPages);
    }
  }

  return range;
}
