import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { clientMessageSchema, type ClientMessage, type ServerMessage } from "./protocol.js";
import { RoomManager } from "./room-manager.js";
import { issueSessionToken, verifySessionToken } from "./session-tokens.js";
import type { TokenId } from "@portable-ludo/engine";
import { createPool, GameStore } from "@portable-ludo/persistence";

const port = Number(process.env.PORT ?? 4000);
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer, maxPayload: 16 * 1024 });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const store = new GameStore(createPool(databaseUrl));
const rooms = new RoomManager(store);
const socketsByPlayer = new Map<string, WebSocket>();

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function errorMessage(error: unknown): ServerMessage {
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  return { type: "ERROR", code, message: code };
}

function broadcast(gameId: string, message: ServerMessage): void {
  for (const [connectedPlayerId, socket] of socketsByPlayer) {
    const session = rooms.get(gameId);
    if (!session) continue;
    if (session.snapshot().state.players.some((p) => p.playerId === connectedPlayerId)) send(socket, message);
  }
}

wss.on("connection", (socket) => {
  let playerId: string | null = null;
  let gameId: string | null = null;

  socket.on("message", async (raw) => {
    let parsed: ClientMessage;
    try {
      parsed = clientMessageSchema.parse(JSON.parse(raw.toString()));
    } catch {
      send(socket, { type: "ERROR", code: "INVALID_MESSAGE", message: "Invalid realtime message." });
      return;
    }

    try {
      if (parsed.type === "PING") {
        send(socket, { type: "PONG" });
        return;
      }

      if (parsed.type === "JOIN") {
        const tokenPlayerId = verifySessionToken(parsed.sessionToken, sessionSecret);
        if (tokenPlayerId !== parsed.playerId) throw new Error("SESSION_PLAYER_MISMATCH");
        const session = rooms.get(parsed.roomId) ?? await rooms.load(parsed.roomId);
        if (!session) throw new Error("GAME_NOT_FOUND");
        if (!(await store.isGameMember(parsed.roomId, parsed.playerId))) throw new Error("NOT_GAME_MEMBER");
        session.join(parsed.playerId);
        playerId = parsed.playerId;
        gameId = parsed.roomId;
        socketsByPlayer.set(playerId, socket);
        send(socket, { type: "STATE", gameId, state: session.snapshot().state });
        return;
      }

      if (parsed.type === "RECONNECT") {
        const tokenPlayerId = verifySessionToken(parsed.sessionToken, sessionSecret);
        if (tokenPlayerId !== playerId && playerId !== null) throw new Error("SESSION_PLAYER_MISMATCH");
        const session = rooms.get(parsed.gameId) ?? await rooms.load(parsed.gameId);
        if (!session) throw new Error("GAME_NOT_FOUND");
        if (!(await store.isGameMember(parsed.gameId, tokenPlayerId))) throw new Error("NOT_GAME_MEMBER");
        session.join(tokenPlayerId);
        playerId = tokenPlayerId;
        gameId = parsed.gameId;
        socketsByPlayer.set(playerId, socket);
        send(socket, { type: "STATE", gameId, state: session.snapshot().state });
        return;
      }

      if (!playerId || !gameId) throw new Error("NOT_JOINED");
      const session = rooms.get(gameId);
      if (!session) throw new Error("GAME_NOT_FOUND");

      if (parsed.type === "ROLL") {
        const result = await session.roll(playerId);
        broadcast(gameId, { type: "DICE_ROLLED", gameId, turnId: session.snapshot().state.turnId, playerId, roll: result.roll });
        broadcast(gameId, { type: "EVENTS", gameId, events: result.events });
        broadcast(gameId, { type: "STATE", gameId, state: session.snapshot().state });
        return;
      }

      if (parsed.type === "MOVE") {
        const events = await session.move(playerId, parsed.tokenId as TokenId);
        broadcast(gameId, { type: "EVENTS", gameId, events });
        broadcast(gameId, { type: "STATE", gameId, state: session.snapshot().state });
      }
    } catch (error) {
      send(socket, errorMessage(error));
    }
  });

  socket.on("close", () => {
    if (playerId) socketsByPlayer.delete(playerId);
    if (playerId && gameId) rooms.get(gameId)?.disconnect(playerId);
  });
});

httpServer.listen(port, () => {
  console.log(JSON.stringify({ service: "portable-ludo-realtime", port }));
});
