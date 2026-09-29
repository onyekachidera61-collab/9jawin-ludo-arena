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
