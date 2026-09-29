import type { GameStore } from "@portable-ludo/persistence";
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
  private version: number;

  private constructor(
    gameId: string,
    playerIds: readonly PlayerId[],
    private readonly store: GameStore,
    version = 0
  ) {
    this.gameId = gameId;
    this.state = createGame(playerIds, STANDARD_RULES);
    this.players = playerIds.map((playerId) => ({ playerId, connected: false }));
    this.version = version;
  }

  static create(gameId: string, playerIds: readonly PlayerId[], store: GameStore): GameSession {
    return new GameSession(gameId, playerIds, store);
  }

  static fromPersisted(
    gameId: string,
    state: GameState,
    version: number,
    store: GameStore
  ): GameSession {
    const session = new GameSession(
      gameId,
      state.players.map((player) => player.playerId),
      store,
      version
    );
    assertGameInvariants(state, STANDARD_RULES);
    session.state = state;
    return session;
  }

  getVersion(): number {
    return this.version;
  }

  join(playerId: PlayerId): void {
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

  getState(): GameState {
    return this.state;
  }

  private async commit(nextState: GameState, events: readonly GameEvent[]): Promise<void> {
    assertGameInvariants(nextState, STANDARD_RULES);
    const nextVersion = await this.store.saveTransition(
      this.gameId,
      this.version,
      nextState,
      events
    );
    this.state = nextState;
    this.version = nextVersion;
  }

  async start(): Promise<readonly GameEvent[]> {
    const result = startGame(this.state);
    await this.commit(result.state, result.events);
    return result.events;
  }

  async roll(playerId: PlayerId): Promise<{ roll: number; events: readonly GameEvent[] }> {
    const result = recordRoll(this.state, rollDie(), playerId);
    await this.commit(result.state, result.events);
    this.rollStates.set(playerId, result.rollState);
    return { roll: result.rollState.value, events: result.events };
  }

  async move(playerId: PlayerId, tokenId: TokenId): Promise<readonly GameEvent[]> {
    const rollState = this.rollStates.get(playerId);
    if (!rollState) throw new Error("NO_PENDING_ROLL");

    const legal = getLegalMoves(this.state, playerId, rollState.value, STANDARD_RULES);
    if (!legal.includes(tokenId)) throw new Error("ILLEGAL_MOVE");

    const result = applyMove(this.state, rollState, tokenId, STANDARD_RULES);
    await this.commit(result.state, result.events);
    this.rollStates.delete(playerId);
    return result.events;
  }
}
