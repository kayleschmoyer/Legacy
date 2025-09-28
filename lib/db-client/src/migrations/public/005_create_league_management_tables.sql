-- Create fantasy league management tables
-- These support the fantasy sports functionality

-- Fantasy Leagues
CREATE TABLE IF NOT EXISTS leagues (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    owner INTEGER NOT NULL,  -- References app_internal.users(id)
    max_roster_size INTEGER NOT NULL DEFAULT 25,
    current_matchup INTEGER,  -- References matchups(id) when set
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fantasy Teams within Leagues
CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    owner INTEGER NOT NULL,  -- References app_internal.users(id)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique team names within a league
    UNIQUE(league_id, name)
);

-- Player Rosters (which players are on which fantasy teams)
CREATE TABLE IF NOT EXISTS rosters (
    id SERIAL PRIMARY KEY,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id),
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    position VARCHAR(10),  -- Preferred position for fantasy purposes
    
    -- Ensure a player can only be on one team per league at a time
    UNIQUE(team_id, player_id)
);

-- Fantasy Matchups (head-to-head competitions)
CREATE TABLE IF NOT EXISTS matchups (
    id SERIAL PRIMARY KEY,
    league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    team1_id INTEGER NOT NULL REFERENCES teams(id),
    team2_id INTEGER NOT NULL REFERENCES teams(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'completed')),
    winner_team_id INTEGER REFERENCES teams(id),  -- Set when completed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure teams are in the same league
    CONSTRAINT matchup_teams_same_league CHECK (team1_id != team2_id)
);

-- Matchup Player Performance (tracks individual player stats within matchups)
CREATE TABLE IF NOT EXISTS matchup_performances (
    id SERIAL PRIMARY KEY,
    matchup_id INTEGER NOT NULL REFERENCES matchups(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id),
    player_id INTEGER NOT NULL REFERENCES players(id),
    
    -- Batting performance in this matchup
    games_played INTEGER DEFAULT 0,
    hits INTEGER DEFAULT 0,
    home_runs INTEGER DEFAULT 0,
    rbi INTEGER DEFAULT 0,
    stolen_bases INTEGER DEFAULT 0,
    batting_average DECIMAL(4,3),
    
    -- Pitching performance in this matchup  
    wins INTEGER DEFAULT 0,
    saves INTEGER DEFAULT 0,
    strikeouts INTEGER DEFAULT 0,
    era DECIMAL(4,2),
    innings_pitched DECIMAL(4,1),
    
    -- Fantasy points (calculated based on league scoring rules)
    fantasy_points DECIMAL(8,2) DEFAULT 0.0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- One performance record per player per matchup
    UNIQUE(matchup_id, player_id)
);

-- League Scoring Rules (configurable points system)
CREATE TABLE IF NOT EXISTS scoring_rules (
    id SERIAL PRIMARY KEY,
    league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    
    -- Batting scoring
    single_points DECIMAL(4,2) DEFAULT 1.0,
    double_points DECIMAL(4,2) DEFAULT 2.0,
    triple_points DECIMAL(4,2) DEFAULT 3.0,
    home_run_points DECIMAL(4,2) DEFAULT 4.0,
    rbi_points DECIMAL(4,2) DEFAULT 1.0,
    run_points DECIMAL(4,2) DEFAULT 1.0,
    stolen_base_points DECIMAL(4,2) DEFAULT 2.0,
    walk_points DECIMAL(4,2) DEFAULT 1.0,
    
    -- Pitching scoring
    win_points DECIMAL(4,2) DEFAULT 5.0,
    save_points DECIMAL(4,2) DEFAULT 3.0,
    strikeout_points DECIMAL(4,2) DEFAULT 1.0,
    inning_pitched_points DECIMAL(4,2) DEFAULT 3.0,
    earned_run_penalty DECIMAL(4,2) DEFAULT -1.0,
    hit_allowed_penalty DECIMAL(4,2) DEFAULT -0.5,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- One scoring rule set per league
    UNIQUE(league_id)
);

-- Add indexes for fantasy league queries
CREATE INDEX IF NOT EXISTS idx_leagues_owner ON leagues(owner);
CREATE INDEX IF NOT EXISTS idx_teams_league_id ON teams(league_id);
CREATE INDEX IF NOT EXISTS idx_teams_owner ON teams(owner);
CREATE INDEX IF NOT EXISTS idx_rosters_team_id ON rosters(team_id);
CREATE INDEX IF NOT EXISTS idx_rosters_player_id ON rosters(player_id);
CREATE INDEX IF NOT EXISTS idx_matchups_league_id ON matchups(league_id);
CREATE INDEX IF NOT EXISTS idx_matchups_status ON matchups(status);
CREATE INDEX IF NOT EXISTS idx_matchup_performances_matchup_id ON matchup_performances(matchup_id);
CREATE INDEX IF NOT EXISTS idx_matchup_performances_team_id ON matchup_performances(team_id);
CREATE INDEX IF NOT EXISTS idx_matchup_performances_player_id ON matchup_performances(player_id);
