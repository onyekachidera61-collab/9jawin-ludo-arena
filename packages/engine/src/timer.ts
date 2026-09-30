import type { GameState, PlayerId, RuleSet } from "./types.js";
import type { GameEvent } from "./game.js";

export type TurnClock = {
  turnId: number;
  playerId: PlayerId;
  turnStartedAt: number;
  turnExpiresAt: number;
};

export function createTurnClock(state: GameState, now = Date.now(), rules: RuleSet): TurnClock {
  const player = state.players[state.currentPlayerIndex];
  if (!player) throw new Error("CURRENT_PLAYER_MISSING");
  if (state.turnStartedAt !== null && state.turnExpiresAt !== null) {
    return {
      turnId: state.turnId,
      playerId: player.playerId,
      turnStartedAt: state.turnStartedAt,
      turnExpiresAt: state.turnExpiresAt
    };
  }
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

export type TimeoutTransition = {
  state: GameState;
  events: readonly GameEvent[];
};

export function expireTurn(state: GameState, now: number, clock: TurnClock, rules: RuleSet): TimeoutTransition {
  if (state.phase !== "ACTIVE") throw new Error("GAME_NOT_ACTIVE");
  if (clock.turnId !== state.turnId) throw new Error("STALE_TURN");
  if (state.turnStartedAt === null || state.turnExpiresAt === null) throw new Error("TURN_CLOCK_MISSING");
  if (clock.turnStartedAt !== state.turnStartedAt || clock.turnExpiresAt !== state.turnExpiresAt) throw new Error("STALE_TURN_CLOCK");
  if (!isTurnExpired(clock, now)) throw new Error("TURN_NOT_EXPIRED");

  const currentPlayer = state.players[state.currentPlayerIndex]!;
  if ((currentPlayer.timebankRemainingMs ?? 0) > 0) {
    const extension = Math.min(currentPlayer.timebankRemainingMs ?? 0, rules.turnDurationMs);
    const players = state.players.map((candidate, index) => index === state.currentPlayerIndex ? { ...candidate, timebankRemainingMs: (candidate.timebankRemainingMs ?? 0) - extension } : candidate);
    return {
      state: { ...state, players, turnStartedAt: now, turnExpiresAt: now + extension, pendingRoll: null },
      events: [{ type: "TIMEBANK_USED", turnId: state.turnId, playerId: currentPlayer.playerId, milliseconds: extension }]
    };
  }

  const playerIndex = state.players.findIndex((player) => player.playerId === clock.playerId);
  if (playerIndex < 0) throw new Error("PLAYER_NOT_FOUND");

  const player = state.players[playerIndex]!;
  const missedTurns = player.consecutiveMissedTurns + 1;
  const eliminated = missedTurns >= rules.maxConsecutiveMissedTurns;

  const updatedPlayer = {
    ...player,
    consecutiveMissedTurns: missedTurns,
    eliminated
  };

  const players = state.players.map((candidate, index) =>
    index === playerIndex ? updatedPlayer : candidate
  );

  const events: Array<
    | { type: "TURN_EXPIRED"; turnId: number; playerId: PlayerId }
    | { type: "PLAYER_MISSED_TURN"; turnId: number; playerId: PlayerId; missedTurns: number }
    | { type: "PLAYER_ELIMINATED"; turnId: number; playerId: PlayerId }
    | { type: "TURN_ADVANCED"; turnId: number; playerId: PlayerId }
  > = [
    { type: "TURN_EXPIRED", turnId: state.turnId, playerId: player.playerId },
    { type: "PLAYER_MISSED_TURN", turnId: state.turnId, playerId: player.playerId, missedTurns }
  ];

  if (eliminated) {
    events.push({
      type: "PLAYER_ELIMINATED",
      turnId: state.turnId,
      playerId: player.playerId
    });
  }

  const remaining = players.filter((candidate) => !candidate.eliminated);
  if (remaining.length <= 1) {
    const winner = remaining[0];
    if (winner) {
      return {
        state: {
          ...state,
          players,
          phase: "FINISHED",
          winnerId: winner.playerId,
          pendingRoll: null,
          turnStartedAt: null,
          turnExpiresAt: null
        },
        events
      };
    }
  }

  const nextIndex = findNextEligibleIndex(players, playerIndex);
  if (nextIndex < 0) {
    return { state: { ...state, players, pendingRoll: null, turnStartedAt: null, turnExpiresAt: null }, events };
  }

  const nextTurnId = state.turnId + 1;
  const nextPlayer = players[nextIndex]!;
  events.push({
    type: "TURN_ADVANCED",
    turnId: nextTurnId,
    playerId: nextPlayer.playerId
  });

  return {
    state: {
      ...state,
      players,
      currentPlayerIndex: nextIndex,
      turnId: nextTurnId,
      consecutiveSixes: 0,
      pendingRoll: null,
      turnStartedAt: now,
      turnExpiresAt: now + rules.turnDurationMs
    },
    events
  };
}

function findNextEligibleIndex(
  players: GameState["players"],
  currentIndex: number
): number {
  for (let offset = 1; offset <= players.length; offset += 1) {
    const index = (currentIndex + offset) % players.length;
    if (!players[index]!.eliminated) return index;
  }
  return -1;
}
