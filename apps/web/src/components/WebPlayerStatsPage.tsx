import React, { useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  PlayerStatsPage,
  type PlayerStatsViewMode,
} from '@legacy-sports/shared-components';
import type {
  PlayerStatsFilters,
  PlayerWithStats,
} from '@legacy-sports/shared-components';
import { BG_DARK, BLUE_ALT, TEXT_HIGH_CONTRAST } from '../constants/colors';

/**
 * Web App Player Statistics Page
 *
 * Integrates the PlayerStatsPage component with React Router for:
 * - URL query parameter state persistence
 * - Navigation integration
 * - Export and sharing functionality
 * - Deep linking support
 */
export function WebPlayerStatsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [liveMsg, setLiveMsg] = React.useState('');

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
    if (minHR) filters.minHomeRuns = parseInt(minHR, 10);
    if (maxHR) filters.maxHomeRuns = parseInt(maxHR, 10);
    if (minRBI) filters.minRBI = parseInt(minRBI, 10);
    if (maxRBI) filters.maxRBI = parseInt(maxRBI, 10);
    if (minAVG) filters.minBattingAvg = parseFloat(minAVG);
    if (maxAVG) filters.maxBattingAvg = parseFloat(maxAVG);

    // Apply pitching filters
    if (minERA) filters.minERA = parseFloat(minERA);
    if (maxERA) filters.maxERA = parseFloat(maxERA);
    if (minWins) filters.minWins = parseInt(minWins, 10);
    if (maxWins) filters.maxWins = parseInt(maxWins, 10);
    if (minSO) filters.minStrikeouts = parseInt(minSO, 10);
    if (maxSO) filters.maxStrikeouts = parseInt(maxSO, 10);

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

  // Handle player detail navigation
  const handlePlayerDetails = useCallback(
    (player: PlayerWithStats) => {
      // Navigate to player detail page (if it exists)
      navigate(`/players/${player.id}`);
    },
    [navigate],
  );

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

      console.log('Exported player statistics:', exportData);
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
        console.error('Error sharing:', error);
        // Fallback - try to copy to clipboard
        try {
          await navigator.clipboard.writeText(url);
          alert('Link copied to clipboard!');
          setLiveMsg('Link copied to clipboard.');
        } catch (clipboardError) {
          console.error('Clipboard error:', clipboardError);
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
      <div className="sr-only" aria-live="polite">
        {liveMsg}
      </div>
      <PlayerStatsPage
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
    </div>
  );
}

/**
 * Player Detail Page Placeholder
 *
 * This would be a separate page showing detailed stats for a specific player.
 * For now, it's a simple placeholder that could be expanded later.
 */
export function WebPlayerDetailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const playerId = searchParams.get('id');

  const handleBackToStats = useCallback(() => {
    navigate('/players/stats');
  }, [navigate]);

  return (
    <div style={{ padding: '2rem' }}>
      <button
        onClick={handleBackToStats}
        style={{
          marginBottom: '1rem',
          padding: '0.5rem 1rem',
          backgroundColor: BLUE_ALT,
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
      >
        ← Back to Player Statistics
      </button>

      <h1>Player Detail Page</h1>
      <p>Detailed statistics for player ID: {playerId}</p>
      <p>
        This page would show comprehensive player information, career history,
        and advanced analytics.
      </p>
    </div>
  );
}
