CREATE TABLE IF NOT EXISTS guest_sessions (
  session_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  session_token_nonce TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guest_sessions_expires_at_idx ON guest_sessions(expires_at);

CREATE TABLE IF NOT EXISTS game_players (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  slot_index INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, player_id),
  UNIQUE (game_id, slot_index)
);

CREATE INDEX IF NOT EXISTS game_players_player_id_idx ON game_players(player_id);
