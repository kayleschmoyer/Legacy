import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  type PlayerStatsViewMode,
  PlayerStatsPage as SharedPlayerStatsPage,
} from '@legacy-sports/shared-components';
import type {
  PlayerStatsFilters,
  PlayerWithStats,
} from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';
import { PageMeta } from '../../components/PageMeta';
import {
  BG_DARK,
  BRAND_NAVY_LIGHT,
  TEXT_HIGH_CONTRAST,
  WHITE,
} from '../../constants/colors';
import { PlayerDetailModal } from '../../components/PlayerDetailModal';

// GraphQL Int is a 32-bit signed integer — clamp URL param values to prevent query errors
const MAX_GRAPHQL_INT = 2147483647;

/**
 * Web App Player Statistics Page
 *
 * Integrates the PlayerStatsPage component with React Router for:
 * - URL query parameter state persistence
 * - Navigation integration
 * - Export and sharing functionality
 * - Deep linking support
 */
export function PlayerStatsPage() {
  const [searchParams] = useSearchParams();
  const [liveMsg, setLiveMsg] = React.useState('');

  // Player detail modal state
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<{
    id: number;
    name: string;
  } | null>(null);

  // Parse URL parameters for initial state
  const initialState = useMemo(() => {
    const viewMode =
      (searchParams.get('view') as PlayerStatsViewMode) || 'combined';
    const pageSize = parseInt(searchParams.get('pageSize') || '25', 10);
    const search = searchParams.get('search') || '';

    // Parse filters from URL
    const filters: Partial<PlayerStatsFilters> = {};

    // Career batting filters
    const minHR = searchParams.get('minHomeRuns');
    const maxHR = searchParams.get('maxHomeRuns');
    const minRBI = searchParams.get('minRBI');
    const maxRBI = searchParams.get('maxRBI');
    const minAVG = searchParams.get('minBattingAvg');
    const maxAVG = searchParams.get('maxBattingAvg');

    // Career pitching filters
    const minERA = searchParams.get('minERA');
    const maxERA = searchParams.get('maxERA');
    const minWins = searchParams.get('minWins');
    const maxWins = searchParams.get('maxWins');
    const minSO = searchParams.get('minStrikeouts');
    const maxSO = searchParams.get('maxStrikeouts');

    // Player info filters
    const position = searchParams.get('position');
    const team = searchParams.get('team');
    const playerType = searchParams.get(
      'playerType',
    ) as PlayerStatsFilters['playerType'];
    const searchTerm = searchParams.get('searchTerm');

    // Apply batting filters
    if (minHR)
      filters.minHomeRuns = Math.min(parseInt(minHR, 10), MAX_GRAPHQL_INT);
    if (maxHR)
      filters.maxHomeRuns = Math.min(parseInt(maxHR, 10), MAX_GRAPHQL_INT);
    if (minRBI)
      filters.minRBI = Math.min(parseInt(minRBI, 10), MAX_GRAPHQL_INT);
    if (maxRBI)
      filters.maxRBI = Math.min(parseInt(maxRBI, 10), MAX_GRAPHQL_INT);
    if (minAVG) filters.minBattingAvg = parseFloat(minAVG);
    if (maxAVG) filters.maxBattingAvg = parseFloat(maxAVG);

    // Apply pitching filters
    if (minERA) filters.minERA = parseFloat(minERA);
    if (maxERA) filters.maxERA = parseFloat(maxERA);
    if (minWins)
      filters.minWins = Math.min(parseInt(minWins, 10), MAX_GRAPHQL_INT);
    if (maxWins)
      filters.maxWins = Math.min(parseInt(maxWins, 10), MAX_GRAPHQL_INT);
    if (minSO)
      filters.minStrikeouts = Math.min(parseInt(minSO, 10), MAX_GRAPHQL_INT);
    if (maxSO)
      filters.maxStrikeouts = Math.min(parseInt(maxSO, 10), MAX_GRAPHQL_INT);

    // Apply player info filters
    if (position) filters.position = position;
    if (team) filters.team = team;
    if (playerType) filters.playerType = playerType;
    if (searchTerm) filters.searchTerm = searchTerm;

    return {
      viewMode,
      pageSize,
      search,
      filters,
    };
  }, [searchParams]);

  // Handle player detail — open modal instead of navigating
  const handlePlayerDetails = useCallback((player: PlayerWithStats) => {
    setSelectedPlayer({
      id: typeof player.id === 'string' ? parseInt(player.id, 10) : player.id,
      name: player.name,
    });
    setDetailModalOpen(true);
  }, []);

  // Handle export functionality
  const handleExport = useCallback(
    (filters: PlayerStatsFilters, viewMode: PlayerStatsViewMode) => {
      // Create export parameters
      const exportData = {
        viewMode,
        filters,
        exportedAt: new Date().toISOString(),
        totalFilters: Object.keys(filters as Record<string, unknown>).length,
      };

      // Create downloadable file
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);

      // Create download link
      const link = document.createElement('a');
      link.href = url;
      link.download = `player-stats-${viewMode}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      LOGGER.info('Exported player statistics:', exportData);
      setLiveMsg('Player statistics exported. Download started.');
    },
    [],
  );

  // Handle share functionality
  const handleShare = useCallback((url: string) => {
    void (async () => {
      try {
        if (navigator.share) {
          // Use native Web Share API if available
          await navigator.share({
            title: 'Player Statistics - Legacy Sports',
            text: 'Check out these player statistics from Legacy Sports',
            url: url,
          });
        } else {
          // Fallback to clipboard
          await navigator.clipboard.writeText(url);

          // Show user feedback (you could replace this with a toast notification)
          const originalTitle = document.title;
          document.title = '📋 Link copied to clipboard!';
          setTimeout(() => {
            document.title = originalTitle;
          }, 2000);
          setLiveMsg('Link copied to clipboard.');
        }
      } catch (error) {
        LOGGER.error('Error sharing:', String(error));
        // Fallback - try to copy to clipboard
        try {
          await navigator.clipboard.writeText(url);
          alert('Link copied to clipboard!');
          setLiveMsg('Link copied to clipboard.');
        } catch (clipboardError) {
          LOGGER.error('Clipboard error:', String(clipboardError));
          // Ultimate fallback - show the URL
          prompt('Copy this link to share:', url);
          setLiveMsg('Showing a prompt with a sharable link.');
        }
      }
    })();
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: `var(--background, ${BG_DARK})`,
        color: `var(--color, ${TEXT_HIGH_CONTRAST})`,
        padding: 0, // Remove default padding as PlayerStatsPage handles its own
      }}
    >
      <PageMeta
        title="Player Statistics"
        description="Browse career and season statistics for every MLB player available in your Legacy Sports fantasy league."
      />
      <div className="sr-only" aria-live="polite">
        {liveMsg}
      </div>
      <SharedPlayerStatsPage
        title="MLB Player Statistics"
        initialViewMode={initialState.viewMode}
        initialFilters={initialState.filters}
        initialPageSize={initialState.pageSize}
        showHeader={true}
        showActions={true}
        onPlayerDetails={handlePlayerDetails}
        onExport={handleExport}
        onShare={handleShare}
      />

      {/* Player detail modal */}
      <PlayerDetailModal
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        playerId={selectedPlayer?.id ?? null}
        playerName={selectedPlayer?.name ?? ''}
      />
    </div>
  );
}

/**
 * Player Detail Page
 *
 * Renders a full-page view for `/players/:id` with the player detail modal
 * auto-opened, and a back button to return to the stats list.
 */
export function PlayerDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const playerId = id ? parseInt(id, 10) : null;

  const handleBackToStats = useCallback(() => {
    navigate('/players/stats');
  }, [navigate]);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: `var(--background, ${BG_DARK})`,
        color: `var(--color, ${TEXT_HIGH_CONTRAST})`,
        padding: '2rem',
      }}
    >
      <PageMeta
        title="Player Profile"
        description="View detailed career statistics and performance history for this MLB player on Legacy Sports."
      />
      <button
        onClick={handleBackToStats}
        style={{
          marginBottom: '1rem',
          padding: '0.5rem 1rem',
          backgroundColor: BRAND_NAVY_LIGHT,
          color: WHITE,
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        ← Back to Player Statistics
      </button>

      <PlayerDetailModal
        open={true}
        onOpenChange={(open) => {
          if (!open) navigate('/players/stats');
        }}
        playerId={playerId}
        playerName={`Player #${playerId ?? '?'}`}
      />
    </div>
  );
}
