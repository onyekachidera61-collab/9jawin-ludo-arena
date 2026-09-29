import { canMove, moveToken } from "./movement.js";
import { playerScore } from "./score.js";
import { absoluteTrackPosition, isSafeSquare } from "./board.js";
import { canLandAt } from "./occupancy.js";
import { STANDARD_RULES, type GameState, type PlayerId, type RuleSet, type TokenId, type PendingRoll } from "./types.js";


export type GameEvent =
  | { type: "GAME_STARTED"; turnId: number; playerId: PlayerId }
  | { type: "DICE_ROLLED"; turnId: number; playerId: PlayerId; roll: number }
  | { type: "TOKEN_MOVED"; turnId: number; playerId: PlayerId; tokenId: TokenId; distance: number }
  | { type: "TOKEN_CAPTURED"; turnId: number; playerId: PlayerId; tokenId: TokenId; capturedPlayerId: PlayerId; capturedTokenId: TokenId }
  | { type: "TOKEN_REACHED_HOME"; turnId: number; playerId: PlayerId; tokenId: TokenId }
  | { type: "EXTRA_ROLL_GRANTED"; turnId: number; playerId: PlayerId }
  | { type: "TURN_ADVANCED"; turnId: number; playerId: PlayerId }
  | { type: "GAME_FINISHED"; turnId: number; playerId: PlayerId }
  | { type: "TURN_EXPIRED"; turnId: number; playerId: PlayerId }
  | { type: "PLAYER_MISSED_TURN"; turnId: number; playerId: PlayerId; missedTurns: number }
  | { type: "PLAYER_ELIMINATED"; turnId: number; playerId: PlayerId }

export type RollState = {
  turnId: number;
  playerId: PlayerId;
  value: number;
  consecutiveSixes: number;
};

export type TransitionResult = {
  state: GameState;
  events: readonly GameEvent[];
};

export function createGame(playerIds: readonly PlayerId[], rules: RuleSet): GameState {
  if (!rules.playerCounts.includes(playerIds.length as 2 | 4)) {
    throw new Error("INVALID_PLAYER_COUNT");
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error("DUPLICATE_PLAYER");
  }

  return {
    phase: "WAITING",
    players: playerIds.map((playerId, colorIndex) => ({
      playerId,
      colorIndex,
      score: 0,
      consecutiveMissedTurns: 0,
      eliminated: false,
      tokens: [0, 1, 2, 3].map((tokenId) => ({
        tokenId: tokenId as 0 | 1 | 2 | 3,
        progress: rules.yardProgress,
        movementPoints: 0,
        homeMultiplierApplied: false
      }))
    })),
    currentPlayerIndex: 0,
    turnId: 0,
    consecutiveSixes: 0,
    winnerId: null,
    pendingRoll: null,
    turnStartedAt: null,
    turnExpiresAt: null
  };
}

export function startGame(state: GameState, rules: RuleSet = STANDARD_RULES, now = Date.now()): TransitionResult {
  if (state.phase !== "WAITING") throw new Error("GAME_NOT_WAITING");
  const player = state.players[state.currentPlayerIndex];
  if (!player) throw new Error("CURRENT_PLAYER_MISSING");

  return {
    state: {
      ...state,
      phase: "ACTIVE",
      turnId: 1,
      turnStartedAt: now,
      turnExpiresAt: now + rules.turnDurationMs
    },
    events: [{ type: "GAME_STARTED", turnId: 1, playerId: player.playerId }]
  };
}

export function recordRoll(
  state: GameState,
  roll: number,
  playerId: PlayerId
): TransitionResult & { rollState: RollState } {
  assertActiveTurn(state, playerId);
  if (!Number.isInteger(roll) || roll < 1 || roll > 6) throw new Error("INVALID_DICE");
  if (state.pendingRoll !== null) throw new Error("ROLL_ALREADY_PENDING");

  const consecutiveSixes = roll === 6 ? state.consecutiveSixes + 1 : 0;
  const pendingRoll: PendingRoll = { turnId: state.turnId, playerId, value: roll, consecutiveSixes };
  const nextState = { ...state, consecutiveSixes, pendingRoll };

  return {
    state: nextState,
    rollState: { turnId: state.turnId, playerId, value: roll, consecutiveSixes },
    events: [{ type: "DICE_ROLLED", turnId: state.turnId, playerId, roll }]
  };
}


export function getLegalMoves(state: GameState, playerId: PlayerId, roll: number, rules: RuleSet): readonly TokenId[] {
  assertActiveTurn(state, playerId);
  if (!Number.isInteger(roll) || roll < 1 || roll > 6) throw new Error("INVALID_DICE");
  const player = state.players[state.currentPlayerIndex]!;
  const legal: TokenId[] = [];
  for (const token of player.tokens) {
    if (!canMove(token, roll, rules)) continue;
    const moved = moveToken(player, token.tokenId, roll, rules);
    if (!moved.ok) continue;
    const tokens = player.tokens.map((candidate) => candidate.tokenId === token.tokenId ? moved.token : candidate);
    const projected = state.players.map((candidate, index) => index === state.currentPlayerIndex ? { ...candidate, tokens } : candidate);
    if (canLandAt(projected, player, moved.token, rules)) legal.push(token.tokenId);
  }
  return legal;
}

export function resolveNoLegalMove(
  state: GameState,
  rules: RuleSet
): TransitionResult {
  const pending = state.pendingRoll;
  if (!pending) throw new Error("ROLL_NOT_PENDING");

  if (pending.consecutiveSixes < 3 && rules.extraRollOnSix && pending.value === 6) {
    return {
      state: { ...state, pendingRoll: null },
      events: [{
        type: "EXTRA_ROLL_GRANTED",
        turnId: state.turnId,
        playerId: pending.playerId
      }]
    };
  }

  return advanceTurn({ ...state, pendingRoll: null }, rules);
}

export function applyMove(
  state: GameState,
  rollState: RollState,
  tokenId: TokenId,
  rules: RuleSet
): TransitionResult {
  assertActiveTurn(state, rollState.playerId);
  if (rollState.turnId !== state.turnId) throw new Error("STALE_TURN");
  if (rollState.consecutiveSixes !== state.consecutiveSixes) throw new Error("STALE_ROLL");
  if (!state.pendingRoll || state.pendingRoll.turnId !== rollState.turnId || state.pendingRoll.playerId !== rollState.playerId || state.pendingRoll.value !== rollState.value) throw new Error("ROLL_NOT_PENDING");

  const playerIndex = state.players.findIndex((p) => p.playerId === rollState.playerId);
  if (playerIndex < 0) throw new Error("PLAYER_NOT_FOUND");

  const player = state.players[playerIndex]!;
  const token = player.tokens.find((t) => t.tokenId === tokenId);
  if (!token || !canMove(token, rollState.value, rules)) {
    throw new Error("ILLEGAL_MOVE");
  }

  const moved = moveToken(player, tokenId, rollState.value, rules);
  if (!moved.ok) throw new Error(moved.reason);

  const tokens = player.tokens.map((candidate) =>
    candidate.tokenId === tokenId ? moved.token : candidate
  );
  const basePlayers = state.players.map((candidate, index) =>
    index === playerIndex ? { ...candidate, tokens } : candidate
  );
  let captured: { playerIndex: number; tokenIndex: number; playerId: PlayerId; tokenId: TokenId } | null = null;
  const movedTrack = absoluteTrackPosition(player, moved.token, rules);
  if (!canLandAt(basePlayers, player, moved.token, rules)) throw new Error("BLOCKED_DESTINATION");
  if (movedTrack !== null && !isSafeSquare(movedTrack, rules)) {
    for (let opponentIndex = 0; opponentIndex < basePlayers.length; opponentIndex += 1) {
      if (opponentIndex === playerIndex) continue;
      const opponent = basePlayers[opponentIndex]!;
      for (let tokenIndex = 0; tokenIndex < opponent.tokens.length; tokenIndex += 1) {
        const opponentToken = opponent.tokens[tokenIndex]!;
        const opponentTrack = absoluteTrackPosition(opponent, opponentToken, rules);
        if (opponentTrack === movedTrack && opponentToken.progress !== rules.yardProgress) {
          captured = {
            playerIndex: opponentIndex,
            tokenIndex,
            playerId: opponent.playerId,
            tokenId: opponentToken.tokenId
          };
          break;
        }
      }
      if (captured) break;
    }
  }

  const playersAfterCapture = captured
    ? basePlayers.map((candidate, index) => {
        if (index !== captured!.playerIndex) return candidate;
        return {
          ...candidate,
          tokens: candidate.tokens.map((candidateToken, index) =>
            index === captured!.tokenIndex
              ? { ...candidateToken, progress: rules.yardProgress }
              : candidateToken
          )
        };
      })
    : basePlayers;

  const updatedPlayer = {
    ...player,
    tokens,
    score: playerScore({ ...player, tokens })
  };

  const players = playersAfterCapture.map((candidate, index) =>
    index === playerIndex ? updatedPlayer : candidate
  );

  const events: GameEvent[] = [{

    type: "TOKEN_MOVED",
    turnId: state.turnId,
    playerId: player.playerId,
    tokenId,
    distance: moved.distance
  }];

  if (captured) {
    events.push({
      type: "TOKEN_CAPTURED",
      turnId: state.turnId,
      playerId: player.playerId,
      tokenId,
      capturedPlayerId: captured.playerId,
      capturedTokenId: captured.tokenId
    });
  }

  if (moved.token.progress === rules.homeProgress && !token.homeMultiplierApplied) {
    events.push({
      type: "TOKEN_REACHED_HOME",
      turnId: state.turnId,
      playerId: player.playerId,
      tokenId
    });
  }

  const finished = updatedPlayer.tokens.every((candidate) => candidate.progress === rules.homeProgress);
  if (finished) {
    return {
      state: {
        ...state,
        players,
        phase: "FINISHED",
        winnerId: player.playerId,
        pendingRoll: null,
        turnStartedAt: null,
        turnExpiresAt: null
      },
      events: [...events, {
        type: "GAME_FINISHED",
        turnId: state.turnId,
        playerId: player.playerId
      }]
    };
  }

  const grantsExtra =
    (rules.extraRollOnSix && rollState.value === 6) ||
    (rules.extraRollOnCapture && captured !== null) ||
    (rules.extraRollOnHome && events.some((event) => event.type === "TOKEN_REACHED_HOME"));
  if (grantsExtra && state.consecutiveSixes < 3) {
    return {
      state: { ...state, players, pendingRoll: null },
      events: [...events, {
        type: "EXTRA_ROLL_GRANTED",
        turnId: state.turnId,
        playerId: player.playerId
      }]
    };
  }

  return advanceTurn({ ...state, players, pendingRoll: null }, rules);
}

export function advanceTurn(state: GameState, rules: RuleSet, now = Date.now()): TransitionResult {
  const nextIndex = findNextEligiblePlayer(state, state.currentPlayerIndex);
  if (nextIndex < 0) {
    return { state, events: [] };
  }

  const nextPlayer = state.players[nextIndex]!;
  const turnId = state.turnId + 1;

  return {
    state: {
      ...state,
      currentPlayerIndex: nextIndex,
      turnId,
      consecutiveSixes: 0,
      turnStartedAt: now,
      turnExpiresAt: now + rules.turnDurationMs
    },
    events: [{
      type: "TURN_ADVANCED",
      turnId,
      playerId: nextPlayer.playerId
    }]
  };
}

function findNextEligiblePlayer(state: GameState, currentIndex: number): number {
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const index = (currentIndex + offset) % state.players.length;
    if (!state.players[index]!.eliminated) return index;
  }
  return -1;
}

function assertActiveTurn(state: GameState, playerId: PlayerId): void {
  if (state.phase !== "ACTIVE") throw new Error("GAME_NOT_ACTIVE");
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.playerId !== playerId || current.eliminated) {
    throw new Error("NOT_PLAYER_TURN");
  }
}
