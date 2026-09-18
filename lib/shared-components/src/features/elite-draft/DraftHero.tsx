import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { ArrowLeft } from '@tamagui/lucide-icons';
import {
  BRAND_NAVY,
  BRAND_SEAM_RED,
  BRAND_SEAM_RED_LIGHT,
  withAlpha,
} from '../../utils/colors';

/**
 * Marks an element inside the draft board as a real navigation away from it.
 * The web wrapper's live-draft leave guard (apps/web EliteDraftBoard.tsx)
 * lets every other click inside the board through as a draft interaction.
 */
export const LEAVES_DRAFT_ATTRIBUTE = 'data-leaves-draft';

const DRAFT_ORDER_LABELS: Record<string, string> = {
  snake: 'Snake',
  linear: 'Linear',
};

/** "Snake" / "Linear", or "Auction" for auction drafts; undefined if unknown. */
function draftFormatLabel(
  selectionMethod: string | null | undefined,
  draftOrder: string | null | undefined,
): string | undefined {
  if (selectionMethod === 'auction') return 'Auction';
  return draftOrder ? DRAFT_ORDER_LABELS[draftOrder] : undefined;
}

export interface DraftHeroProps {
  leagueName?: string | null;
  /**
   * The league page to go back to, or null to omit the back link (mock
   * drafts: DraftTopBand's Exit Draft already covers leaving those).
   */
  backHref: string | null;
  /** Called for a plain left-click on the back link, with `backHref`. */
  onNavigate: (path: string) => void;
  draftPaused: boolean;
  round: number;
  /** Overall pick number — the "Pick 42" of "Pick 42 of 276". */
  overallPick: number;
  /** Total picks in the draft; null omits the "of N" half. */
  totalPicks: number | null;
  teamCount: number;
  /** `LeagueDraft.selectionMethod` — 'standard' | 'auction' | 'random'. */
  selectionMethod?: string | null;
  /** `LeagueDraft.draftOrder` — 'snake' | 'linear'. */
  draftOrder?: string | null;
  /** Tablet frame ($md and below): adaptive.css's tightened hero. */
  compact: boolean;
}

function Badge({
  children,
  tone = 'neutral',
  testID,
}: {
  children: React.ReactNode;
  tone?: 'live' | 'round' | 'neutral';
  testID?: string;
}): React.JSX.Element {
  const borderColor =
    tone === 'live'
      ? withAlpha(BRAND_SEAM_RED, 0.45)
      : tone === 'round'
        ? '$outlineStrong'
        : '$outlineDefault';
  const backgroundColor =
    tone === 'live' ? withAlpha(BRAND_SEAM_RED, 0.1) : '$surfaceSubtle';
  const color =
    tone === 'live'
      ? BRAND_SEAM_RED_LIGHT
      : tone === 'round'
        ? '$color'
        : '$textMuted';
  return (
    <XStack
      testID={testID}
      alignItems="center"
      gap={6}
      paddingVertical={5}
      paddingHorizontal={10}
      borderRadius={9999}
      borderWidth={1}
      borderColor={borderColor}
      backgroundColor={backgroundColor}
    >
      {tone === 'live' && (
        <YStack
          width={7}
          height={7}
          borderRadius={4}
          backgroundColor={BRAND_SEAM_RED_LIGHT}
        />
      )}
      <Text
        fontFamily="$heading"
        fontWeight="700"
        fontSize={11}
        letterSpacing={1.5}
        textTransform="uppercase"
        color={color}
      >
        {children}
      </Text>
    </XStack>
  );
}

/**
 * Draft room hero (LS-10204) — DraftRoom.html's `.hero` (styles/board.css,
 * tightened below 980 by styles/adaptive.css): back link, "League · Draft"
 * and the live / pick / format badges.
 *
 * Web-only, like the rest of the wide branch it renders in. The design's
 * `.nav` row above the hero (burger, brand, breadcrumbs, avatar) is the app
 * shell itself, so the draft room does not draw one: apps/web's header already
 * renders the drawer burger and league chip below $gtMd and the full nav with
 * the league switcher above it. The back link is the one piece the shell does
 * not carry; it is marked with `LEAVES_DRAFT_ATTRIBUTE` so the live-draft leave
 * guard still asks before it navigates.
 */
export function DraftHero({
  leagueName,
  backHref,
  onNavigate,
  draftPaused,
  round,
  overallPick,
  totalPicks,
  teamCount,
  selectionMethod,
  draftOrder,
  compact,
}: DraftHeroProps): React.JSX.Element {
  const handleBackClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    // Modified / middle clicks open a new tab — leave those to the browser.
    if (
      backHref == null ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    onNavigate(backHref);
  };

  const pickLabel =
    totalPicks != null && totalPicks > 0
      ? `Round ${round} · Pick ${overallPick} of ${totalPicks}`
      : `Round ${round} · Pick ${overallPick}`;
  const formatLabel = draftFormatLabel(selectionMethod, draftOrder);
  const teamsLabel = formatLabel
    ? `${teamCount} teams · ${formatLabel}`
    : `${teamCount} teams`;

  return (
    <YStack
      testID="draft-hero"
      data-compact={String(compact)}
      paddingTop={compact ? 22 : 28}
      paddingHorizontal={compact ? 18 : 32}
      paddingBottom={compact ? 16 : 20}
      borderBottomWidth={1}
      borderBottomColor="$outlineDefault"
      style={{
        gridArea: 'hero',
        backgroundImage: `linear-gradient(180deg, ${withAlpha(BRAND_NAVY, 0.18)} 0%, transparent 100%)`,
      }}
    >
      {backHref != null && (
        <a
          href={backHref}
          onClick={handleBackClick}
          data-testid="draft-hero-back"
          {...{ [LEAVES_DRAFT_ATTRIBUTE]: '' }}
          style={{
            alignSelf: 'flex-start',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 12,
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={14} color="$textMuted" />
          <Text
            fontFamily="$heading"
            fontWeight="700"
            fontSize={12}
            letterSpacing={1.2}
            textTransform="uppercase"
            color="$textMuted"
            hoverStyle={{ color: '$color' }}
          >
            Back to league
          </Text>
        </a>
      )}
      <XStack alignItems="flex-end" gap={18} flexWrap="wrap">
        <Text
          tag="h1"
          fontFamily="$heading"
          fontWeight="800"
          fontSize={compact ? 30 : 40}
          lineHeight={compact ? 31 : 41}
          color="$color"
          margin={0}
        >
          {leagueName ? `${leagueName} · Draft` : 'Draft'}
        </Text>
        <XStack gap={8} flexWrap="wrap" marginTop={6}>
          <Badge tone="live" testID="draft-hero-live">
            {draftPaused ? 'Draft Paused' : 'Draft Live'}
          </Badge>
          <Badge tone="round" testID="draft-hero-pick">
            {pickLabel}
          </Badge>
          {teamCount > 0 && (
            <Badge testID="draft-hero-teams">{teamsLabel}</Badge>
          )}
        </XStack>
      </XStack>
    </YStack>
  );
}
