-- League custom scoring tables, enums, triggers, and seed data

-- Enums for stat grouping, profile lifecycle, and audit actions
CREATE TYPE scoring_stat_group AS ENUM ('batting', 'pitching', 'fielding');
CREATE TYPE scoring_profile_status AS ENUM ('draft', 'active', 'archived');
CREATE TYPE scoring_change_action AS ENUM ('created', 'updated', 'disabled');

-- Shared trigger function to maintain updated_at timestamps
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Canonical stat definitions
CREATE TABLE scoring_stat_definitions (
    id SERIAL PRIMARY KEY,
    stat_key VARCHAR(64) NOT NULL UNIQUE,
    stat_group scoring_stat_group NOT NULL,
    source_table VARCHAR(48) NOT NULL,
    source_column VARCHAR(48) NOT NULL,
    display_name VARCHAR(80) NOT NULL,
    description TEXT,
    default_multiplier NUMERIC(6,3) NOT NULL,
    min_multiplier NUMERIC(6,3) NOT NULL,
    max_multiplier NUMERIC(6,3) NOT NULL,
    step_size NUMERIC(4,3) NOT NULL DEFAULT 0.5,
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    enforce_positive BOOLEAN NOT NULL DEFAULT FALSE,
    enforce_negative BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX scoring_stat_definitions_group_idx ON scoring_stat_definitions (stat_group);

CREATE TRIGGER scoring_stat_definitions_set_updated_at
    BEFORE UPDATE ON scoring_stat_definitions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

-- League scoring profiles (versionable)
CREATE TABLE league_scoring_profiles (
    id SERIAL PRIMARY KEY,
    league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    profile_name VARCHAR(64) NOT NULL DEFAULT 'Default',
    season_year SMALLINT,
    status scoring_profile_status NOT NULL DEFAULT 'active',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    copied_from_profile_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    activated_at TIMESTAMPTZ
);

ALTER TABLE league_scoring_profiles
    ADD CONSTRAINT league_scoring_profiles_copied_from_fk
    FOREIGN KEY (copied_from_profile_id) REFERENCES league_scoring_profiles(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX league_scoring_profiles_unique_default
    ON league_scoring_profiles (league_id)
    WHERE is_default;

CREATE INDEX league_scoring_profiles_league_idx ON league_scoring_profiles (league_id);

CREATE TRIGGER league_scoring_profiles_set_updated_at
    BEFORE UPDATE ON league_scoring_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

-- Profile entries per stat
CREATE TABLE league_scoring_profile_entries (
    id SERIAL PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES league_scoring_profiles(id) ON DELETE CASCADE,
    stat_definition_id INTEGER NOT NULL REFERENCES scoring_stat_definitions(id) ON DELETE CASCADE,
    multiplier NUMERIC(6,3) NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT league_scoring_profile_entries_multiplier_chk CHECK (multiplier BETWEEN -50 AND 50)
);

CREATE UNIQUE INDEX league_scoring_profile_entries_unique
    ON league_scoring_profile_entries (profile_id, stat_definition_id);

CREATE TRIGGER league_scoring_profile_entries_set_updated_at
    BEFORE UPDATE ON league_scoring_profile_entries
    FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

-- Audit log of multiplier changes
CREATE TABLE league_scoring_change_log (
    id BIGSERIAL PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES league_scoring_profiles(id) ON DELETE CASCADE,
    stat_definition_id INTEGER NOT NULL REFERENCES scoring_stat_definitions(id) ON DELETE CASCADE,
    previous_multiplier NUMERIC(6,3),
    new_multiplier NUMERIC(6,3),
    changed_by INTEGER,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    change_reason VARCHAR(120),
    action scoring_change_action NOT NULL
);

CREATE INDEX league_scoring_change_log_profile_idx ON league_scoring_change_log (profile_id);
CREATE INDEX league_scoring_change_log_stat_idx ON league_scoring_change_log (stat_definition_id);
CREATE INDEX league_scoring_change_log_action_idx ON league_scoring_change_log (action);

-- Validate multiplier bounds against stat definition metadata
CREATE OR REPLACE FUNCTION validate_league_scoring_multiplier()
RETURNS trigger AS $$
DECLARE
    stat_def RECORD;
    step_ratio NUMERIC;
BEGIN
    SELECT
        stat_key,
        min_multiplier,
        max_multiplier,
        step_size,
        is_required,
        enforce_positive,
        enforce_negative
    INTO stat_def
    FROM scoring_stat_definitions
    WHERE id = NEW.stat_definition_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown scoring stat definition id: %', NEW.stat_definition_id;
    END IF;

    IF NEW.multiplier < stat_def.min_multiplier OR NEW.multiplier > stat_def.max_multiplier THEN
        RAISE EXCEPTION 'Multiplier % out of allowed range [% , %] for stat %',
            NEW.multiplier,
            stat_def.min_multiplier,
            stat_def.max_multiplier,
            stat_def.stat_key;
    END IF;

    IF stat_def.enforce_positive AND NEW.multiplier < 0 THEN
        RAISE EXCEPTION 'Multiplier must be non-negative for stat %', stat_def.stat_key;
    END IF;

    IF stat_def.enforce_negative AND NEW.multiplier > 0 THEN
        RAISE EXCEPTION 'Multiplier must be non-positive for stat %', stat_def.stat_key;
    END IF;

    IF NOT NEW.is_enabled AND stat_def.is_required THEN
        RAISE EXCEPTION 'Stat % is required and cannot be disabled', stat_def.stat_key;
    END IF;

    IF stat_def.step_size IS NOT NULL AND stat_def.step_size > 0 THEN
        step_ratio := NEW.multiplier / stat_def.step_size;
        IF step_ratio <> round(step_ratio) THEN
            RAISE EXCEPTION 'Multiplier % must align to step size % for stat %',
                NEW.multiplier,
                stat_def.step_size,
                stat_def.stat_key;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Audit log trigger function
CREATE OR REPLACE FUNCTION log_league_scoring_profile_change()
RETURNS trigger AS $$
DECLARE
    action_value scoring_change_action;
    previous_value NUMERIC(6,3);
    new_value NUMERIC(6,3);
BEGIN
    IF TG_OP = 'INSERT' THEN
        action_value := 'created';
        previous_value := NULL;
        new_value := NEW.multiplier;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.multiplier IS DISTINCT FROM OLD.multiplier OR NEW.is_enabled IS DISTINCT FROM OLD.is_enabled THEN
            IF NEW.is_enabled = FALSE AND OLD.is_enabled = TRUE THEN
                action_value := 'disabled';
            ELSE
                action_value := 'updated';
            END IF;
            previous_value := OLD.multiplier;
            new_value := NEW.multiplier;
        ELSE
            RETURN NEW;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        action_value := 'disabled';
        previous_value := OLD.multiplier;
        new_value := NULL;
    END IF;

    INSERT INTO league_scoring_change_log (
        profile_id,
        stat_definition_id,
        previous_multiplier,
        new_multiplier,
        changed_by,
        change_reason,
        action
    ) VALUES (
        COALESCE(NEW.profile_id, OLD.profile_id),
        COALESCE(NEW.stat_definition_id, OLD.stat_definition_id),
        previous_value,
        new_value,
        NULL,
        NULL,
        action_value
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Seed default stat definitions based on existing hard-coded scoring
CREATE TRIGGER league_scoring_profile_entries_validate
    BEFORE INSERT OR UPDATE ON league_scoring_profile_entries
    FOR EACH ROW EXECUTE FUNCTION validate_league_scoring_multiplier();

CREATE TRIGGER league_scoring_profile_entries_log_insert
    AFTER INSERT ON league_scoring_profile_entries
    FOR EACH ROW EXECUTE FUNCTION log_league_scoring_profile_change();

CREATE TRIGGER league_scoring_profile_entries_log_update
    AFTER UPDATE ON league_scoring_profile_entries
    FOR EACH ROW EXECUTE FUNCTION log_league_scoring_profile_change();

CREATE TRIGGER league_scoring_profile_entries_log_delete
    AFTER DELETE ON league_scoring_profile_entries
    FOR EACH ROW EXECUTE FUNCTION log_league_scoring_profile_change();

-- Seed default stat definitions based on existing hard-coded scoring
INSERT INTO scoring_stat_definitions (
    stat_key, stat_group, source_table, source_column, display_name, description,
    default_multiplier, min_multiplier, max_multiplier,
    step_size, is_required, enforce_positive, enforce_negative
) VALUES
    ('batting_cs', 'batting', 'season_batting', 'cs', 'Caught Stealing', 'Penalty when a runner is caught stealing.', -1.0, -10.0, 0.0, 0.5, FALSE, FALSE, TRUE),
    ('batting_doubles', 'batting', 'season_batting', 'doubles', 'Doubles', 'Two-base hits recorded in a season.', 2.0, 0.0, 10.0, 0.5, TRUE, TRUE, FALSE),
    ('batting_h', 'batting', 'season_batting', 'h', 'Hits', 'Total hits recorded.', 1.0, 0.0, 10.0, 0.5, TRUE, TRUE, FALSE),
    ('batting_hbp', 'batting', 'season_batting', 'hbp', 'Hit by Pitch', 'Plate appearances where the batter is hit.', 1.0, 0.0, 10.0, 0.5, FALSE, TRUE, FALSE),
    ('batting_hr', 'batting', 'season_batting', 'hr', 'Home Runs', 'Home runs hit by the batter.', 4.0, 0.0, 15.0, 0.5, TRUE, TRUE, FALSE),
    ('batting_r', 'batting', 'season_batting', 'r', 'Runs', 'Runs scored by the player.', 1.0, 0.0, 10.0, 0.5, TRUE, TRUE, FALSE),
    ('batting_rbi', 'batting', 'season_batting', 'rbi', 'Runs Batted In', 'Runs batted in by the player.', 1.0, 0.0, 10.0, 0.5, TRUE, TRUE, FALSE),
    ('batting_sb', 'batting', 'season_batting', 'sb', 'Stolen Bases', 'Bases successfully stolen.', 2.0, 0.0, 10.0, 0.5, TRUE, TRUE, FALSE),
    ('batting_so', 'batting', 'season_batting', 'so', 'Strikeouts', 'Strikeouts taken by the batter.', -0.5, -10.0, 0.0, 0.5, FALSE, FALSE, TRUE),
    ('batting_triples', 'batting', 'season_batting', 'triples', 'Triples', 'Three-base hits recorded.', 3.0, 0.0, 15.0, 0.5, TRUE, TRUE, FALSE),
    ('pitching_bb', 'pitching', 'season_pitching', 'bb', 'Walks Allowed', 'Walks issued by the pitcher.', -1.0, -15.0, 0.0, 0.5, FALSE, FALSE, TRUE),
    ('pitching_er', 'pitching', 'season_pitching', 'er', 'Earned Runs', 'Earned runs allowed.', -2.0, -15.0, 0.0, 0.5, FALSE, FALSE, TRUE),
    ('pitching_h', 'pitching', 'season_pitching', 'h', 'Hits Allowed', 'Hits allowed by the pitcher.', -1.0, -15.0, 0.0, 0.5, FALSE, FALSE, TRUE),
    ('pitching_l', 'pitching', 'season_pitching', 'l', 'Losses', 'Losses charged to the pitcher.', -2.0, -15.0, 0.0, 0.5, FALSE, FALSE, TRUE),
    ('pitching_outs_recorded', 'pitching', 'season_pitching', 'outs_recorded', 'Outs Recorded', 'Total outs recorded (3 per inning).', 1.0, 0.0, 5.0, 0.5, TRUE, TRUE, FALSE),
    ('pitching_so', 'pitching', 'season_pitching', 'so', 'Strikeouts', 'Strikeouts by the pitcher.', 1.0, 0.0, 10.0, 0.5, TRUE, TRUE, FALSE),
    ('pitching_sv', 'pitching', 'season_pitching', 'sv', 'Saves', 'Saves recorded by the pitcher.', 5.0, 0.0, 10.0, 0.5, TRUE, TRUE, FALSE),
    ('pitching_w', 'pitching', 'season_pitching', 'w', 'Wins', 'Wins credited to the pitcher.', 5.0, 0.0, 10.0, 0.5, TRUE, TRUE, FALSE),
    ('fielding_e_def', 'fielding', 'season_fielding', 'e_def', 'Errors', 'Defensive errors committed.', -1.0, -10.0, 0.0, 0.5, FALSE, FALSE, TRUE);

-- Default scoring profile for existing leagues
INSERT INTO league_scoring_profiles (
    league_id,
    profile_name,
    season_year,
    status,
    is_default,
    activated_at
)
SELECT
    id,
    'Default',
    NULL,
    'active',
    TRUE,
    now()
FROM leagues;

-- Seed profile entries based on default multipliers
INSERT INTO league_scoring_profile_entries (
    profile_id,
    stat_definition_id,
    multiplier,
    is_enabled
)
SELECT
    profiles.id,
    definitions.id,
    definitions.default_multiplier,
    TRUE
FROM league_scoring_profiles AS profiles
CROSS JOIN scoring_stat_definitions AS definitions
ON CONFLICT (profile_id, stat_definition_id) DO NOTHING;

-- Record seed inserts in audit log
INSERT INTO league_scoring_change_log (
    profile_id,
    stat_definition_id,
    previous_multiplier,
    new_multiplier,
    changed_by,
    change_reason,
    action
)
SELECT
    entries.profile_id,
    entries.stat_definition_id,
    NULL,
    entries.multiplier,
    NULL,
    'Initial migration seed',
    'created'
FROM league_scoring_profile_entries AS entries;
