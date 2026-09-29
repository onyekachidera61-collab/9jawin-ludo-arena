# Recovery

Authoritative snapshots contain:

- game state
- player slots
- token state
- scores
- turn and timer state
- dice state
- rule set
- counters
- event sequence

Recovery rehydrates the latest valid snapshot and replays later events in sequence.

Every event has a monotonically increasing per-game sequence number. Recovery must reject invalid sequence transitions and preserve authoritative history.
