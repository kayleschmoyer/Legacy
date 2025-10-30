-- Align legacy environments with LS-8 default scoring multipliers
-- This migration updates seed defaults introduced in 0009_create_league_scoring_tables.sql
-- to match the values finalized in LS-8. It only adjusts definitions and profile
-- entries that still carry the legacy multipliers, leaving customized values intact.

-- Update canonical default multipliers
WITH adjustments AS (
    SELECT * FROM (VALUES
        ('batting_doubles', 1.0, 2.0),
        ('batting_hr', 3.0, 4.0),
        ('batting_sb', 1.0, 2.0),
        ('batting_triples', 2.0, 3.0),
        ('pitching_sv', 3.0, 5.0),
        ('pitching_w', 2.0, 5.0)
    ) AS v(stat_key, old_multiplier, new_multiplier)
)
UPDATE scoring_stat_definitions AS definitions
SET default_multiplier = adjustments.new_multiplier
FROM adjustments
WHERE definitions.stat_key = adjustments.stat_key
  AND definitions.default_multiplier = adjustments.old_multiplier;

-- Update existing league profile entries seeded with the legacy defaults
WITH adjustments AS (
    SELECT * FROM (VALUES
        ('batting_doubles', 1.0, 2.0),
        ('batting_hr', 3.0, 4.0),
        ('batting_sb', 1.0, 2.0),
        ('batting_triples', 2.0, 3.0),
        ('pitching_sv', 3.0, 5.0),
        ('pitching_w', 2.0, 5.0)
    ) AS v(stat_key, old_multiplier, new_multiplier)
)
UPDATE league_scoring_profile_entries AS entries
SET multiplier = adjustments.new_multiplier
FROM scoring_stat_definitions AS definitions
JOIN adjustments ON adjustments.stat_key = definitions.stat_key
WHERE entries.stat_definition_id = definitions.id
  AND entries.multiplier = adjustments.old_multiplier;
