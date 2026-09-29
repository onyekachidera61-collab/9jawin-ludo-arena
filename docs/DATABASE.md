# Portable Ludo Database

PostgreSQL is the authoritative durable store for completed game transitions.

## Current tables

- `games`: authoritative serialized game state plus monotonically increasing version.
- `game_events`: append-only transition journal keyed by `game_id` and `sequence_number`.

## Transaction rule

A state transition and its emitted events must be committed in one PostgreSQL transaction. The game version advances by the number of events written, so the version is also the highest persisted event sequence.

Optimistic concurrency uses:

`UPDATE games ... WHERE id = $gameId AND version = $expectedVersion`

A zero-row update is a version conflict and must not be broadcast as a successful transition.

## Recovery

A process restart must load the latest `games.state_json` and version before accepting commands. The event journal remains available for audit and replay.

## Migration

Initial schema: `packages/persistence/migrations/001_initial.sql`.

The current implementation is a foundation. Full transition persistence must be completed before production use.
