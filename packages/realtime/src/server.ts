import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { clientMessageSchema, type ClientMessage, type ServerMessage } from "./protocol.js";
import { RoomManager } from "./room-manager.js";
import { issueSessionToken, verifySessionToken, verifySessionTokenClaims } from "./session-tokens.js";
import type { TokenId } from "@portable-ludo/engine";
import { createPool, GameStore } from "@portable-ludo/persistence";

const port = Number(process.env.PORT ?? 4000);
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");

const httpServer = createServer(async (req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (req.url === "/guest-session" && req.method === "POST") {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as { displayName?: unknown };
      const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
      if (displayName.length < 3 || displayName.length > 20) throw new Error("INVALID_DISPLAY_NAME");

      const playerId = randomUUID();
      const sessionId = randomUUID();
      const token = issueSessionToken(playerId, sessionSecret);
      const claims = verifySessionTokenClaims(token, sessionSecret);
      const expiresAt = new Date(claims.expiresAt * 1000);
      await store.createGuestSession(sessionId, playerId, displayName, claims.nonce, expiresAt);

      res.writeHead(201, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ playerId, displayName, sessionToken: token, expiresAt: expiresAt.toISOString() }));
      return;
    } catch (error) {
      const code = error instanceof Error ? error.message : "INVALID_REQUEST";
      const status = code === "INVALID_DISPLAY_NAME" ? 400 : 500;
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ error: code }));
      return;
    }
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
const lobbySockets = new Map<string, Map<string, WebSocket>>();

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

      if (parsed.type === "CREATE_ROOM") {
        const claims = verifySessionTokenClaims(parsed.sessionToken, sessionSecret);
        const guest = await store.getGuestSession(claims.playerId, claims.nonce);
        if (!guest) throw new Error("INVALID_SESSION");

        const room = await rooms.createLobby(guest.playerId, guest.displayName, parsed.playerCount);
        playerId = guest.playerId;
        gameId = null;

        let members = lobbySockets.get(room.id);
        if (!members) {
          members = new Map<string, WebSocket>();
          lobbySockets.set(room.id, members);
        }
        members.set(guest.playerId, socket);

        const lobby = await rooms.getLobby(room.id);
        send(socket, {
          type: "ROOM_JOINED",
          room: lobby,
          players: lobby?.players ?? [],
          gameId: null
        });
        return;
      }

      if (parsed.type === "ROOM_JOIN") {
        const claims = verifySessionTokenClaims(parsed.sessionToken, sessionSecret);
        if (claims.playerId !== parsed.playerId) throw new Error("SESSION_PLAYER_MISMATCH");
        const guest = await store.getGuestSession(claims.playerId, claims.nonce);
        if (!guest) throw new Error("INVALID_SESSION");
        if (guest.displayName !== parsed.displayName) throw new Error("SESSION_DISPLAY_NAME_MISMATCH");
        const result = await rooms.joinLobby(parsed.roomId, parsed.playerId, parsed.displayName);
        if (!result.gameId) {
          const lobby = await rooms.getLobby(result.room.id);
          send(socket, { type: "ROOM_JOINED", room: lobby, players: lobby?.players ?? [], gameId: null });
          const existingSocket = socketsByPlayer.get(parsed.playerId);
          if (existingSocket && existingSocket !== socket && existingSocket.readyState === existingSocket.OPEN) {
            try {
              existingSocket.close(4001, "REPLACED_BY_ROOM_JOIN");
            } catch {
              // The authoritative socket mapping below still replaces the stale connection.
            }
          }
          let members = lobbySockets.get(result.room.id);
          if (!members) {
            members = new Map<string, WebSocket>();
            lobbySockets.set(result.room.id, members);
          }
          members.set(parsed.playerId, socket);
          return;
        }

        const session = rooms.get(result.gameId);
        if (!session) throw new Error("GAME_NOT_FOUND");

        const activeLobby = await rooms.getLobby(result.room.id);
        if (!activeLobby || activeLobby.gameId !== result.gameId || activeLobby.status !== "ACTIVE") {
          throw new Error("ACTIVE_LOBBY_NOT_CONFIRMED");
        }

        const members = lobbySockets.get(result.room.id) ?? new Map<string, WebSocket>();
        members.set(parsed.playerId, socket);
        for (const lobbyPlayer of result.players ?? []) {
          const waitingSocket = members.get(lobbyPlayer.playerId);
          if (!waitingSocket) continue;
          session.join(lobbyPlayer.playerId);
          send(waitingSocket, {
            type: "ROOM_JOINED",
            room: activeLobby,
            players: result.players ?? [],
            gameId: result.gameId
          });
          send(waitingSocket, { type: "STATE", gameId: result.gameId, state: session.snapshot().state });
          socketsByPlayer.set(lobbyPlayer.playerId, waitingSocket);
        }
        lobbySockets.delete(result.room.id);

        playerId = parsed.playerId;
        gameId = result.gameId;
        socketsByPlayer.set(playerId, socket);
        session.join(playerId);
        send(socket, { type: "ROOM_JOINED", room: activeLobby, players: result.players ?? [], gameId: result.gameId });
        send(socket, { type: "STATE", gameId, state: session.snapshot().state });
        return;
      }

      if (parsed.type === "JOIN") {
        const claims = verifySessionTokenClaims(parsed.sessionToken, sessionSecret);
        if (claims.playerId !== parsed.playerId) throw new Error("SESSION_PLAYER_MISMATCH");
        if (!(await store.getGuestSession(claims.playerId, claims.nonce))) throw new Error("INVALID_SESSION");
        const session = rooms.get(parsed.roomId) ?? await rooms.load(parsed.roomId);
        if (!session) throw new Error("GAME_NOT_FOUND");
        if (!(await store.isGameMember(parsed.roomId, parsed.playerId))) throw new Error("NOT_GAME_MEMBER");
        const existingSocket = socketsByPlayer.get(parsed.playerId);
        if (existingSocket && existingSocket !== socket && existingSocket.readyState === existingSocket.OPEN) {
          try {
            existingSocket.close(4001, "REPLACED_BY_JOIN");
          } catch {
            // The authoritative socket mapping below still replaces the stale connection.
          }
        }
        session.join(parsed.playerId);
        playerId = parsed.playerId;
        gameId = parsed.roomId;
        socketsByPlayer.set(playerId, socket);
        send(socket, { type: "STATE", gameId, state: session.snapshot().state });
        return;
      }

      if (parsed.type === "RECONNECT") {
        const claims = verifySessionTokenClaims(parsed.sessionToken, sessionSecret);
        const tokenPlayerId = claims.playerId;
        if (tokenPlayerId !== playerId && playerId !== null) throw new Error("SESSION_PLAYER_MISMATCH");
        if (!(await store.getGuestSession(claims.playerId, claims.nonce))) throw new Error("INVALID_SESSION");
        const session = rooms.get(parsed.gameId) ?? await rooms.load(parsed.gameId);
        if (!session) throw new Error("GAME_NOT_FOUND");
        if (!(await store.isGameMember(parsed.gameId, tokenPlayerId))) throw new Error("NOT_GAME_MEMBER");
        const existingSocket = socketsByPlayer.get(tokenPlayerId);
        if (existingSocket && existingSocket !== socket && existingSocket.readyState === existingSocket.OPEN) {
          try {
            existingSocket.close(4001, "REPLACED_BY_RECONNECT");
          } catch {
            // The authoritative socket mapping below still replaces the stale connection.
          }
        }
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
    const isAuthoritativeSocket = playerId ? socketsByPlayer.get(playerId) === socket : false;
    if (playerId && isAuthoritativeSocket) socketsByPlayer.delete(playerId);
    if (playerId && gameId && isAuthoritativeSocket) rooms.get(gameId)?.disconnect(playerId);
    for (const [roomId, members] of lobbySockets) {
      for (const [lobbyPlayerId, lobbySocket] of members) {
        if (lobbySocket === socket) members.delete(lobbyPlayerId);
      }
      if (members.size === 0) lobbySockets.delete(roomId);
    }
  });
});

async function bootstrap(): Promise<void> {
  await rooms.recoverActiveGames();

  setInterval(async () => {
    try {
      const expired = await rooms.expireTurns(Date.now());
      for (const transition of expired) {
        broadcast(transition.gameId, {
          type: "EVENTS",
          gameId: transition.gameId,
          events: transition.events
        });
        const session = rooms.get(transition.gameId);
        if (session) {
          broadcast(transition.gameId, {
            type: "STATE",
            gameId: transition.gameId,
            state: session.snapshot().state
          });
        }
      }
    } catch (error) {
      console.error(JSON.stringify({
        service: "portable-ludo-realtime",
        timerError: error instanceof Error ? error.message : "UNKNOWN_TIMER_ERROR"
      }));
    }
  }, 250);

  httpServer.listen(port, () => {
    console.log(JSON.stringify({ service: "portable-ludo-realtime", port }));
  });
}

bootstrap().catch((error) => {
  console.error(JSON.stringify({
    service: "portable-ludo-realtime",
    startupError: error instanceof Error ? error.message : "UNKNOWN_STARTUP_ERROR"
  }));
});
