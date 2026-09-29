import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { clientMessageSchema, type ClientMessage, type ServerMessage } from "./protocol.js";
import { RoomManager } from "./room-manager.js";
import { issueSessionToken, verifySessionToken, verifySessionTokenClaims } from "./session-tokens.js";
import { chooseBotMove, STANDARD_RULES, LEAGUE_RULES, verifyReplay, type TokenId, type GameEvent } from "@portable-ludo/engine";
import { createPool, GameStore } from "@portable-ludo/persistence";

const port = Number(process.env.PORT ?? 4000);
const sessionSecret = process.env.SESSION_SECRET;
const webOrigin = process.env.WEB_ORIGIN ?? "*";
const guestRequestLog = new Map<string, number[]>();
if (!sessionSecret || sessionSecret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");

const httpServer = createServer(async (req, res) => {
  res.setHeader("access-control-allow-origin", webOrigin);
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type, authorization");
  res.setHeader("x-content-type-options","nosniff");
  res.setHeader("x-frame-options","DENY");
  res.setHeader("referrer-policy","no-referrer");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (req.url === "/health" && req.method === "GET") {
    try {
      await store.ping();
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ status: "ok", database: "ok" }));
    } catch {
      res.writeHead(503, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ status: "degraded", database: "unavailable" }));
    }
    return;
  }

  if (req.url?.startsWith("/room-status?") && req.method === "GET") {
    try {
      const query = new URL(req.url, "http://localhost").searchParams;
      const roomId = query.get("room");
      if (!roomId || roomId.length > 64) throw new Error("INVALID_ROOM");
      const lobby = await rooms.getLobby(roomId);
      if (!lobby) throw new Error("ROOM_NOT_FOUND");
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(lobby));
    } catch (error) {
      const code = error instanceof Error ? error.message : "ROOM_STATUS_FAILED";
      res.writeHead(code === "ROOM_NOT_FOUND" ? 404 : 400, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ error: code }));
    }
    return;
  }

  if (req.url === "/guest-session" && req.method === "POST") {
    try {
      const address = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
      const now = Date.now();
      const recent = (guestRequestLog.get(address) ?? []).filter((timestamp) => now - timestamp < 60_000);
      if (recent.length >= 10) throw new Error("RATE_LIMITED");
      recent.push(now);
      guestRequestLog.set(address, recent);
      if (guestRequestLog.size > 5000) for (const [key,timestamps] of guestRequestLog) { if (timestamps.length===0 || now-timestamps[timestamps.length-1]!>120000) guestRequestLog.delete(key); }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) { const buffer = Buffer.from(chunk); size += buffer.length; if (size > 4096) throw new Error("REQUEST_TOO_LARGE"); chunks.push(buffer); }
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
      const status = code === "INVALID_DISPLAY_NAME" || code === "REQUEST_TOO_LARGE" ? 400 : code === "RATE_LIMITED" ? 429 : 500;
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ error: code }));
      return;
    }
  }

  if (req.url?.startsWith("/leaderboard") && req.method === "GET") {
    try {
      const query = new URL(req.url, "http://localhost").searchParams;
      const limit = Number(query.get("limit") ?? 100);
      const entries = await store.getLeaderboard(Number.isFinite(limit) ? limit : 100);
      res.writeHead(200, {"content-type":"application/json","cache-control":"no-store"});
      res.end(JSON.stringify({entries}));
    } catch {
      res.writeHead(500, {"content-type":"application/json"});
      res.end(JSON.stringify({error:"LEADERBOARD_UNAVAILABLE"}));
    }
    return;
  }

  if (req.url?.startsWith("/replay?") && req.method === "GET") {
    try {
      const query = new URL(req.url, "http://localhost").searchParams;
      const gameId = query.get("game");
      if (!gameId || gameId.length > 64) throw new Error("INVALID_GAME");
      const game = await store.loadGame(gameId);
      if (!game || game.phase !== "FINISHED") throw new Error("REPLAY_NOT_AVAILABLE");
      const events = await store.listGameEvents(gameId);
      const snapshots = await store.listGameSnapshots(gameId);
      const replayRules = game.ruleset === "LEAGUE" ? LEAGUE_RULES : STANDARD_RULES;
      const replayEvents = events.map((event) => event.payload as GameEvent);
      const audit = verifyReplay(replayEvents, snapshots, replayRules);
      res.writeHead(200, {"content-type":"application/json","cache-control":"no-store"});
      res.end(JSON.stringify({gameId,ruleset:game.ruleset,audit,events,snapshots}));
    } catch (error) {
      const code=error instanceof Error?error.message:"REPLAY_FAILED";
      res.writeHead(code==="REPLAY_NOT_AVAILABLE"?404:400,{"content-type":"application/json"});
      res.end(JSON.stringify({error:code}));
    }
    return;
  }

  if (req.url?.startsWith("/admin/game?") && req.method === "GET") {
    const expected = process.env.ADMIN_SECRET;
    const authorization = req.headers.authorization ?? "";
    if (!expected || authorization !== `Bearer ${expected}`) {
      res.writeHead(401,{"content-type":"application/json"});
      res.end(JSON.stringify({error:"ADMIN_UNAUTHORIZED"}));
      return;
    }
    try {
      const query = new URL(req.url, "http://localhost").searchParams;
      const gameId = query.get("game");
      if (!gameId || gameId.length > 64) throw new Error("INVALID_GAME");
      const game = await store.loadGame(gameId);
      if (!game) throw new Error("GAME_NOT_FOUND");
      const events = await store.listGameEvents(gameId);
      await store.writeAdminAudit("admin","GAME_READ",gameId,{});
      res.writeHead(200,{"content-type":"application/json","cache-control":"no-store"});
      res.end(JSON.stringify({game,events}));
    } catch (error) {
      const code=error instanceof Error?error.message:"ADMIN_GAME_FAILED";
      res.writeHead(code==="GAME_NOT_FOUND"?404:400,{"content-type":"application/json"});
      res.end(JSON.stringify({error:code}));
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer, maxPayload: 16 * 1024 });
const socketRequestLog = new WeakMap<WebSocket,{started:number;count:number}>();
const MAX_SOCKET_MESSAGES_PER_WINDOW = 60;
const SOCKET_WINDOW_MS = 10_000;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const store = new GameStore(createPool(databaseUrl));
const rooms = new RoomManager(store);
const socketsByPlayer = new Map<string, WebSocket>();
const lobbySockets = new Map<string, Map<string, WebSocket>>();
const botGames = new Map<string, { botIds: Set<string>; difficulty: "EASY"|"NORMAL"|"HARD" }>();

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

wss.on("connection", (socket, request) => {
  const origin = request.headers.origin;
  if (webOrigin !== "*" && origin !== webOrigin) {
    socket.close(1008, "ORIGIN_NOT_ALLOWED");
    return;
  }
  let playerId: string | null = null;
  let gameId: string | null = null;

  socket.on("message", async (raw) => {
    const now = Date.now();
    const bucket = socketRequestLog.get(socket);
    if (!bucket || now-bucket.started>=SOCKET_WINDOW_MS) socketRequestLog.set(socket,{started:now,count:1});
    else { bucket.count += 1; if (bucket.count > MAX_SOCKET_MESSAGES_PER_WINDOW) { send(socket,{type:"ERROR",code:"RATE_LIMITED",message:"Too many realtime commands."}); return; } }
    let parsed: ClientMessage;
    try {
      parsed = clientMessageSchema.parse(JSON.parse(raw.toString()));
    } catch {
      send(socket, { type: "ERROR", code: "INVALID_MESSAGE", message: "Invalid realtime message." });
      return;
    }

    try {
      if (parsed.type === "CREATE_BOT_GAME") {
        const claims = verifySessionTokenClaims(parsed.sessionToken, sessionSecret);
        const guest = await store.getGuestSession(claims.playerId, claims.nonce);
        if (!guest) throw new Error("INVALID_SESSION");
        const botCount = parsed.playerCount - 1;
        const botIds = Array.from({length:botCount},()=>`bot-${randomUUID()}`);
        const session = await rooms.create([guest.playerId, ...botIds], STANDARD_RULES);
        await store.markBotGame(session.gameId, parsed.difficulty);
        session.join(guest.playerId);
        for (const botId of botIds) session.join(botId);
        const events = await session.start();
        playerId = guest.playerId;
        gameId = session.gameId;
        socketsByPlayer.set(guest.playerId, socket);
        send(socket, { type: "MATCHMAKING_STATUS", status: "MATCHED", gameId: session.gameId });
        send(socket, { type: "EVENTS", gameId: session.gameId, events });
        send(socket, { type: "STATE", gameId: session.gameId, state: session.snapshot().state });
        botGames.set(session.gameId, { botIds: new Set(botIds), difficulty: parsed.difficulty });
        return;
      }

      if (parsed.type === "PING") {
        send(socket, { type: "PONG" });
        return;
      }

      if (parsed.type === "CREATE_ROOM") {
        const claims = verifySessionTokenClaims(parsed.sessionToken, sessionSecret);
        const guest = await store.getGuestSession(claims.playerId, claims.nonce);
        if (!guest) throw new Error("INVALID_SESSION");

        const roomOptions = Object.fromEntries(Object.entries({ turnDurationMs: parsed.turnDurationMs, botSlots: parsed.botSlots, botDifficulty: parsed.botDifficulty }).filter(([, value]) => value !== undefined)) as { turnDurationMs?: number; botSlots?: number; botDifficulty?: "EASY" | "NORMAL" | "HARD" };
        const room = await rooms.createLobby(guest.playerId, guest.displayName, parsed.playerCount, parsed.ruleset, roomOptions);
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
        if ((result.players ?? []).some((p: any) => String(p.playerId).startsWith("bot-"))) botGames.set(result.gameId, { botIds: new Set((result.players ?? []).filter((p: any) => String(p.playerId).startsWith("bot-")).map((p: any) => String(p.playerId))), difficulty: activeLobby.botDifficulty === "EASY" || activeLobby.botDifficulty === "HARD" ? activeLobby.botDifficulty : "NORMAL" });
        send(socket, { type: "STATE", gameId: result.gameId, state: session.snapshot().state });
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

      if (parsed.type === "MATCHMAKING_JOIN" || parsed.type === "MATCHMAKING_CANCEL") {
        const claims = verifySessionTokenClaims(parsed.sessionToken, sessionSecret);
        if (claims.playerId !== parsed.playerId) throw new Error("SESSION_PLAYER_MISMATCH");
        const guest = await store.getGuestSession(claims.playerId, claims.nonce);
        if (!guest) throw new Error("INVALID_SESSION");
        if (parsed.type === "MATCHMAKING_JOIN" && guest.displayName !== parsed.displayName) throw new Error("INVALID_SESSION");
        if (parsed.type === "MATCHMAKING_CANCEL") {
          await store.cancelMatchmaking(parsed.playerId, parsed.ruleset, parsed.playerCount);
          send(socket, { type: "MATCHMAKING_STATUS", status: "CANCELLED" } as ServerMessage);
          return;
        }
        const match = await store.enqueueMatchmaking(parsed.playerId, parsed.displayName, parsed.ruleset, parsed.playerCount);
        if (!match.matched) {
          playerId = parsed.playerId;
          gameId = null;
          socketsByPlayer.set(playerId, socket);
          send(socket, { type: "MATCHMAKING_STATUS", status: "WAITING", playerCount: parsed.playerCount, ruleset: parsed.ruleset });
          return;
        }
        const session = await rooms.create(match.playerIds, parsed.ruleset === "LEAGUE" ? LEAGUE_RULES : STANDARD_RULES);
        await session.start();
        playerId = parsed.playerId;
        gameId = session.gameId;
        for (const matchedPlayerId of match.playerIds) {
          const matchedSocket = socketsByPlayer.get(matchedPlayerId);
          if (matchedSocket) {
            session.join(matchedPlayerId);
            send(matchedSocket, { type: "MATCHMAKING_STATUS", status: "MATCHED", gameId: session.gameId } as ServerMessage);
            send(matchedSocket, { type: "STATE", gameId: session.gameId, state: session.snapshot().state });
          }
        }
        socketsByPlayer.set(playerId, socket);
        session.join(playerId);
        send(socket, { type: "MATCHMAKING_STATUS", status: "MATCHED", gameId: session.gameId } as ServerMessage);
        send(socket, { type: "STATE", gameId: session.gameId, state: session.snapshot().state });
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
      if (error instanceof Error && error.message === "TURN_EXPIRED" && gameId) {
        const session = rooms.get(gameId);
        if (session) {
          send(socket, { type: "STATE", gameId, state: session.snapshot().state });
          broadcast(gameId, { type: "STATE", gameId, state: session.snapshot().state });
        }
      }
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
  const recoveredBots = await store.listActiveBotGames();
  for (const bot of recoveredBots) {
    const session = rooms.get(bot.gameId);
    if (!session) continue;
    const botIds = new Set(session.snapshot().state.players.filter((player) => player.playerId.startsWith("bot-")).map((player) => player.playerId));
    if (botIds.size) botGames.set(bot.gameId, { botIds, difficulty: bot.difficulty });
  }

  setInterval(async () => {
    try {
      for (const [botGameId, bot] of botGames) {
        const session = rooms.get(botGameId);
        if (!session || session.snapshot().state.phase !== "ACTIVE") { botGames.delete(botGameId); continue; }
        const state = session.snapshot().state;
        const current = state.players[state.currentPlayerIndex];
        if (!current || !bot.botIds.has(current.playerId)) continue;
        try {
          if (!state.pendingRoll) {
            const result = await session.roll(current.playerId);
            broadcast(botGameId,{type:"DICE_ROLLED",gameId:botGameId,turnId:state.turnId,playerId:current.playerId,roll:result.roll});
            broadcast(botGameId,{type:"EVENTS",gameId:botGameId,events:result.events});
          } else {
            const tokenId = chooseBotMove(state,state.pendingRoll.value,STANDARD_RULES,bot.difficulty);
            const events = await session.move(current.playerId,tokenId as TokenId);
            broadcast(botGameId,{type:"EVENTS",gameId:botGameId,events});
          }
          broadcast(botGameId,{type:"STATE",gameId:botGameId,state:session.snapshot().state});
        } catch (error) {
          console.error(JSON.stringify({service:"portable-ludo-realtime",botError:error instanceof Error?error.message:"UNKNOWN_BOT_ERROR",gameId:botGameId}));
        }
      }

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
