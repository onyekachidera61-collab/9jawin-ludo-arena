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
