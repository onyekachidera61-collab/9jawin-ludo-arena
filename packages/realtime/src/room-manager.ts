import { randomUUID } from "node:crypto";
import { GameSession } from "./game-session.js";
import type { GameStore } from "@portable-ludo/persistence";

export class RoomManager {
  private readonly sessions = new Map<string, GameSession>();
  constructor(private readonly store: GameStore) {}
  async create(playerIds: readonly string[]): Promise<GameSession> {
    const gameId = randomUUID();
    const session = GameSession.create(gameId, playerIds, this.store);
    await this.store.createGame(gameId, session.snapshot().state, "STANDARD");
    for (let i = 0; i < playerIds.length; i += 1) await this.store.addGamePlayer(gameId, playerIds[i]!, i, playerIds[i]!);
    this.sessions.set(gameId, session);
    return session;
  }
  get(gameId: string): GameSession | undefined { return this.sessions.get(gameId); }
  async load(gameId: string): Promise<GameSession | undefined> {
    const persisted = await this.store.loadGame(gameId);
    if (!persisted) return undefined;
    const session = GameSession.fromPersisted(gameId, persisted.state, persisted.version, this.store);
    this.sessions.set(gameId, session);
    return session;
  }
}
