/**
 * Stats-grid pagination block (LS-8566).
 *
 * Extracted verbatim from the `renderPagination` helpers the batting and
 * pitching grids each inlined (PlayerStatsDataGrid / PitchingStatsDataGrid):
 * page info + total count, page-size selector, Prev/Next, and the quick-jump
 * page-number row driven by {@link getPageRange}. Shared by all three sport
 * grids so the pager can never drift per sport again.
 */
import React from 'react';
import { Button, Text, XStack, YStack } from 'tamagui';
import { getPageRange } from '../paginationUtils';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  TEXT_HIGH_CONTRAST,
  TEXT_MUTED,
} from '../../../utils/colors';

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export interface StatsGridPaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  pageSizeOptions?: readonly number[];
  loading?: boolean;
  /** Defaults derive from currentPage/totalPages; pass to override (cursor-fed grids). */
  hasPreviousPage?: boolean;
  hasNextPage?: boolean;
  prevLabel?: string;
  nextLabel?: string;
  onPrev: () => void;
  onNext: () => void;
  onGoToPage: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function StatsGridPagination({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  loading = false,
  hasPreviousPage,
  hasNextPage,
  prevLabel = '← Previous',
  nextLabel = 'Next →',
  onPrev,
  onNext,
  onGoToPage,
  onPageSizeChange,
}: StatsGridPaginationProps) {
  const pageRange = getPageRange(currentPage, totalPages);
  const canPrev = hasPreviousPage ?? currentPage > 1;
  const canNext = hasNextPage ?? currentPage < totalPages;

  return (
    <YStack gap="$2">
      {/* Main pagination controls */}
      <XStack
        justifyContent="space-between"
        alignItems="center"
        padding="$3"
        flexWrap="wrap"
        gap="$2"
        style={{
          background: `rgba(22,34,58,0.65)`,
          border: `1px solid rgba(44,74,124,0.35)`,
          borderRadius: 12,
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        {/* Page info */}
        <XStack gap="$2" alignItems="center">
          <Text
            fontSize="$3"
            fontWeight="600"
            style={{ color: TEXT_HIGH_CONTRAST }}
          >
            Page {currentPage} of {totalPages}
          </Text>
          <Text fontSize="$2" style={{ color: TEXT_MUTED }}>
            ({totalCount.toLocaleString()} total)
          </Text>
        </XStack>

        {/* Page size selector */}
        <XStack gap="$2" alignItems="center">
          <Text fontSize="$2" style={{ color: TEXT_MUTED }}>
            Show:
          </Text>
          {pageSizeOptions.map((size) => (
            <Button
              key={size}
              size="$2"
              onPress={() => onPageSizeChange(size)}
              disabled={loading}
              style={{
                background:
                  pageSize === size
                    ? `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_LIGHT} 100%)`
                    : 'rgba(10,15,26,0.5)',
                border:
                  pageSize === size
                    ? `1px solid rgba(196,165,90,0.4)`
                    : `1px solid rgba(44,74,124,0.35)`,
                borderRadius: 8,
                color: pageSize === size ? BRAND_GOLD_LIGHT : TEXT_MUTED,
                minWidth: 36,
              }}
            >
              {size}
            </Button>
          ))}
        </XStack>

        {/* Prev/Next navigation */}
        <XStack gap="$2">
          <Button
            size="$3"
            disabled={!canPrev || loading}
            onPress={onPrev}
            style={{
              background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_LIGHT} 100%)`,
              border: `1px solid rgba(196,165,90,0.25)`,
              borderRadius: 10,
              color: BRAND_GOLD_LIGHT,
              opacity: !canPrev || loading ? 0.4 : 1,
            }}
          >
            {prevLabel}
          </Button>
          <Button
            size="$3"
            disabled={!canNext || loading}
            onPress={onNext}
            style={{
              background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_LIGHT} 100%)`,
              border: `1px solid rgba(196,165,90,0.25)`,
              borderRadius: 10,
              color: BRAND_GOLD_LIGHT,
              opacity: !canNext || loading ? 0.4 : 1,
            }}
          >
            {nextLabel}
          </Button>
        </XStack>
      </XStack>

      {/* Page number quick-jump buttons */}
      {totalPages > 1 && (
        <XStack
          justifyContent="center"
          alignItems="center"
          padding="$2"
          flexWrap="wrap"
          gap="$1"
          style={{
            background: `rgba(22,34,58,0.5)`,
            border: `1px solid rgba(44,74,124,0.25)`,
            borderRadius: 10,
          }}
        >
          {pageRange.map((page, index) => {
            if (page === -1) {
              return (
                <Text
                  key={`ellipsis-${index}`}
                  fontSize="$3"
                  paddingHorizontal="$2"
                  style={{ color: TEXT_MUTED }}
                >
                  ...
                </Text>
              );
            }

            const isCurrentPage = page === currentPage;
            return (
              <Button
                key={page}
                size="$2"
                onPress={() => onGoToPage(page)}
                disabled={loading || isCurrentPage}
                minWidth={32}
                style={{
                  background: isCurrentPage
                    ? `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_LIGHT} 100%)`
                    : 'transparent',
                  border: isCurrentPage
                    ? `1px solid rgba(196,165,90,0.45)`
                    : `1px solid transparent`,
                  borderRadius: 8,
                  color: isCurrentPage ? BRAND_GOLD_LIGHT : TEXT_MUTED,
                  fontWeight: isCurrentPage ? '700' : '400',
                }}
              >
                {page}
              </Button>
            );
          })}
        </XStack>
      )}
    </YStack>
  );
}

export default StatsGridPagination;
