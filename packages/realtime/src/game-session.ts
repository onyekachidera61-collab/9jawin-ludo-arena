import {
  applyMove,
  assertGameInvariants,
  createGame,
  getLegalMoves,
  recordRoll,
  rollDie,
  startGame,
  STANDARD_RULES,
  type GameEvent,
  type GameState,
  type PlayerId,
  type RollState,
  type TokenId
} from "@portable-ludo/engine";

export type SessionPlayer = { playerId: PlayerId; connected: boolean };
export type SessionSnapshot = { gameId: string; state: GameState };

export class GameSession {
  readonly gameId: string;
  private state: GameState;
  private readonly players: SessionPlayer[];
  private readonly rollStates = new Map<PlayerId, RollState>();
  private version = 0;

  private constructor(gameId: string, playerIds: readonly PlayerId[]) {
    this.gameId = gameId;
    this.state = createGame(playerIds, STANDARD_RULES);
    this.players = playerIds.map((playerId) => ({ playerId, connected: false }));
  }

  static fromPersisted(gameId: string, state: GameState, version: number): GameSession {\n    const session = new GameSession(gameId, state.players.map((p) => p.playerId));\n    session.state = state;\n    session.version = version;\n    return session;\n  }\n\n  getVersion(): number { return this.version; }\n\n  replacePersistedVersion(version: number): void { this.version = version; }\n\n  join(playerId: PlayerId): void {
    const player = this.players.find((candidate) => candidate.playerId === playerId);
    if (!player) throw new Error("PLAYER_NOT_IN_GAME");
    player.connected = true;
  }

  disconnect(playerId: PlayerId): void {
    const player = this.players.find((candidate) => candidate.playerId === playerId);
    if (player) player.connected = false;
  }

  snapshot(): SessionSnapshot {
    return { gameId: this.gameId, state: this.state };
  }

  getState(): GameState { return this.state; }\n\n  start(): readonly GameEvent[] {
    const result = startGame(this.state);
    this.state = result.state;
    assertGameInvariants(this.state, STANDARD_RULES);
    return result.events;
  }

  roll(playerId: PlayerId): { roll: number; events: readonly GameEvent[] } {
    const result = recordRoll(this.state, rollDie(), playerId);
    this.state = result.state;
    this.rollStates.set(playerId, result.rollState);
    assertGameInvariants(this.state, STANDARD_RULES);
    return { roll: result.rollState.value, events: result.events };
  }

  move(playerId: PlayerId, tokenId: TokenId): readonly GameEvent[] {
    const rollState = this.rollStates.get(playerId);
    if (!rollState) throw new Error("NO_PENDING_ROLL");
    const legal = getLegalMoves(this.state, playerId, rollState.value, STANDARD_RULES);
    if (!legal.includes(tokenId)) throw new Error("ILLEGAL_MOVE");
    const result = applyMove(this.state, rollState, tokenId, STANDARD_RULES);
    this.state = result.state;
    this.rollStates.delete(playerId);
    assertGameInvariants(this.state, STANDARD_RULES);
    return result.events;
  }
}
