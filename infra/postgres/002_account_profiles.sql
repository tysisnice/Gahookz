-- 002: the player's saved look, and data minimisation.
--
-- Forward-only and idempotent: the server applies every numbered file once,
-- recorded in schema_migrations, and a database created before that ledger
-- existed replays 001 and 002 safely.

BEGIN;

-- One row per account: the name, preset or drawn profile picture and Gahook
-- form used to prefill the join screen on any device. The picture is a data
-- URL bounded by the same limit a room applies (MAX_AVATAR_IMAGE_CHARS); the
-- form id is stored as the server normalised it, and normalised again on read,
-- so a retired id (for example "capybara", now "pig") maps forward.
CREATE TABLE IF NOT EXISTS account_profiles (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  player_name text NOT NULL CHECK (char_length(player_name) BETWEEN 1 AND 24),
  avatar_id text NOT NULL DEFAULT '' CHECK (char_length(avatar_id) <= 20),
  avatar_image text NOT NULL DEFAULT '' CHECK (char_length(avatar_image) <= 1500000),
  gahook_form text NOT NULL DEFAULT '' CHECK (char_length(gahook_form) <= 20),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Gahookz no longer requests or stores an email address: no feature uses one.
-- Clear any that an earlier build collected. The columns stay (always '') so
-- that 001 remains valid as written.
UPDATE accounts SET email = '' WHERE email <> '';
UPDATE account_identities SET email = '' WHERE email <> '';

COMMIT;
