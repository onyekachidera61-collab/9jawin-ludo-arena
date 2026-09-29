import type { GameState, PlayerId, RuleSet } from "./types.js";

export type TurnClock = {
  turnId: number;
  playerId: PlayerId;
  turnStartedAt: number;
  turnExpiresAt: number;
};

export function createTurnClock(state: GameState, now: number, rules: RuleSet): TurnClock {
  const player = state.players[state.currentPlayerIndex];
  if (!player) throw new Error("CURRENT_PLAYER_MISSING");
  return {
    turnId: state.turnId,
    playerId: player.playerId,
    turnStartedAt: now,
    turnExpiresAt: now + rules.turnDurationMs
  };
}

export function isTurnExpired(clock: TurnClock, now: number): boolean {
  return now >= clock.turnExpiresAt;
}
