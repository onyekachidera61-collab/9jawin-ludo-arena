# Architecture

## Authority boundary

The browser is a presentation client. It never decides authoritative game outcomes.

Authoritative state lives in the game server and PostgreSQL persistence layer.

## Layers

1. Web client
2. HTTP API
3. Realtime transport
4. Game engine
5. Persistence
6. Matchmaking
7. Bot engine
8. Administrative inspection

## Game command flow

Client command -> schema validation -> authenticated guest session -> per-game serialization -> pure game-engine transition -> transaction/event append -> snapshot when required -> realtime broadcast.

Every state-changing command is validated and authorized on the server.

## Portability

The web frontend is Vercel-compatible. Persistent realtime execution remains a portable Node.js service so the system is not coupled to serverless WebSocket behavior.
