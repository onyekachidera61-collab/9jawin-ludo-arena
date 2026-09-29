# Portable Ludo

A standalone, server-authoritative, real-time multiplayer Ludo platform.

## Architecture

- Next.js + React + TypeScript web client
- Portable Node.js real-time/game server
- PostgreSQL persistence
- Pure TypeScript game engine
- Server-authoritative dice, movement, scoring, timers, captures, turns, and results
- Reconnectable guest sessions
- Standard and League rule sets
- Bot games isolated from competitive ranking

## Development status

Phase 1: repository and architecture foundation.

The implementation is being built incrementally. No production deployment or real-money functionality is included.

## Core Standard rules

- 2 or 4 players
- 4 tokens per player
- 6 required to leave the yard
- 52-square shared track
- Configurable safe squares and stacking
- 15-second authoritative turn timer
- Movement score: 1 point per square advanced
- A token reaching home doubles that token's accumulated movement points once
- Rolling 6, capturing, or reaching home can grant one extra roll
- Three consecutive sixes do not grant another extra roll

See docs/GAME_RULES.md and docs/SCORING.md for the complete specification.
