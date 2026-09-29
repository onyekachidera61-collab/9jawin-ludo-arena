# Portable Ludo Database

PostgreSQL is the authoritative durable store for game state, transitions, guest-session validation, rooms, and competitive projections.

## Schema

The executable baseline schema is:

`packages/persistence/src/schema.sql`

It defines:

- `games`: authoritative serialized game state and optimistic-concurrency version.
- `game_events`: append-only transition journal.
- `game_players`: authoritative game membership.
- `game_tokens`: token projection support.
- `game_moves`: move audit projection.
- `game_snapshots`: replay/recovery snapshots.
- `guest_sessions`: durable guest nonce and expiry validation.
- `rooms` / `room_players`: transactional private-room lifecycle.
- `matchmaking_queue`: future public matchmaking coordination.
- `bot_games`: bot/test-game exclusion marker.
- `leaderboard_entries`: completed-game ranking projection.
- `rule_sets`: persisted ruleset definitions.
- `admin_audit_logs`: administrative audit trail.

## Transaction rule

A state transition and its emitted events are committed in one PostgreSQL transaction. The game version advances by the number of events written, so the version is also the highest persisted event sequence.

Optimistic concurrency uses:

`UPDATE games ... WHERE id = $gameId AND version = $expectedVersion`

A zero-row update is a version conflict and must not be broadcast as a successful transition.

## Recovery

A process restart loads the latest `games.state_json` and version before accepting commands. Active-game turn deadlines are persisted inside the state, so recovery does not silently grant a fresh turn.

The event journal remains available for audit and replay.

## Applying the schema

Apply `packages/persistence/src/schema.sql` to the target PostgreSQL database before starting the realtime server.

Production migrations should be introduced as numbered, immutable SQL migrations before changing an already deployed schema.

## Production rule

Never point development/test tooling at a production database. Financial or real-money functionality is outside this project.
