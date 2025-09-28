-- Create season-level statistics tables
-- These are the source of truth for all baseball statistics

-- Season Batting Statistics
CREATE TABLE IF NOT EXISTS season_batting (
    player_id INTEGER NOT NULL REFERENCES players(id),
    season INTEGER NOT NULL,
    team VARCHAR(20) NOT NULL,
    row_id VARCHAR(10) NOT NULL,
    lg_id VARCHAR(20),
    
    -- Games and plate appearances
    g INTEGER,
    pa INTEGER,
    ab INTEGER,
    
    -- Offensive statistics
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
    
    -- Advanced statistics (pre-calculated)
    batting_avg DOUBLE PRECISION,
    onbase_perc DOUBLE PRECISION,
    slugging_perc DOUBLE PRECISION,
    onbase_plus_slugging DOUBLE PRECISION,
    
    -- Additional offensive metrics
    tb INTEGER,
    gidp INTEGER,
    hbp INTEGER,
    sh INTEGER,
    sf VARCHAR(10),
    ibb INTEGER,
    
    -- Positional and awards data
    pos_season VARCHAR(50),
    award_summary TEXT,
    
    -- Composite primary key to handle multi-team seasons
    PRIMARY KEY (player_id, season, team, row_id)
);

-- Season Pitching Statistics  
CREATE TABLE IF NOT EXISTS season_pitching (
    player_id INTEGER NOT NULL REFERENCES players(id),
    season INTEGER NOT NULL,
    team VARCHAR(20) NOT NULL,
    row_id VARCHAR(10) NOT NULL,
    lg_id VARCHAR(20),
    
    -- Win/Loss record
    w INTEGER,
    l INTEGER,
    win_loss_perc NUMERIC,
    earned_run_avg NUMERIC,
    
    -- Game appearances
    g INTEGER,
    gs INTEGER,
    gf INTEGER,
    cg INTEGER,
    sho INTEGER,
    sv INTEGER,
    
    -- Innings and basic stats
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
    
    -- Generated column for outs recorded
    outs_recorded INTEGER GENERATED ALWAYS AS (FLOOR(ip) * 3 + (ip - FLOOR(ip)) * 10) STORED,
    
    -- Advanced sabermetrics
    earned_run_avg_plus DOUBLE PRECISION,
    fip DOUBLE PRECISION,
    whip DOUBLE PRECISION,
    hits_per_nine DOUBLE PRECISION,
    home_runs_per_nine DOUBLE PRECISION,
    bases_on_balls_per_nine DOUBLE PRECISION,
    strikeouts_per_nine DOUBLE PRECISION,
    strikeouts_per_base_on_balls DOUBLE PRECISION,
    
    -- Awards
    award_summary TEXT,
    
    -- Composite primary key
    PRIMARY KEY (player_id, season, team, row_id)
);

-- Season Fielding Statistics
CREATE TABLE IF NOT EXISTS season_fielding (
    player_id INTEGER NOT NULL REFERENCES players(id),
    season INTEGER NOT NULL,
    pos VARCHAR(10) NOT NULL,
    team VARCHAR(20) NOT NULL,
    row_id VARCHAR(10) NOT NULL,
    lg_id VARCHAR(20),
    
    -- Games and innings
    g INTEGER,
    gs INTEGER,
    cg INTEGER,
    inn_def DOUBLE PRECISION,
    
    -- Fielding statistics
    chances DOUBLE PRECISION,
    po INTEGER,
    a INTEGER,
    e_def INTEGER,
    dp_def INTEGER,
    fielding_perc DOUBLE PRECISION,
    
    -- Range factor metrics
    range_factor_per_nine DOUBLE PRECISION,
    range_factor_per_game DOUBLE PRECISION,
    
    -- League comparison metrics
    fielding_perc_lg DOUBLE PRECISION,
    range_factor_per_nine_lg DOUBLE PRECISION,
    range_factor_per_game_lg DOUBLE PRECISION,
    
    -- Position-specific metrics (mainly for catchers)
    g_of_parts INTEGER,
    sb INTEGER,
    cs INTEGER,
    caught_stealing_perc DOUBLE PRECISION,
    caught_stealing_perc_lg DOUBLE PRECISION,
    pickoffs INTEGER,
    wp INTEGER,
    
    -- Awards
    award_summary TEXT,
    
    -- Composite primary key including position
    PRIMARY KEY (player_id, season, pos, team, row_id)
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_season_batting_player_id ON season_batting(player_id);
CREATE INDEX IF NOT EXISTS idx_season_batting_hr ON season_batting(hr) WHERE hr IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_season_batting_lg_id ON season_batting(lg_id);

CREATE INDEX IF NOT EXISTS idx_season_pitching_player_id ON season_pitching(player_id);
CREATE INDEX IF NOT EXISTS idx_season_pitching_w ON season_pitching(w) WHERE w IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_season_pitching_lg_id ON season_pitching(lg_id);

CREATE INDEX IF NOT EXISTS idx_season_fielding_player_id ON season_fielding(player_id);
CREATE INDEX IF NOT EXISTS idx_season_fielding_player_pos ON season_fielding(player_id, pos);
CREATE INDEX IF NOT EXISTS idx_season_fielding_po ON season_fielding(po) WHERE po IS NOT NULL;
