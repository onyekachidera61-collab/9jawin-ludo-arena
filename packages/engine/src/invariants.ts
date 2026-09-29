import type { GameState, RuleSet } from "./types.js";
import { playerScore } from "./score.js";

export function assertGameInvariants(state: GameState, rules: RuleSet): void {
  if (!rules.playerCounts.includes(state.players.length as 2 | 4)) throw new Error("INVALID_PLAYER_COUNT");
  const ids = new Set(state.players.map((p) => p.playerId));
  if (ids.size !== state.players.length) throw new Error("DUPLICATE_PLAYER");
  if (state.currentPlayerIndex < 0 || state.currentPlayerIndex >= state.players.length) throw new Error("INVALID_CURRENT_PLAYER");
  for (const player of state.players) {
    if (player.tokens.length !== rules.tokenCount) throw new Error("INVALID_TOKEN_COUNT");
    if (player.timebankRemainingMs < 0 || player.timebankRemainingMs > rules.timebankMs) throw new Error("INVALID_TIMEBANK");
    if (player.score !== playerScore(player)) throw new Error("SCORE_INVARIANT");
    for (const token of player.tokens) {
      if (token.progress < rules.yardProgress || token.progress > rules.homeProgress) throw new Error("INVALID_TOKEN_PROGRESS");
      if (token.movementPoints < 0) throw new Error("INVALID_MOVEMENT_POINTS");
      if (token.homeMultiplierApplied && token.progress !== rules.homeProgress) throw new Error("INVALID_HOME_MULTIPLIER");
    }
  }
  if (state.phase === "ACTIVE") {
    if (state.turnStartedAt === null || state.turnExpiresAt === null) throw new Error("ACTIVE_WITHOUT_TURN_CLOCK");
    if (state.turnExpiresAt < state.turnStartedAt) throw new Error("INVALID_TURN_CLOCK");
  } else if (state.turnStartedAt !== null || state.turnExpiresAt !== null) {
    throw new Error("INACTIVE_WITH_TURN_CLOCK");
  }
  if (state.phase === "FINISHED" && state.winnerId === null) throw new Error("FINISHED_WITHOUT_WINNER");
  if (state.phase !== "FINISHED" && state.winnerId !== null) throw new Error("WINNER_BEFORE_FINISH");
  if (state.pendingRoll !== null) {
    if (state.pendingRoll.turnId !== state.turnId) throw new Error("PENDING_ROLL_TURN");
    if (state.pendingRoll.playerId !== state.players[state.currentPlayerIndex]?.playerId) throw new Error("PENDING_ROLL_PLAYER");
    if (state.pendingRoll.value < 1 || state.pendingRoll.value > 6) throw new Error("PENDING_ROLL_VALUE");
  }
}
