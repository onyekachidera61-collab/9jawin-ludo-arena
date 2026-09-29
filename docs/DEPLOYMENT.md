# Deployment

## Web

The Next.js web application can deploy to Vercel.

## Realtime

The persistent realtime/game server is a portable Node.js process and can run on a VPS, container platform, or other Node-compatible host.

## Database

PostgreSQL is the authoritative persistence store.

## Required production configuration

Set all required secrets through the deployment platform. Never commit .env files or production credentials.

Production deployment is gated on passing unit, integration, typecheck, lint, build, reconnect, concurrency, replay, and acceptance tests.
