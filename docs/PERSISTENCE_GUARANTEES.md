# Persistence guarantees

Portable Ludo persists each authoritative game transition transactionally with its event records and snapshots. Dice rolls and token movements are also projected into `game_moves` in the same database transaction.

Room-created games persist their initial `GAME_STARTED` event and snapshot at sequence 1 before the room becomes active.

Matchmaking entries are refreshed when a player joins and stale waiting entries older than two minutes are excluded from a new match.
