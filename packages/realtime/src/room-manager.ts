import { randomUUID } from "node:crypto";
import { GameSession } from "./game-session.js";

export class RoomManager {
  private readonly sessions = new Map<string, GameSession>();

  create(playerIds: readonly string[]): GameSession {
    const gameId = randomUUID();
    const session = new GameSession(gameId, playerIds);
    this.sessions.set(gameId, session);
    return session;
  }

  get(gameId: string): GameSession | undefined {
    return this.sessions.get(gameId);
  }
}
