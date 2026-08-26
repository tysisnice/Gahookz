BEGIN;

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  email text NOT NULL DEFAULT '',
  avatar_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS account_identities (
  provider text NOT NULL,
  provider_subject text NOT NULL,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_subject)
);
CREATE INDEX IF NOT EXISTS account_identities_account_idx ON account_identities(account_id);

CREATE TABLE IF NOT EXISTS account_sessions (
  token_hash text PRIMARY KEY CHECK (char_length(token_hash) = 64),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS account_sessions_account_idx ON account_sessions(account_id);
CREATE INDEX IF NOT EXISTS account_sessions_expiry_idx ON account_sessions(expires_at);

CREATE TABLE IF NOT EXISTS career_stats (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  games_played integer NOT NULL DEFAULT 0 CHECK (games_played >= 0),
  wins integer NOT NULL DEFAULT 0 CHECK (wins >= 0),
  podiums integer NOT NULL DEFAULT 0 CHECK (podiums >= 0),
  total_score bigint NOT NULL DEFAULT 0 CHECK (total_score >= 0),
  high_score integer NOT NULL DEFAULT 0 CHECK (high_score >= 0),
  answers_submitted integer NOT NULL DEFAULT 0 CHECK (answers_submitted >= 0),
  correct_answers integer NOT NULL DEFAULT 0 CHECK (correct_answers >= 0),
  popular_choices integer NOT NULL DEFAULT 0 CHECK (popular_choices >= 0),
  questions_authored integer NOT NULL DEFAULT 0 CHECK (questions_authored >= 0),
  herd_votes_received integer NOT NULL DEFAULT 0 CHECK (herd_votes_received >= 0),
  gahooks_sent integer NOT NULL DEFAULT 0 CHECK (gahooks_sent >= 0),
  gahooks_received integer NOT NULL DEFAULT 0 CHECK (gahooks_received >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS account_entitlements (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  entitlement_key text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  source text NOT NULL DEFAULT 'manual',
  source_reference text NOT NULL DEFAULT '',
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  PRIMARY KEY (account_id, entitlement_key, source, source_reference)
);
CREATE INDEX IF NOT EXISTS account_entitlements_active_idx ON account_entitlements(account_id, entitlement_key, expires_at);

CREATE TABLE IF NOT EXISTS account_custom_gahooks (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  slot integer NOT NULL CHECK (slot >= 0 AND slot < 12),
  configuration jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, slot)
);

CREATE TABLE IF NOT EXISTS account_match_results (
  match_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  room_code text NOT NULL CHECK (char_length(room_code) = 4),
  game_mode text NOT NULL CHECK (game_mode IN ('quiz', 'majority', 'herd')),
  score integer NOT NULL CHECK (score >= 0),
  placement integer NOT NULL CHECK (placement > 0),
  player_count integer NOT NULL CHECK (player_count > 0),
  stat_delta jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, account_id)
);
CREATE INDEX IF NOT EXISTS account_match_results_account_idx ON account_match_results(account_id, created_at DESC);

COMMIT;
