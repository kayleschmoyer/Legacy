-- Create players table
-- This is the master registry of all baseball players in the system

CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    bref_id VARCHAR(10) NOT NULL UNIQUE
);

-- Add index for common lookups
CREATE INDEX IF NOT EXISTS idx_players_bref_id ON players(bref_id);
CREATE INDEX IF NOT EXISTS idx_players_name ON players(last_name, first_name);

-- Add constraint for bref_id uniqueness
ALTER TABLE players 
ADD CONSTRAINT players_uk_bref_id UNIQUE (bref_id);
