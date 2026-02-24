import React from 'react';
import { useParams } from 'react-router-dom';

interface BaseballPlayer {
  id: number;
  name: string;
  position: string;
  team: string;
  adp: number;
  projected: number;
  avg: number;
  hr: number;
  rbi: number;
  runs: number;
  sb: number;
  trend: 'up' | 'down' | 'stable';
  news: string;
  injury: 'healthy' | 'questionable' | 'doubtful' | 'out';
}

// Elite Baseball Draft Data - Production Grade
const mockBaseballPlayers: BaseballPlayer[] = [
  {
    id: 1,
    name: 'Ronald Acuña Jr.',
    position: 'OF',
    team: 'ATL',
    adp: 1.2,
    projected: 28.4,
    avg: 0.337,
    hr: 41,
    rbi: 106,
    runs: 149,
    sb: 73,
    trend: 'up',
    news: 'Elite 40/70 season, unanimous #1 pick',
    injury: 'healthy',
  },
  {
    id: 2,
    name: 'Mookie Betts',
    position: 'OF',
    team: 'LAD',
    adp: 2.1,
    projected: 26.8,
    avg: 0.307,
    hr: 39,
    rbi: 107,
    runs: 122,
    sb: 16,
    trend: 'stable',
    news: 'Consistent elite production, injury concerns minimal',
    injury: 'healthy',
  },
  {
    id: 3,
    name: 'Jose Altuve',
    position: '2B',
    team: 'HOU',
    adp: 3.4,
    projected: 25.9,
    avg: 0.31,
    hr: 17,
    rbi: 69,
    runs: 95,
    sb: 18,
    trend: 'up',
    news: 'Bounce-back season, healthy and motivated',
    injury: 'healthy',
  },
  {
    id: 4,
    name: 'Yordan Alvarez',
    position: '1B',
    team: 'HOU',
    adp: 4.2,
    projected: 25.2,
    avg: 0.293,
    hr: 31,
    rbi: 97,
    runs: 95,
    sb: 0,
    trend: 'stable',
    news: 'Power machine when healthy, DH eligibility',
    injury: 'healthy',
  },
  {
    id: 5,
    name: 'Freddie Freeman',
    position: '1B',
    team: 'LAD',
    adp: 5.1,
    projected: 24.8,
    avg: 0.331,
    hr: 29,
    rbi: 102,
    runs: 121,
    sb: 13,
    trend: 'up',
    news: 'Career year at age 33, MVP candidate',
    injury: 'healthy',
  },
  {
    id: 6,
    name: 'Juan Soto',
    position: 'OF',
    team: 'SD',
    adp: 6.3,
    projected: 24.1,
    avg: 0.275,
    hr: 35,
    rbi: 109,
    runs: 132,
    sb: 3,
    trend: 'up',
    news: 'Plate discipline elite, power surge continues',
    injury: 'healthy',
  },
  {
    id: 7,
    name: 'Trea Turner',
    position: 'SS',
    team: 'PHI',
    adp: 7.2,
    projected: 23.4,
    avg: 0.266,
    hr: 26,
    rbi: 62,
    runs: 103,
    sb: 30,
    trend: 'stable',
    news: 'Speed/power combo in new home',
    injury: 'healthy',
  },
  {
    id: 8,
    name: 'Corey Seager',
    position: 'SS',
    team: 'TEX',
    adp: 8.1,
    projected: 23.1,
    avg: 0.327,
    hr: 33,
    rbi: 96,
    runs: 105,
    sb: 2,
    trend: 'up',
    news: 'World Series MVP, elite contact hitter',
    injury: 'healthy',
  },
  {
    id: 9,
    name: 'Austin Riley',
    position: '3B',
    team: 'ATL',
    adp: 9.3,
    projected: 22.6,
    avg: 0.267,
    hr: 37,
    rbi: 97,
    runs: 85,
    sb: 1,
    trend: 'stable',
    news: 'Power surge continues, Braves lineup anchor',
    injury: 'healthy',
  },
  {
    id: 10,
    name: 'Mike Trout',
    position: 'OF',
    team: 'LAA',
    adp: 10.1,
    projected: 22.8,
    avg: 0.263,
    hr: 18,
    rbi: 44,
    runs: 44,
    sb: 1,
    trend: 'down',
    news: 'Injury concerns but elite when healthy',
    injury: 'questionable',
  },
  {
    id: 11,
    name: 'Vladimir Guerrero Jr.',
    position: '1B',
    team: 'TOR',
    adp: 11.2,
    projected: 22.5,
    avg: 0.264,
    hr: 26,
    rbi: 94,
    runs: 81,
    sb: 2,
    trend: 'up',
    news: 'Bounce-back candidate, elite upside',
    injury: 'healthy',
  },
  {
    id: 12,
    name: 'Spencer Strider',
    position: 'P',
    team: 'ATL',
    adp: 12.4,
    projected: 21.2,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    trend: 'down',
    news: 'Ace potential but injury recovery',
    injury: 'doubtful',
  },
  {
    id: 13,
    name: 'Gerrit Cole',
    position: 'P',
    team: 'NYY',
    adp: 13.1,
    projected: 21.8,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    trend: 'stable',
    news: 'Elite strikeout upside, Yankees ace',
    injury: 'healthy',
  },
  {
    id: 14,
    name: 'Max Scherzer',
    position: 'P',
    team: 'TEX',
    adp: 14.3,
    projected: 20.4,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    trend: 'down',
    news: 'Age concerns but championship experience',
    injury: 'questionable',
  },
  {
    id: 15,
    name: 'Kyle Tucker',
    position: 'OF',
    team: 'HOU',
    adp: 15.2,
    projected: 21.6,
    avg: 0.284,
    hr: 29,
    rbi: 112,
    runs: 91,
    sb: 30,
    trend: 'up',
    news: '5-category contributor, breakout season',
    injury: 'healthy',
  },
  {
    id: 16,
    name: 'Francisco Lindor',
    position: 'SS',
    team: 'NYM',
    adp: 16.1,
    projected: 21.4,
    avg: 0.254,
    hr: 31,
    rbi: 98,
    runs: 99,
    sb: 18,
    trend: 'stable',
    news: 'Elite defense with 20/20 upside',
    injury: 'healthy',
  },
  {
    id: 17,
    name: 'Manny Machado',
    position: '3B',
    team: 'SD',
    adp: 17.3,
    projected: 21.0,
    avg: 0.263,
    hr: 30,
    rbi: 105,
    runs: 87,
    sb: 8,
    trend: 'stable',
    news: 'Consistent veteran production',
    injury: 'healthy',
  },
  {
    id: 18,
    name: 'Pete Alonso',
    position: '1B',
    team: 'NYM',
    adp: 18.2,
    projected: 20.8,
    avg: 0.217,
    hr: 46,
    rbi: 118,
    runs: 93,
    sb: 2,
    trend: 'up',
    news: 'Home run king with 50+ potential',
    injury: 'healthy',
  },
];

// Utility function to get position colors for baseball
const getPositionColor = (position: string): string => {
  const colorMap: Record<string, string> = {
    C: '#ef4444', // Red
    '1B': '#f97316', // Orange
    '2B': '#eab308', // Yellow
    '3B': '#22c55e', // Green
    SS: '#3b82f6', // Blue
    OF: '#8b5cf6', // Purple
    P: '#06b6d4', // Cyan
  };
  return colorMap[position] || '#6b7280';
};

export function DraftBoardPage(): React.JSX.Element {
  const { id: leagueId } = useParams<{ id: string }>();
  const [selectedPosition, setSelectedPosition] = React.useState('ALL');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [currentPick, setCurrentPick] = React.useState(1);
  const [timeRemaining, setTimeRemaining] = React.useState(90);
  const [draftedPlayers, setDraftedPlayers] = React.useState<number[]>([]);
  const [myTeam, setMyTeam] = React.useState<BaseballPlayer[]>([]);
  const [isMyPick, setIsMyPick] = React.useState(true);
  const [aiMode, setAiMode] = React.useState(false);
  const [vrMode, setVrMode] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<'grid' | 'list' | 'compact'>(
    'grid',
  );
  const [watchlist, setWatchlist] = React.useState<number[]>([]);
  const [chatOpen, setChatOpen] = React.useState(false);

  // Live region announcements for screen readers
  const [liveMessage, setLiveMessage] = React.useState<string>('');
  const [urgentMessage, setUrgentMessage] = React.useState<string>('');
  const prevTimeRef = React.useRef<number>(timeRemaining);

  const positions = ['ALL', 'C', '1B', '2B', '3B', 'SS', 'OF', 'P'];
  const viewModes: Array<'grid' | 'list' | 'compact'> = [
    'grid',
    'list',
    'compact',
  ];

  // Filter players
  const filteredPlayers = mockBaseballPlayers.filter((player) => {
    const matchesPosition =
      selectedPosition === 'ALL' || player.position === selectedPosition;
    const matchesSearch = player.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const isAvailable = !draftedPlayers.includes(player.id);
    return matchesPosition && matchesSearch && isAvailable;
  });

  // Draft player function
  const draftPlayer = (player: BaseballPlayer) => {
    setDraftedPlayers((prev) => [...prev, player.id]);
    if (isMyPick) {
      setMyTeam((prev) => [...prev, player]);
    }
    setCurrentPick((prev) => prev + 1);
    setTimeRemaining(90);
    setIsMyPick((prev) => !prev);
    setLiveMessage(`Drafted ${player.name} at pick #${currentPick}`);
  };

  // Timer effect
  React.useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          const availablePlayers = mockBaseballPlayers
            .filter((p) => !draftedPlayers.includes(p.id))
            .sort((a, b) => a.adp - b.adp);
          if (availablePlayers.length > 0) {
            const playerToDraft = availablePlayers[0];
            setDraftedPlayers((prevDrafted) => [
              ...prevDrafted,
              playerToDraft.id,
            ]);
            if (isMyPick) {
              setMyTeam((prevTeam) => [...prevTeam, playerToDraft]);
            }
            setCurrentPick((prevPick) => prevPick + 1);
            setIsMyPick((prevPick) => !prevPick);
            setUrgentMessage(
              `Time expired. Auto-drafted ${playerToDraft.name}.`,
            );
            setLiveMessage(
              `Pick #${currentPick + 1}. ${isMyPick ? "Opponent's pick" : 'Your pick'}.`,
            );
          }
          return 90;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [draftedPlayers, isMyPick, currentPick]);

  // Announce when it's user's turn or waiting
  React.useEffect(() => {
    setLiveMessage(isMyPick ? "It's your pick." : 'Waiting for other teams.');
  }, [isMyPick, currentPick]);

  // Announce when crossing critical time thresholds (<= 10s)
  React.useEffect(() => {
    const prev = prevTimeRef.current;
    if (prev > 10 && timeRemaining <= 10 && isMyPick) {
      setUrgentMessage('10 seconds remaining to make your pick.');
    }
    prevTimeRef.current = timeRemaining;
  }, [timeRemaining, isMyPick]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%)',
        color: 'white',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Animated Background */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            'radial-gradient(ellipse at top, rgba(255, 107, 53, 0.1) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(0, 255, 127, 0.1) 0%, transparent 50%)',
          animation: 'pulse 4s ease-in-out infinite alternate',
        }}
      />

      {/* Main Layout */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'grid',
          gridTemplateColumns: '350px 1fr 300px',
          height: '100vh',
        }}
      >
        {/* Left Sidebar - My Team & Controls */}
        <aside
          aria-label="My team and draft controls"
          style={{
            background: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(10px)',
            borderRight: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '20px',
            overflowY: 'auto',
          }}
        >
          {/* Draft Status */}
          <div
            style={{
              background: 'linear-gradient(135deg, #ff6b35 0%, #f7931e 100%)',
              padding: '20px',
              borderRadius: '16px',
              marginBottom: '24px',
              textAlign: 'center',
              boxShadow: '0 8px 32px rgba(255, 107, 53, 0.3)',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>
              <span role="img" aria-label="Baseball">
                ⚾
              </span>{' '}
              LIVE DRAFT
            </h2>
            <div style={{ fontSize: '14px', opacity: 0.9, marginTop: '4px' }}>
              {leagueId ? `League ${leagueId} • ` : ''}Pick #{currentPick} •
              Round {Math.ceil(currentPick / 12)}
            </div>
          </div>

          {/* Timer */}
          <div
            role="timer"
            aria-live="off"
            aria-label={isMyPick ? 'Your pick timer' : 'Waiting timer'}
            className={timeRemaining <= 10 ? 'reduced-shake' : undefined}
            style={{
              background:
                timeRemaining <= 10
                  ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)'
                  : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
              padding: '24px',
              borderRadius: '16px',
              textAlign: 'center',
              marginBottom: '24px',
              boxShadow: '0 8px 32px rgba(5, 150, 105, 0.3)',
              animation:
                timeRemaining <= 10
                  ? 'shake 0.5s ease-in-out infinite'
                  : 'none',
            }}
          >
            <div
              style={{
                fontSize: '36px',
                fontWeight: 'bold',
                marginBottom: '4px',
              }}
            >
              {Math.floor(timeRemaining / 60)}:
              {(timeRemaining % 60).toString().padStart(2, '0')}
            </div>
            <div
              style={{ fontSize: '12px', opacity: 0.9, letterSpacing: '1px' }}
              aria-live="off"
            >
              {isMyPick ? 'YOUR PICK!' : 'WAITING...'}
            </div>
          </div>

          {/* My Team */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '24px',
            }}
          >
            <h3
              id="my-roster-heading"
              style={{
                margin: '0 0 16px 0',
                fontSize: '18px',
                fontWeight: 'bold',
                color: '#ff6b35',
              }}
            >
              <span role="img" aria-label="Trophy">
                🏆
              </span>{' '}
              MY ROSTER ({myTeam.length}/23)
            </h3>

            {/* Position Needs */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                marginBottom: '16px',
              }}
            >
              {['C', '1B', '2B', '3B', 'SS', 'OF'].map((pos) => (
                <div
                  key={pos}
                  style={{
                    background: 'rgba(255, 107, 53, 0.1)',
                    padding: '8px',
                    borderRadius: '8px',
                    textAlign: 'center',
                    fontSize: '12px',
                    border: '1px solid rgba(255, 107, 53, 0.2)',
                  }}
                >
                  {pos}: {myTeam.filter((p) => p.position === pos).length}
                </div>
              ))}
            </div>

            {/* Drafted Players */}
            {myTeam.length > 0 ? (
              <div
                role="region"
                aria-labelledby="my-roster-heading"
                style={{ maxHeight: '300px', overflowY: 'auto' }}
              >
                <div role="list">
                  {myTeam.map((player) => (
                    <div
                      role="listitem"
                      key={player.id}
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        padding: '12px',
                        borderRadius: '8px',
                        marginBottom: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                            {player.name}
                          </div>
                          <div style={{ fontSize: '12px', opacity: 0.7 }}>
                            {player.team} • {player.position}
                          </div>
                        </div>
                        <div
                          style={{
                            background: getPositionColor(player.position),
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                          }}
                        >
                          {player.position}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div
                style={{
                  textAlign: 'center',
                  padding: '32px 16px',
                  opacity: 0.5,
                  fontSize: '14px',
                }}
              >
                Start drafting your team!
              </div>
            )}
          </div>

          {/* Elite Features */}
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            <button
              onClick={() => setAiMode(!aiMode)}
              style={{
                background: aiMode
                  ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
                  : 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                padding: '12px 16px',
                borderRadius: '10px',
                color: 'white',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
              }}
              aria-pressed={aiMode}
              aria-label={`AI Assistant ${aiMode ? 'on' : 'off'}`}
            >
              <span role="img" aria-label="Robot">
                🤖
              </span>{' '}
              AI Assistant {aiMode ? 'ON' : 'OFF'}
            </button>

            <button
              onClick={() => setChatOpen(!chatOpen)}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                padding: '12px 16px',
                borderRadius: '10px',
                color: 'white',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
              aria-pressed={chatOpen}
              aria-label={`League chat ${chatOpen ? 'open' : 'closed'}`}
            >
              <span role="img" aria-label="Speech bubble">
                💬
              </span>{' '}
              League Chat
            </button>

            <button
              onClick={() => setVrMode(!vrMode)}
              style={{
                background: vrMode
                  ? 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)'
                  : 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                padding: '12px 16px',
                borderRadius: '10px',
                color: 'white',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
              aria-pressed={vrMode}
              aria-label={`VR mode ${vrMode ? 'on' : 'off'}`}
            >
              <span role="img" aria-label="VR Goggles">
                🥽
              </span>{' '}
              VR Mode {vrMode ? 'ON' : 'OFF'}
            </button>
          </div>
        </aside>

        {/* Center - Player Board */}
        <div
          role="main"
          aria-label="Player draft board"
          style={{ padding: '20px', overflowY: 'auto' }}
        >
          {/* Header Controls */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(10px)',
              padding: '16px 20px',
              borderRadius: '16px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            {/* Search */}
            <div style={{ flex: '1', minWidth: '200px' }}>
              <input
                type="text"
                placeholder="🔍 Search elite baseball players..."
                aria-label="Search players"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(0, 0, 0, 0.3)',
                  color: 'white',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
            </div>

            {/* Position Filters */}
            <div
              role="radiogroup"
              aria-label="Filter by position"
              style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}
            >
              {positions.map((pos) => (
                <button
                  key={pos}
                  onClick={() => setSelectedPosition(pos)}
                  role="radio"
                  aria-checked={selectedPosition === pos}
                  onKeyDown={(e) => {
                    const currentIndex = positions.indexOf(selectedPosition);
                    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      const nextIndex = (currentIndex + 1) % positions.length;
                      setSelectedPosition(positions[nextIndex]);
                    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                      e.preventDefault();
                      const prevIndex =
                        (currentIndex - 1 + positions.length) %
                        positions.length;
                      setSelectedPosition(positions[prevIndex]);
                    } else if (e.key === 'Home') {
                      e.preventDefault();
                      setSelectedPosition(positions[0]);
                    } else if (e.key === 'End') {
                      e.preventDefault();
                      setSelectedPosition(positions[positions.length - 1]);
                    }
                  }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '20px',
                    border: 'none',
                    background:
                      selectedPosition === pos
                        ? 'linear-gradient(135deg, #ff6b35 0%, #f7931e 100%)'
                        : 'rgba(255, 255, 255, 0.1)',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {pos}
                </button>
              ))}
            </div>

            {/* View Mode */}
            <div
              role="radiogroup"
              aria-label="View mode"
              style={{ display: 'flex', gap: '4px' }}
            >
              {viewModes.map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  role="radio"
                  aria-checked={viewMode === mode}
                  onKeyDown={(e) => {
                    const currentIndex = viewModes.indexOf(viewMode);
                    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      const nextIndex = (currentIndex + 1) % viewModes.length;
                      setViewMode(viewModes[nextIndex]);
                    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                      e.preventDefault();
                      const prevIndex =
                        (currentIndex - 1 + viewModes.length) %
                        viewModes.length;
                      setViewMode(viewModes[prevIndex]);
                    } else if (e.key === 'Home') {
                      e.preventDefault();
                      setViewMode(viewModes[0]);
                    } else if (e.key === 'End') {
                      e.preventDefault();
                      setViewMode(viewModes[viewModes.length - 1]);
                    }
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background:
                      viewMode === mode
                        ? 'rgba(255, 107, 53, 0.3)'
                        : 'rgba(255, 255, 255, 0.1)',
                    color: 'white',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  {mode === 'grid' ? '⊞' : mode === 'list' ? '☰' : '⋯'}
                </button>
              ))}
            </div>
          </div>

          {/* Player Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                viewMode === 'grid'
                  ? 'repeat(auto-fit, minmax(340px, 1fr))'
                  : '1fr',
              gap: '16px',
            }}
          >
            {filteredPlayers.map((player, index) => (
              <div
                role="group"
                aria-labelledby={`player-name-${player.id}`}
                key={player.id}
                style={{
                  background:
                    'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
                  backdropFilter: 'blur(10px)',
                  border: `1px solid ${player.injury === 'healthy' ? 'rgba(34, 197, 94, 0.3)' : player.injury === 'questionable' ? 'rgba(251, 191, 36, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  borderRadius: '16px',
                  padding: '20px',
                  cursor: 'default',
                  transition: 'all 0.3s ease',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform =
                    'translateY(-4px) scale(1.02)';
                  e.currentTarget.style.boxShadow =
                    '0 16px 40px rgba(255, 107, 53, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {/* Rank & Trend */}
                <div
                  style={{
                    position: 'absolute',
                    top: '16px',
                    right: '16px',
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center',
                  }}
                >
                  <div
                    style={{
                      background:
                        'linear-gradient(135deg, #ff6b35 0%, #f7931e 100%)',
                      color: 'white',
                      borderRadius: '12px',
                      padding: '4px 8px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                    }}
                  >
                    #{Math.floor(player.adp)}
                  </div>
                  <div
                    style={{
                      fontSize: '18px',
                      filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
                    }}
                  >
                    {player.trend === 'up'
                      ? '📈'
                      : player.trend === 'down'
                        ? '📉'
                        : '➡️'}
                  </div>
                </div>

                {/* Player Info */}
                <div style={{ marginBottom: '16px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '8px',
                    }}
                  >
                    <h3
                      id={`player-name-${player.id}`}
                      style={{
                        margin: 0,
                        fontSize: '20px',
                        fontWeight: 'bold',
                        background:
                          'linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                      }}
                    >
                      {player.name}
                    </h3>

                    <div
                      style={{
                        background: getPositionColor(player.position),
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        color: 'white',
                        textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                      }}
                    >
                      {player.position}
                    </div>
                  </div>

                  <div
                    style={{
                      color: '#94a3b8',
                      fontSize: '14px',
                      fontWeight: '500',
                    }}
                  >
                    {player.team} • ADP: {player.adp} •{' '}
                    {player.injury?.toUpperCase()}
                  </div>
                </div>

                {/* Baseball Stats Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      player.position === 'P'
                        ? 'repeat(2, 1fr)'
                        : 'repeat(4, 1fr)',
                    gap: '12px',
                    marginBottom: '16px',
                    padding: '16px',
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '12px',
                  }}
                >
                  {player.position === 'P' ? (
                    <>
                      <div style={{ textAlign: 'center' }}>
                        <div
                          style={{
                            fontSize: '18px',
                            fontWeight: 'bold',
                            color: '#10b981',
                          }}
                        >
                          2.85
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          ERA
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div
                          style={{
                            fontSize: '18px',
                            fontWeight: 'bold',
                            color: '#f59e0b',
                          }}
                        >
                          11.2
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          K/9
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ textAlign: 'center' }}>
                        <div
                          style={{
                            fontSize: '18px',
                            fontWeight: 'bold',
                            color: '#10b981',
                          }}
                        >
                          {player.avg.toFixed(3)}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          AVG
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div
                          style={{
                            fontSize: '18px',
                            fontWeight: 'bold',
                            color: '#f59e0b',
                          }}
                        >
                          {player.hr}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          HR
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div
                          style={{
                            fontSize: '18px',
                            fontWeight: 'bold',
                            color: '#3b82f6',
                          }}
                        >
                          {player.rbi}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          RBI
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div
                          style={{
                            fontSize: '18px',
                            fontWeight: 'bold',
                            color: '#8b5cf6',
                          }}
                        >
                          {player.sb}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          SB
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* News & Actions */}
                <div
                  style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    padding: '12px',
                    borderRadius: '10px',
                    marginBottom: '16px',
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: '13px',
                      color: '#cbd5e1',
                      fontStyle: 'italic',
                      lineHeight: '1.4',
                    }}
                  >
                    {player.news}
                  </p>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => draftPlayer(player)}
                    disabled={!isMyPick}
                    aria-disabled={!isMyPick}
                    aria-label={
                      isMyPick
                        ? `Draft ${player.name} now`
                        : `Waiting for your turn to draft ${player.name}`
                    }
                    style={{
                      flex: 1,
                      background: isMyPick
                        ? 'linear-gradient(135deg, #059669 0%, #047857 100%)'
                        : 'rgba(107, 114, 128, 0.5)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '12px 16px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      cursor: isMyPick ? 'pointer' : 'not-allowed',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {isMyPick ? '⚡ DRAFT NOW' : '⏳ WAITING'}
                  </button>

                  <button
                    onClick={() => {
                      setWatchlist((prev) =>
                        prev.includes(player.id)
                          ? prev.filter((id) => id !== player.id)
                          : [...prev, player.id],
                      );
                    }}
                    aria-pressed={watchlist.includes(player.id)}
                    aria-label={
                      watchlist.includes(player.id)
                        ? `Remove ${player.name} from watchlist`
                        : `Add ${player.name} to watchlist`
                    }
                    style={{
                      background: watchlist.includes(player.id)
                        ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                        : 'rgba(255, 255, 255, 0.1)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '12px',
                      fontSize: '14px',
                      cursor: 'pointer',
                      minWidth: '44px',
                    }}
                  >
                    {watchlist.includes(player.id) ? '⭐' : '☆'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Sidebar - AI & Analytics */}
        <aside
          aria-label="AI suggestions and analytics"
          style={{
            background: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(10px)',
            borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '20px',
            overflowY: 'auto',
          }}
        >
          {/* AI Suggestions */}
          <div
            style={{
              background: 'rgba(139, 92, 246, 0.1)',
              borderRadius: '16px',
              padding: '16px',
              marginBottom: '20px',
              border: '1px solid rgba(139, 92, 246, 0.2)',
            }}
          >
            <h3
              style={{
                margin: '0 0 12px 0',
                fontSize: '16px',
                fontWeight: 'bold',
                color: '#a78bfa',
              }}
            >
              <span role="img" aria-label="Robot">
                🤖
              </span>{' '}
              AI Recommendations
            </h3>
            <div
              style={{
                fontSize: '13px',
                color: '#cbd5e1',
                marginBottom: '12px',
              }}
            >
              Based on your roster construction:
            </div>
            <div role="list">
              {filteredPlayers.slice(0, 3).map((player) => (
                <div
                  role="listitem"
                  key={`ai-${player.id}`}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    padding: '8px',
                    borderRadius: '8px',
                    marginBottom: '8px',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ fontWeight: 'bold' }}>{player.name}</div>
                  <div style={{ opacity: 0.7 }}>
                    Best available {player.position}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Picks */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '16px',
              padding: '16px',
              marginBottom: '20px',
            }}
          >
            <h3
              style={{
                margin: '0 0 12px 0',
                fontSize: '16px',
                fontWeight: 'bold',
              }}
            >
              <span role="img" aria-label="Chart">
                📊
              </span>{' '}
              Recent Picks
            </h3>
            <div role="list">
              {draftedPlayers.slice(-5).map((playerId, idx) => {
                const player = mockBaseballPlayers.find(
                  (p) => p.id === playerId,
                );
                return player ? (
                  <div
                    role="listitem"
                    key={`recent-${playerId}`}
                    style={{
                      padding: '6px 0',
                      borderBottom:
                        idx < 4 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ fontWeight: 'bold' }}>{player.name}</div>
                    <div style={{ opacity: 0.7 }}>
                      Pick #{draftedPlayers.indexOf(playerId) + 1}
                    </div>
                  </div>
                ) : null;
              })}
            </div>
          </div>

          {/* Live Analytics */}
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.1)',
              borderRadius: '16px',
              padding: '16px',
              border: '1px solid rgba(16, 185, 129, 0.2)',
            }}
          >
            <h3
              style={{
                margin: '0 0 12px 0',
                fontSize: '16px',
                fontWeight: 'bold',
                color: '#34d399',
              }}
            >
              <span role="img" aria-label="Chart with upward trend">
                📈
              </span>{' '}
              Live Analytics
            </h3>
            <div
              style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.6' }}
            >
              • {filteredPlayers.length} players available
              <br />• Avg ADP:{' '}
              {(
                filteredPlayers.reduce((sum, p) => sum + p.adp, 0) /
                filteredPlayers.length
              ).toFixed(1)}
              <br />
              • Position scarcity: OF depleting fast
              <br />
              • Value picks available in SP tier
              <br />
              • Elite catchers going early
              <br />• Power surge in 1B market
            </div>
          </div>

          {/* Watchlist */}
          <div
            style={{
              background: 'rgba(245, 158, 11, 0.1)',
              borderRadius: '16px',
              padding: '16px',
              border: '1px solid rgba(245, 158, 11, 0.2)',
            }}
          >
            <h3
              style={{
                margin: '0 0 12px 0',
                fontSize: '16px',
                fontWeight: 'bold',
                color: '#fbbf24',
              }}
            >
              <span role="img" aria-label="Star">
                ⭐
              </span>{' '}
              Watchlist ({watchlist.length})
            </h3>
            {watchlist.length > 0 ? (
              <div role="list">
                {watchlist.map((playerId) => {
                  const player = mockBaseballPlayers.find(
                    (p) => p.id === playerId,
                  );
                  return player ? (
                    <div
                      role="listitem"
                      key={`watch-${playerId}`}
                      style={{
                        padding: '6px 0',
                        fontSize: '12px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      <div style={{ fontWeight: 'bold' }}>{player.name}</div>
                      <div style={{ opacity: 0.7 }}>
                        {player.position} • ADP {player.adp}
                      </div>
                    </div>
                  ) : null;
                })}
              </div>
            ) : (
              <div
                style={{ fontSize: '12px', opacity: 0.7, fontStyle: 'italic' }}
              >
                No players on watchlist
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Custom CSS for animations */}
      <div className="sr-only" aria-live="polite">
        {liveMessage}
      </div>
      <div className="sr-only" aria-live="assertive">
        {urgentMessage}
      </div>

      {/* Custom CSS for animations */}
      <style>{`
        @keyframes pulse {
          0% { opacity: 0.8; }
          100% { opacity: 1; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          75% { transform: translateX(2px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .reduced-shake { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
