import type { GameStore } from "@portable-ludo/persistence";
import {
  applyMove,
  assertGameInvariants,
  createGame,
  getLegalMoves,
  resolveNoLegalMove,
  createTurnClock,
  expireTurn,
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
  private commandTail: Promise<void> = Promise.resolve();

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
    if (state.pendingRoll) {
      session.rollStates.set(state.pendingRoll.playerId, {
        turnId: state.pendingRoll.turnId,
        playerId: state.pendingRoll.playerId,
        value: state.pendingRoll.value,
        consecutiveSixes: state.pendingRoll.consecutiveSixes
      });
    }
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

  private enqueue<T>(command: () => Promise<T>): Promise<T> {
    const run = this.commandTail.then(command, command);
    this.commandTail = run.then(() => undefined, () => undefined);
    return run;
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
    return this.enqueue(async () => {
      const result = startGame(this.state);
      await this.commit(result.state, result.events);
      return result.events;
    });
  }

  async roll(playerId: PlayerId): Promise<{ roll: number; events: readonly GameEvent[] }> {
    return this.enqueue(async () => {
      if (await this.expireIfNeeded(Date.now())) throw new Error("TURN_EXPIRED");
      const result = recordRoll(this.state, rollDie(), playerId);
      await this.commit(result.state, result.events);
      this.rollStates.set(playerId, result.rollState);
      return { roll: result.rollState.value, events: result.events };
    });
  }

  async move(playerId: PlayerId, tokenId: TokenId): Promise<readonly GameEvent[]> {
    return this.enqueue(async () => {
      if (this.expireIfNeeded(Date.now())) throw new Error("TURN_EXPIRED");
      const rollState = this.rollStates.get(playerId);
      if (!rollState) throw new Error("NO_PENDING_ROLL");

      const legal = getLegalMoves(this.state, playerId, rollState.value, STANDARD_RULES);
      if (!legal.includes(tokenId)) throw new Error("ILLEGAL_MOVE");

      const result = applyMove(this.state, rollState, tokenId, STANDARD_RULES);
      await this.commit(result.state, result.events);
      this.rollStates.delete(playerId);
      return result.events;
    });
  }

  async expireTurn(now = Date.now()): Promise<readonly GameEvent[]> {
    return this.enqueue(async () => {
      if (this.state.phase !== "ACTIVE" || this.state.turnStartedAt === null || this.state.turnExpiresAt === null) return [];
      if (now < this.state.turnExpiresAt) return [];
      const clock = createTurnClock(this.state, now, STANDARD_RULES);
      const result = expireTurn(this.state, now, clock, STANDARD_RULES);
      await this.commit(result.state, result.events);
      this.rollStates.clear();
      return result.events;
    });
  }

  private async expireIfNeeded(now: number): Promise<boolean> {
    if (this.state.phase !== "ACTIVE" || this.state.turnExpiresAt === null || now < this.state.turnExpiresAt) return false;
    const clock = createTurnClock(this.state, now, STANDARD_RULES);
    const result = expireTurn(this.state, now, clock, STANDARD_RULES);
    await this.commit(result.state, result.events);
    this.rollStates.clear();
    return true;
  }
}
