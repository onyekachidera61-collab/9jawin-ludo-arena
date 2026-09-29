import { randomUUID } from "node:crypto";
import { GameSession } from "./game-session.js";
import { createGame, startGame, STANDARD_RULES } from "@portable-ludo/engine";
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
  async createLobby(ownerPlayerId: string, displayName: string, playerCount: 2 | 4 = 2): Promise<{ id: string; code: string }> {
    const id = randomUUID();
    const code = `LUDO-${randomUUID().replaceAll("-", "").slice(0, 4).toUpperCase()}`;
    await this.store.createRoomWithOwner({ id, code, ownerPlayerId, ruleset: "STANDARD", playerCount, expiresAt: new Date(Date.now() + 30 * 60_000), displayName });
    return { id, code };
  }

  async getLobby(roomIdOrCode: string) {
    const room = await this.store.getRoom(roomIdOrCode);
    if (!room) return null;
    return { ...room, players: await this.store.getRoomPlayers(room.id) };
  }

  async joinLobby(roomIdOrCode: string, playerId: string, displayName: string) {
    const joined = await this.store.joinRoom(roomIdOrCode, playerId, displayName);
    if (!joined.shouldStart) return joined;

    const players = await this.store.getRoomPlayers(joined.room.id);
    const gameId = randomUUID();
    const waiting = createGame(players.map((p) => p.playerId), STANDARD_RULES);
    const started = startGame(waiting);
    await this.store.finalizeRoomGame(joined.room.id, gameId, started.state, "STANDARD", players);
    const session = GameSession.fromPersisted(gameId, started.state, 0, this.store);
    this.sessions.set(gameId, session);

    return {
      ...joined,
      room: { ...joined.room, status: "ACTIVE", gameId },
      gameId,
      state: started.state,
      events: started.events,
      players
    };
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
