import { randomUUID } from "node:crypto";
import { GameSession } from "./game-session.js";
import { createRoom, addRoomPlayer, getRoom, getRoomPlayers, type GameStore } from "@portable-ludo/persistence";

export class RoomManager {
  private readonly sessions = new Map<string, GameSession>();

  constructor(private readonly store: GameStore) {}

  async create(playerIds: readonly string[]): Promise<GameSession> {
    const gameId = randomUUID();
    const session = GameSession.create(gameId, playerIds, this.store);
    await this.store.createGame(gameId, session.snapshot().state, "STANDARD");
    for (let i = 0; i < playerIds.length; i += 1) {
      await this.store.addGamePlayer(gameId, playerIds[i]!, i, playerIds[i]!);
    }
    this.sessions.set(gameId, session);
    return session;
  }

  async createLobby(ownerPlayerId: string, displayName: string, playerCount: 2 | 4 = 2): Promise<{ id: string; code: string }> {
    const id = randomUUID();
    const code = `LUDO-${randomUUID().replaceAll("-", "").slice(0, 4).toUpperCase()}`;
    await createRoom(this.store["pool"], { id, code, ownerPlayerId, ruleset: "STANDARD", playerCount, expiresAt: new Date(Date.now() + 30 * 60_000) });
    await addRoomPlayer(this.store["pool"], id, ownerPlayerId, 0, displayName);
    return { id, code };
  }

  async lobby(roomIdOrCode: string): Promise<{ id: string; code: string; playerCount: number; status: string; players: Awaited<ReturnType<typeof getRoomPlayers>> } | null> {
    const room = await getRoom(this.store["pool"], roomIdOrCode);
    if (!room) return null;
    return { id: room.id, code: room.code, playerCount: room.playerCount, status: room.status, players: await getRoomPlayers(this.store["pool"], room.id) };
  }

  get(gameId: string): GameSession | undefined {
    return this.sessions.get(gameId);
  }

  async load(gameId: string): Promise<GameSession | undefined> {
    const persisted = await this.store.loadGame(gameId);
    if (!persisted) return undefined;
    const session = GameSession.fromPersisted(gameId, persisted.state, persisted.version, this.store);
    this.sessions.set(gameId, session);
    return session;
  }
}
