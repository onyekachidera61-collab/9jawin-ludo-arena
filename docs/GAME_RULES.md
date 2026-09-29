# Game Rules

## Standard

- 2 or 4 players
- 4 tokens per player
- 52-square clockwise shared track
- Home lanes
- 6 required to leave the yard
- 8 configurable safe squares
- Capture returns an opponent token to its yard
- Default turn duration: 15 seconds
- Three consecutive sixes do not grant another extra roll
- A roll of 6, capture, or reaching home can grant an extra roll
- Multiple extra-roll triggers during one move grant at most one extra roll
- Three consecutive missed turns may eliminate a player

## Authority

Dice, legal movement, turn ownership, timers, captures, scoring, extra rolls, completion, and final results are server-authoritative.

## RuleSet design

Standard and League are separate configurations over the same engine interface. Rule-specific behavior must not be hard-coded into UI components.
