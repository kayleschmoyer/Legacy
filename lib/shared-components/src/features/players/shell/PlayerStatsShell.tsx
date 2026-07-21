import React, { useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { BG_PAGE, FG3, FONT_DISPLAY, OUTLINE_DEFAULT } from './tokens';
import { StatsShellStyles } from './statsShellStyles';
import { StatsPageHeader } from './StatsPageHeader';
import { StatsPageActions } from './StatsPageActions';
import { StatsViewTabs } from './StatsViewTabs';
import { StatsToolbarFrame } from './StatsToolbarFrame';
import { ColumnPickerPanel } from './ColumnPickerPanel';
import { AvailabilityFilter } from './AvailabilityFilter';
import {
  EmptyCard,
  ErrorCard,
  LoadingSkeleton,
  STATE_ANNOUNCEMENTS,
} from './StateCards';
import type { SportStatsController } from './sportStatsConfig';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  TEXT_PRIMARY,
  withAlpha,
} from '../../../utils/colors';
import { Platform } from '../../../platform-components';
import { csp } from '../crossPlatformStyle';

export interface PlayerStatsShellProps {
  controller: SportStatsController;
  showHeader?: boolean;
  showActions?: boolean;
}

/**
 * Sport-agnostic player-statistics shell. Renders the branded header, view-tab
 * strip, filter toolbar (with Apply/Advanced/Columns actions), premium column
 * picker, availability filter, advanced-filters panel, and the content region —
 * driven entirely by a {@link SportStatsController}. Both the MLB and NFL stats
 * browsers render through this component; all sport-specific state, controls,
 * and data live in each sport's controller hook.
 */
export function PlayerStatsShell({
  controller: c,
  showHeader = true,
  showActions = true,
}: PlayerStatsShellProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);

  return (
    <YStack flex={1} style={csp({ backgroundColor: BG_PAGE })}>
      <StatsShellStyles />

      {showHeader && (
        <StatsPageHeader
          eyebrow={c.header.eyebrow}
          title={c.header.title}
          description={c.header.description}
          urlPreview={c.urlPreview}
          showActions={showActions}
          actions={
            <StatsPageActions
              onShare={c.onShare}
              canExport={c.canExport}
              exportFormats={c.exportFormats}
              onExport={c.onExport}
            />
          }
        />
      )}

      <YStack
        flex={1}
        style={csp({
          maxWidth: 1280,
          width: '100%',
          padding: '24px 24px 96px',
          margin: '0 auto',
          gap: 24,
          display: 'flex',
          flexDirection: 'column',
        })}
      >
        <StatsViewTabs
          tabs={c.tabs}
          active={c.activeTab}
          onSelect={c.onTabChange}
          ariaLabel={c.tablistAriaLabel}
        />

        <StatsToolbarFrame webGridClassName={c.toolbarGridClassName}>
          {c.renderToolbarControls()}

          {/* Apply + Advanced + Columns actions — one grid cell so the toolbar's
              column template stays intact (the picker panel renders below). */}
          <XStack gap={8} alignItems="center" flexWrap="wrap">
            {c.onApply && (
              <Pressable
                testID="apply-filters-button"
                onPress={c.onApply}
                disabled={!c.hasPendingChanges}
                accessibilityRole="button"
                accessibilityLabel="Apply filters"
                accessibilityState={{ disabled: !c.hasPendingChanges }}
                style={csp({
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: c.hasPendingChanges
                    ? withAlpha(BRAND_GOLD, 0.5)
                    : OUTLINE_DEFAULT,
                  backgroundColor: c.hasPendingChanges
                    ? withAlpha(BRAND_GOLD, 0.12)
                    : 'transparent',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  minHeight: 44,
                  opacity: c.hasPendingChanges ? 1 : 0.55,
                })}
              >
                <Text
                  style={csp({
                    fontFamily: FONT_DISPLAY,
                    fontWeight: '700',
                    fontSize: 12,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: c.hasPendingChanges ? BRAND_GOLD_LIGHT : FG3,
                    whiteSpace: 'nowrap',
                  })}
                >
                  Apply
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={() => setAdvancedOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: advancedOpen }}
              style={csp({
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 12,
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: advancedOpen ? BRAND_NAVY_LIGHT : OUTLINE_DEFAULT,
                backgroundColor: advancedOpen
                  ? withAlpha(BRAND_NAVY, 0.35)
                  : 'transparent',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                minHeight: 44,
              })}
            >
              {Platform.OS === 'web' && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={advancedOpen ? TEXT_PRIMARY : FG3}
                  strokeWidth="2"
                >
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
              )}
              <Text
                style={csp({
                  fontFamily: FONT_DISPLAY,
                  fontWeight: '700',
                  fontSize: 12,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: advancedOpen ? TEXT_PRIMARY : FG3,
                  whiteSpace: 'nowrap',
                })}
              >
                Advanced
              </Text>
              <Text style={csp({ fontSize: 10, color: FG3 })}>
                {advancedOpen ? '▴' : '▾'}
              </Text>
            </Pressable>

            {c.canCustomizeColumns && (
              <Pressable
                onPress={() => setColumnsOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel="Toggle column visibility"
                accessibilityState={{ expanded: columnsOpen }}
                testID="column-picker-toggle"
                style={csp({
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: columnsOpen
                    ? BRAND_NAVY_LIGHT
                    : c.isColumnCustomized
                      ? withAlpha(BRAND_GOLD, 0.5)
                      : OUTLINE_DEFAULT,
                  backgroundColor: columnsOpen
                    ? withAlpha(BRAND_NAVY, 0.35)
                    : c.isColumnCustomized
                      ? withAlpha(BRAND_GOLD, 0.08)
                      : 'transparent',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 44,
                })}
              >
                {Platform.OS === 'web' && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={columnsOpen ? TEXT_PRIMARY : FG3}
                    strokeWidth="2"
                  >
                    <line x1="3" y1="3" x2="3" y2="21" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                    <line x1="15" y1="3" x2="15" y2="21" />
                    <line x1="21" y1="3" x2="21" y2="21" />
                  </svg>
                )}
                <Text
                  style={csp({
                    fontFamily: FONT_DISPLAY,
                    fontWeight: '700',
                    fontSize: 12,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: columnsOpen ? TEXT_PRIMARY : FG3,
                    whiteSpace: 'nowrap',
                  })}
                >
                  Columns
                </Text>
                <Text style={csp({ fontSize: 10, color: FG3 })}>
                  {columnsOpen ? '▴' : '▾'}
                </Text>
              </Pressable>
            )}
          </XStack>
        </StatsToolbarFrame>

        {c.canCustomizeColumns && columnsOpen && (
          <ColumnPickerPanel
            columns={c.toggleableColumns}
            visibleKeys={c.effectiveVisibleKeys}
            customized={c.isColumnCustomized}
            onToggle={c.onToggleColumn}
            onReset={c.onResetColumns}
          />
        )}

        {c.showAvailability && (
          <AvailabilityFilter
            value={c.availabilityValue}
            onChange={c.onAvailabilityChange}
          />
        )}

        {advancedOpen && c.renderAdvancedPanel()}

        {Platform.OS === 'web' && (
          <div
            role="status"
            aria-live="polite"
            style={csp({
              position: 'absolute',
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: 'hidden',
              clip: 'rect(0,0,0,0)',
              whiteSpace: 'nowrap',
              border: 0,
            })}
          >
            {c.shellState ? STATE_ANNOUNCEMENTS[c.shellState] : ''}
          </div>
        )}

        {c.shellState === 'loading' ? (
          <LoadingSkeleton columnCount={c.loadingColumnCount} />
        ) : c.shellState === 'error' ? (
          <ErrorCard onRetry={c.onRetry} />
        ) : c.shellState === 'empty' ? (
          <EmptyCard onClear={c.onClearFilters} />
        ) : (
          c.renderContent()
        )}
      </YStack>
    </YStack>
  );
}
