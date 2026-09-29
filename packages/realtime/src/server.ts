import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { clientMessageSchema, type ClientMessage, type ServerMessage } from "./protocol.js";

const port = Number(process.env.PORT ?? 4000);
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
const connections = new Map<string, WebSocket>();

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

wss.on("connection", (socket) => {
  const connectionId = randomUUID();
  connections.set(connectionId, socket);

  socket.on("message", (raw) => {
    const parsed = (() => {
      try { return clientMessageSchema.parse(JSON.parse(raw.toString())); }
      catch { return null; }
    })();

    if (!parsed) {
      send(socket, { type: "ERROR", code: "INVALID_MESSAGE", message: "Invalid realtime message." });
      return;
    }

    if (parsed.type === "PING") send(socket, { type: "PONG" });
    else send(socket, { type: "ERROR", code: "NOT_IMPLEMENTED", message: "Game commands are not wired yet." });
  });

  socket.on("close", () => connections.delete(connectionId));
});

httpServer.listen(port, () => {
  console.log(JSON.stringify({ service: "portable-ludo-realtime", port }));
});
