-- Add invite_code column to leagues table
-- The invite code is a unique 8-character alphanumeric code for inviting users to leagues
ALTER TABLE "leagues" ADD COLUMN "invite_code" varchar(8) UNIQUE;

-- Generate unique invite codes for existing leagues
-- Using a combination of uppercase letters and numbers (excluding similar-looking characters like 0, O, 1, I, l)
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS varchar(8) AS $$
DECLARE
    chars varchar(32) := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    result varchar(8) := '';
    i integer;
BEGIN
    FOR i IN 1..8 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Update existing leagues with unique invite codes
DO $$
DECLARE
    league_record RECORD;
    new_code varchar(8);
    code_exists boolean;
BEGIN
    FOR league_record IN SELECT id FROM leagues WHERE invite_code IS NULL LOOP
        LOOP
            new_code := generate_invite_code();
            SELECT EXISTS(SELECT 1 FROM leagues WHERE invite_code = new_code) INTO code_exists;
            IF NOT code_exists THEN
                UPDATE leagues SET invite_code = new_code WHERE id = league_record.id;
                EXIT;
            END IF;
        END LOOP;
    END LOOP;
END;
$$;

-- Make invite_code NOT NULL after populating existing records
ALTER TABLE "leagues" ALTER COLUMN "invite_code" SET NOT NULL;

-- Create index for faster lookups by invite code
CREATE INDEX "leagues_invite_code_idx" ON "leagues" ("invite_code");
