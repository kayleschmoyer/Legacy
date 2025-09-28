-- Create game-level statistics tables
-- These store individual game performance data

-- Game Batting Statistics
CREATE TABLE IF NOT EXISTS game_batting (
    player_id INTEGER NOT NULL REFERENCES players(id),
    season INTEGER NOT NULL,
    game_number INTEGER NOT NULL,
    game_identifier CHAR(12) NOT NULL,
    
    -- Game context
    team VARCHAR(20),
    lg_id VARCHAR(20),
    
    -- Batting statistics (subset of season stats relevant to single game)
    g INTEGER DEFAULT 1,  -- Always 1 for game-level
    pa INTEGER,
    ab INTEGER,
    r INTEGER,
    h INTEGER,
    doubles INTEGER,
    triples INTEGER,
    hr INTEGER,
    rbi INTEGER,
    sb INTEGER,
    cs INTEGER,
    bb INTEGER,
    so INTEGER,
    hbp INTEGER,
    sh INTEGER,
    sf INTEGER,
    ibb INTEGER,
    
    -- Primary key for game-level uniqueness
    PRIMARY KEY (player_id, season, game_identifier)
);

-- Game Pitching Statistics
CREATE TABLE IF NOT EXISTS game_pitching (
    player_id INTEGER NOT NULL REFERENCES players(id),
    season INTEGER NOT NULL,
    game_number INTEGER NOT NULL,
    game_identifier CHAR(12) NOT NULL,
    
    -- Game context  
    team VARCHAR(20),
    lg_id VARCHAR(20),
    
    -- Pitching decision
    w INTEGER,  -- 1 for win, 0 for no decision
    l INTEGER,  -- 1 for loss, 0 for no decision  
    sv INTEGER, -- 1 for save, 0 for no save
    
    -- Game pitching stats
    g INTEGER DEFAULT 1,  -- Always 1 for game-level
    gs INTEGER,  -- 1 if started, 0 if relief
    gf INTEGER,  -- 1 if finished, 0 if not
    cg INTEGER,  -- 1 if complete game
    sho INTEGER, -- 1 if shutout
    
    -- Performance stats
    ip DOUBLE PRECISION,
    h INTEGER,
    r INTEGER,
    er INTEGER,
    hr INTEGER,
    bb INTEGER,
    ibb INTEGER,
    so INTEGER,
    hbp INTEGER,
    bk INTEGER,
    wp INTEGER,
    batters_faced INTEGER,
    
    -- Generated outs recorded
    outs_recorded INTEGER GENERATED ALWAYS AS (FLOOR(ip) * 3 + (ip - FLOOR(ip)) * 10) STORED,
    
    -- Primary key for game-level uniqueness
    PRIMARY KEY (player_id, season, game_identifier)
);

-- Game Fielding Statistics  
CREATE TABLE IF NOT EXISTS game_fielding (
    player_id INTEGER NOT NULL REFERENCES players(id),
    season INTEGER NOT NULL,
    game_number INTEGER NOT NULL,
    game_identifier CHAR(12) NOT NULL,
    pos VARCHAR(10) NOT NULL,
    
    -- Game context
    team VARCHAR(20),
    lg_id VARCHAR(20),
    
    -- Game fielding stats (subset relevant to single game)
    g INTEGER DEFAULT 1,  -- Always 1 for game-level
    gs INTEGER,  -- 1 if started at position
    inn_def DOUBLE PRECISION,  -- Innings played at position
    po INTEGER,
    a INTEGER,
    e_def INTEGER,
    dp_def INTEGER,
    
    -- Catcher-specific game stats
    sb INTEGER,  -- Stolen bases allowed
    cs INTEGER,  -- Runners caught stealing
    pickoffs INTEGER,
    wp INTEGER,  -- Wild pitches (catcher responsibility)
    
    -- Primary key including position for multi-position games
    PRIMARY KEY (player_id, season, game_identifier, pos)
);

-- Add indexes for common game-level queries
CREATE INDEX IF NOT EXISTS idx_game_batting_player_season ON game_batting(player_id, season);
CREATE INDEX IF NOT EXISTS idx_game_batting_game_id ON game_batting(game_identifier);
CREATE INDEX IF NOT EXISTS idx_game_batting_hr ON game_batting(hr) WHERE hr > 0;

CREATE INDEX IF NOT EXISTS idx_game_pitching_player_season ON game_pitching(player_id, season);
CREATE INDEX IF NOT EXISTS idx_game_pitching_game_id ON game_pitching(game_identifier);
CREATE INDEX IF NOT EXISTS idx_game_pitching_decision ON game_pitching(w, l, sv) WHERE w = 1 OR l = 1 OR sv = 1;

CREATE INDEX IF NOT EXISTS idx_game_fielding_player_season ON game_fielding(player_id, season);
CREATE INDEX IF NOT EXISTS idx_game_fielding_game_id ON game_fielding(game_identifier);
CREATE INDEX IF NOT EXISTS idx_game_fielding_pos ON game_fielding(pos);
