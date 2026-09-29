# Security

Initial security requirements:

- Cryptographically secure guest identifiers and dice
- Short-lived signed session and reconnect tokens
- Server-only secrets
- Strict schema validation with Zod
- Secure HTTP headers
- Restricted CORS
- HTTP and WebSocket rate limits
- Per-game command serialization
- Idempotency protection for duplicate state-changing commands
- Parameterized database access
- Safe rendering of player-controlled text
- Suspicious-action audit logging
- Separate administrative authentication
- No financial, payment, or KYC functionality
