CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  phase TEXT NOT NULL,
  ruleset TEXT NOT NULL,
  state_json JSONB NOT NULL,
  version BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_events (
  id BIGSERIAL PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  sequence_number BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  player_id TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (game_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS game_events_game_id_idx ON game_events(game_id, sequence_number);


CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, owner_player_id TEXT NOT NULL, ruleset TEXT NOT NULL, player_count INTEGER NOT NULL, status TEXT NOT NULL, game_id TEXT UNIQUE REFERENCES games(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS room_players (room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, player_id TEXT NOT NULL, slot_index INTEGER NOT NULL, display_name TEXT NOT NULL, ready BOOLEAN NOT NULL DEFAULT false, joined_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (room_id, player_id), UNIQUE (room_id, slot_index));
CREATE INDEX IF NOT EXISTS rooms_status_idx ON rooms(status);
CREATE INDEX IF NOT EXISTS rooms_expires_at_idx ON rooms(expires_at);
CREATE INDEX IF NOT EXISTS room_players_player_idx ON room_players(player_id);


CREATE TABLE IF NOT EXISTS guest_sessions (
  session_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  session_token_nonce TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guest_sessions_player_idx ON guest_sessions(player_id);
CREATE INDEX IF NOT EXISTS guest_sessions_expiry_idx ON guest_sessions(expires_at);

CREATE TABLE IF NOT EXISTS game_players (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  slot_index INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, player_id),
  UNIQUE (game_id, slot_index)
);
CREATE INDEX IF NOT EXISTS game_players_player_idx ON game_players(player_id);

CREATE TABLE IF NOT EXISTS game_tokens (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  token_id INTEGER NOT NULL,
  progress INTEGER NOT NULL,
  movement_points INTEGER NOT NULL DEFAULT 0,
  home_multiplier_applied BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (game_id, player_id, token_id)
);

CREATE TABLE IF NOT EXISTS game_moves (
  id BIGSERIAL PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  turn_id BIGINT NOT NULL,
  player_id TEXT NOT NULL,
  token_id INTEGER,
  dice_value INTEGER,
  move_distance INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_moves_game_idx ON game_moves(game_id, id);

CREATE TABLE IF NOT EXISTS game_snapshots (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  sequence_number BIGINT NOT NULL,
  state_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, sequence_number)
);

CREATE TABLE IF NOT EXISTS matchmaking_queue (
  id BIGSERIAL PRIMARY KEY,
  player_id TEXT NOT NULL,
  ruleset TEXT NOT NULL,
  player_count INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'WAITING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, ruleset, player_count)
);
CREATE INDEX IF NOT EXISTS matchmaking_queue_lookup_idx ON matchmaking_queue(status, ruleset, player_count, created_at);

CREATE TABLE IF NOT EXISTS bot_games (
  game_id TEXT PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  difficulty TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id BIGSERIAL PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (game_id, player_id)
);
CREATE INDEX IF NOT EXISTS leaderboard_entries_rank_idx ON leaderboard_entries(rank, score DESC);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  game_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS rule_sets (
  name TEXT PRIMARY KEY,
  definition JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
