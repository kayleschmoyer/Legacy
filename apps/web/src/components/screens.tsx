import React from 'react';
import { PlayersTable } from '@legacy-sports/shared-components';
import { EliteDraftBoardScreen } from './EliteDraftBoard';

export function HomeScreen(): React.JSX.Element {
  const handleSportClick = (sport: string) => {
    console.log(`Selected sport: ${sport}`);
    // Add navigation logic here
  };

  const handleNavigate = (path: string) => {
    console.log(`Navigating to: ${path}`);
    // Add navigation logic here
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Home Screen</h1>
      <p>Welcome to Legacy Sports!</p>

      <div
        style={{
          marginTop: '20px',
          display: 'flex',
          gap: '10px',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={() => handleSportClick('football')}
          style={{
            padding: '10px 20px',
            backgroundColor: '#3366FF',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          <span role="img" aria-label="Football">
            🏈
          </span>{' '}
          Football
        </button>
        <button
          onClick={() => handleSportClick('baseball')}
          style={{
            padding: '10px 20px',
            backgroundColor: '#3366FF',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          <span role="img" aria-label="Baseball">
            ⚾
          </span>{' '}
          Baseball
        </button>
        <button
          onClick={() => handleNavigate('/draftboard')}
          style={{
            padding: '10px 20px',
            backgroundColor: '#FF6B35',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          <span role="img" aria-label="Draft Board">
            📋
          </span>{' '}
          Draft Board
        </button>
      </div>
    </div>
  );
}

export function BaseballScreen(): React.JSX.Element {
  return (
    <div style={{ padding: '20px' }}>
      <h1>Baseball Screen</h1>
      <p>Baseball statistics and information</p>
    </div>
  );
}

export function FootballScreen(): React.JSX.Element {
  return (
    <div style={{ padding: '20px' }}>
      <h1>Football Screen</h1>
      <p>Football statistics and information</p>
    </div>
  );
}

export function PlayersScreen(): React.JSX.Element {
  return (
    <div style={{ padding: '20px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}
      >
        <div>
          <h1>Players</h1>
          <p>Browse and manage player information</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <a
            href="#/players/stats"
            style={{
              padding: '10px 20px',
              backgroundColor: '#3366FF',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span role="img" aria-label="statistics">
              📊
            </span>
            Advanced Player Statistics
          </a>
        </div>
      </div>
      <div style={{ marginTop: '20px' }}>
        <PlayersTable />
      </div>

      {/* Career Statistics Section */}
      <div style={{ marginTop: '40px' }}>
        <h2>Career Statistics</h2>
        <p>Top performing players based on career statistics</p>
        <PlayersTable
          title="Top Home Run Hitters (Career)"
          useCareerStats={true}
          minGames={100}
          minHomeRuns={50}
          pageSize={20}
          compact={true}
        />
      </div>
    </div>
  );
}

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
  trend: string;
  news: string;
  injury: string;
}

// Elite Baseball Draft Data - Production Grade
const mockBaseballPlayers = [
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
];

export function DraftBoardScreen(): React.JSX.Element {
  return <EliteDraftBoardScreen />;
}

export function LegacyDraftBoardScreen(): React.JSX.Element {
  const [selectedPosition, setSelectedPosition] = React.useState('ALL');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [currentPick, setCurrentPick] = React.useState(1);
  const [timeRemaining, setTimeRemaining] = React.useState(90);
  const [draftedPlayers, setDraftedPlayers] = React.useState<number[]>([]);
  const [myTeam, setMyTeam] = React.useState<BaseballPlayer[]>([]);
  const [isMyPick, setIsMyPick] = React.useState(true);
  // Advanced features for elite experience (variables removed to fix linting issues)

  // Elite timer effect with advanced features
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
          }
          return 90;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [draftedPlayers, isMyPick]);

  const positions = ['ALL', 'C', '1B', '2B', '3B', 'SS', 'OF', 'P'];

  const filteredPlayers = mockBaseballPlayers.filter((player) => {
    const matchesPosition =
      selectedPosition === 'ALL' || player.position === selectedPosition;
    const matchesSearch = player.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const isAvailable = !draftedPlayers.includes(player.id);
    return matchesPosition && matchesSearch && isAvailable;
  });

  const draftPlayer = (player: BaseballPlayer) => {
    setDraftedPlayers((prev) => [...prev, player.id]);
    if (isMyPick) {
      setMyTeam((prev) => [...prev, player]);
    }
    setCurrentPick((prev) => prev + 1);
    setTimeRemaining(90);
    setIsMyPick((prev) => !prev); // Alternate between user and CPU picks
  };

  const getPositionColor = (position: string) => {
    const colors = {
      C: '#8B5CF6', // Purple - Catcher
      '1B': '#06B6D4', // Cyan - First Base
      '2B': '#10B981', // Emerald - Second Base
      '3B': '#F59E0B', // Amber - Third Base
      SS: '#EF4444', // Red - Shortstop
      OF: '#3B82F6', // Blue - Outfield
      P: '#6B7280', // Gray - Pitcher
    };
    return colors[position as keyof typeof colors] || '#6B7280';
  };

  React.useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining((prev) => (prev > 0 ? prev - 1 : 90));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0F172A',
        color: 'white',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1E293B 0%, #334155 100%)',
          padding: '20px',
          borderBottom: '2px solid #475569',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '15px',
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: '28px',
                fontWeight: 'bold',
                color: '#F1F5F9',
              }}
            >
              2024 Fantasy Draft Board
            </h1>
            <p
              style={{
                margin: '5px 0 0 0',
                color: '#94A3B8',
                fontSize: '14px',
              }}
            >
              12-Team Standard League • Round 1
            </p>
          </div>

          {/* Draft Timer */}
          <div
            style={{
              background:
                timeRemaining > 30
                  ? '#059669'
                  : timeRemaining > 10
                    ? '#D97706'
                    : '#DC2626',
              padding: '15px 25px',
              borderRadius: '12px',
              textAlign: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
              {Math.floor(timeRemaining / 60)}:
              {(timeRemaining % 60).toString().padStart(2, '0')}
            </div>
            <div style={{ fontSize: '12px', opacity: 0.9 }}>
              Pick #{currentPick}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div
          style={{
            display: 'flex',
            gap: '15px',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {/* Search */}
          <input
            type="text"
            placeholder="Search players..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: '10px 15px',
              borderRadius: '8px',
              border: '1px solid #475569',
              backgroundColor: '#1E293B',
              color: 'white',
              fontSize: '14px',
              width: '250px',
            }}
          />

          {/* Position Filter */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {positions.map((pos) => (
              <button
                key={pos}
                onClick={() => setSelectedPosition(pos)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '20px',
                  border: 'none',
                  backgroundColor:
                    selectedPosition === pos ? '#3B82F6' : '#374151',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {pos}
              </button>
            ))}
          </div>

          {/* My Team Section */}
          <div
            style={{
              marginTop: '30px',
              borderTop: '1px solid #374151',
              paddingTop: '20px',
            }}
          >
            <h3
              style={{
                color: '#F1F5F9',
                fontSize: '18px',
                fontWeight: 'bold',
                marginBottom: '15px',
              }}
            >
              My Team ({myTeam.length}/16)
            </h3>
            {myTeam.length > 0 ? (
              myTeam.map((player) => (
                <div
                  key={player.id}
                  style={{
                    backgroundColor: '#0F172A',
                    padding: '12px',
                    borderRadius: '8px',
                    marginBottom: '8px',
                    border: '1px solid #374151',
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
                      <div
                        style={{
                          color: '#F1F5F9',
                          fontSize: '14px',
                          fontWeight: 'bold',
                        }}
                      >
                        {player.name}
                      </div>
                      <div style={{ color: '#64748B', fontSize: '12px' }}>
                        {player.position} - {player.team}
                      </div>
                    </div>
                    <div
                      style={{
                        backgroundColor: getPositionColor(player.position),
                        color: 'white',
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
              ))
            ) : (
              <div
                style={{
                  color: '#64748B',
                  fontSize: '14px',
                  fontStyle: 'italic',
                  textAlign: 'center',
                  padding: '20px',
                }}
              >
                No players drafted yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Player List */}
      <div style={{ padding: '20px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '15px',
          }}
        >
          {filteredPlayers.map((player, index) => (
            <div
              key={player.id}
              style={{
                background: 'linear-gradient(135deg, #1E293B 0%, #334155 100%)',
                border: '1px solid #475569',
                borderRadius: '12px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow =
                  '0 8px 25px rgba(59, 130, 246, 0.15)';
                e.currentTarget.style.borderColor = '#3B82F6';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.borderColor = '#475569';
              }}
            >
              {/* Rank Badge */}
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  backgroundColor: '#3B82F6',
                  color: 'white',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 'bold',
                }}
              >
                {index + 1}
              </div>

              {/* Player Info */}
              <div style={{ marginBottom: '12px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '4px',
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontSize: '18px',
                      fontWeight: 'bold',
                      color: '#F1F5F9',
                    }}
                  >
                    {player.name}
                  </h3>
                  <span
                    style={{
                      backgroundColor: getPositionColor(player.position),
                      color: 'white',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                    }}
                  >
                    {player.position}
                  </span>
                  <span
                    style={{
                      color:
                        player.trend === 'up'
                          ? '#10B981'
                          : player.trend === 'down'
                            ? '#EF4444'
                            : '#64748B',
                      fontSize: '14px',
                      fontWeight: 'bold',
                    }}
                  >
                    {player.trend === 'up'
                      ? '↗️'
                      : player.trend === 'down'
                        ? '↘️'
                        : '→'}
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    color: '#94A3B8',
                    fontSize: '14px',
                    fontWeight: '500',
                  }}
                >
                  {player.team} •{' '}
                  {player.injury === 'healthy'
                    ? 'Healthy'
                    : player.injury === 'questionable'
                      ? 'Questionable'
                      : 'Doubtful'}
                </p>
                <div
                  style={{
                    backgroundColor: '#0F172A',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    marginTop: '8px',
                    border: '1px solid #374151',
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      color: '#CBD5E1',
                      fontSize: '12px',
                      fontStyle: 'italic',
                    }}
                  >
                    {player.news}
                  </p>
                </div>
              </div>

              {/* Stats */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '12px',
                  paddingTop: '12px',
                  borderTop: '1px solid #374151',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: 'bold',
                      color: '#10B981',
                    }}
                  >
                    {player.adp}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>ADP</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: 'bold',
                      color: '#F59E0B',
                    }}
                  >
                    {player.projected}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>PROJ</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <button
                    onClick={() => draftPlayer(player)}
                    style={{
                      backgroundColor: isMyPick ? '#059669' : '#6B7280',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                    }}
                  >
                    DRAFT
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
