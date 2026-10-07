import React from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import {
  FG3,
  FONT_BODY,
  GOLD_ACCENT_BUTTON_LABEL_STYLE,
  GOLD_ACCENT_BUTTON_STYLE,
} from './tokens';
import { Platform } from '../../../platform-components';
import { BRAND_GOLD_LIGHT } from '../../../utils/colors';
import { csp } from '../crossPlatformStyle';

export interface StatsPageActionsProps {
  onShare: () => void;
  /** When false, no export buttons render. */
  canExport?: boolean;
  /** One export button rendered per format (e.g. json/csv/xlsx). */
  exportFormats?: readonly string[];
  onExport?: (format: string) => void;
  /** Disables the export buttons while an export is being prepared. */
  exportBusy?: boolean;
  /** Row scope of the next export, shown under the buttons (LS-10731). */
  exportScopeLabel?: string | null;
}

/**
 * Share + Export gold-accent action buttons for the stats page header. Export is
 * a premium capability rendered only when `canExport` is set; one button per
 * format. Sport-neutral — the sport config wires the handlers.
 */
export function StatsPageActions({
  onShare,
  canExport = false,
  exportFormats = [],
  onExport,
  exportBusy = false,
  exportScopeLabel,
}: StatsPageActionsProps) {
  return (
    <YStack gap="$1" style={csp({ marginTop: Platform.OS === 'web' ? 8 : 0 })}>
      <XStack gap="$2">
        <Pressable
          onPress={onShare}
          accessibilityRole="button"
          accessibilityLabel="Share player statistics link"
          style={GOLD_ACCENT_BUTTON_STYLE}
        >
          {Platform.OS === 'web' && (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke={BRAND_GOLD_LIGHT}
              strokeWidth="2"
            >
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          )}
          <Text style={GOLD_ACCENT_BUTTON_LABEL_STYLE}>Share</Text>
        </Pressable>
        {/* Export is premium-gated (PST-010 / LS-7108): only rendered when the host
          grants the export capability. One button per format (PST-014 / LS-7112). */}
        {canExport &&
          exportFormats.map((fmt) => (
            <Pressable
              key={fmt}
              onPress={() => onExport?.(fmt)}
              disabled={exportBusy}
              accessibilityRole="button"
              accessibilityLabel={`Export player statistics as ${fmt.toUpperCase()}`}
              accessibilityState={{ disabled: exportBusy, busy: exportBusy }}
              style={[GOLD_ACCENT_BUTTON_STYLE, exportBusy && { opacity: 0.6 }]}
            >
              {Platform.OS === 'web' && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={BRAND_GOLD_LIGHT}
                  strokeWidth="2"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              )}
              <Text style={GOLD_ACCENT_BUTTON_LABEL_STYLE}>
                Export {fmt.toUpperCase()}
              </Text>
            </Pressable>
          ))}
      </XStack>
      {canExport && (exportBusy || exportScopeLabel) && (
        <Text
          testID="stats-export-scope"
          style={csp({ fontFamily: FONT_BODY, fontSize: 12, color: FG3 })}
        >
          {exportBusy ? 'Preparing export…' : (exportScopeLabel ?? '')}
        </Text>
      )}
    </YStack>
  );
}
