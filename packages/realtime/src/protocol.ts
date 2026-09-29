import { z } from "zod";

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PING") }),
  z.object({ type: z.literal("CREATE_ROOM"), playerCount: z.union([z.literal(2), z.literal(4)]), sessionToken: z.string().min(16).max(512) }),
  z.object({ type: z.literal("JOIN"), roomId: z.string().min(1).max(64), playerId: z.string().min(1).max(128), sessionToken: z.string().min(16).max(512) }),
  z.object({ type: z.literal("ROOM_JOIN"), roomId: z.string().min(1).max(64), playerId: z.string().min(1).max(128), displayName: z.string().min(3).max(20), sessionToken: z.string().min(16).max(512) }),
  z.object({ type: z.literal("ROLL") }),
  z.object({ type: z.literal("MOVE"), tokenId: z.number().int().min(0).max(3) }),
  z.object({ type: z.literal("RECONNECT"), gameId: z.string().min(1).max(64), sessionToken: z.string().min(16).max(512) })
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ServerMessage =
  | { type: "PONG" }
  | { type: "ROOM_JOINED"; room: unknown; players: readonly unknown[]; gameId: string | null }
  | { type: "ERROR"; code: string; message: string }
  | { type: "STATE"; gameId: string; state: unknown }
  | { type: "DICE_ROLLED"; gameId: string; turnId: number; playerId: string; roll: number }
  | { type: "EVENTS"; gameId: string; events: readonly unknown[] };
