import { describe, expect, it } from "vitest";
import { clientMessageSchema } from "./protocol.js";

describe("realtime protocol", () => {
  it("accepts authenticated matchmaking commands", () => {
    expect(clientMessageSchema.parse({
      type: "MATCHMAKING_JOIN",
      ruleset: "STANDARD",
      playerCount: 2,
      playerId: "player-1",
      displayName: "Player One",
      sessionToken: "x".repeat(32)
    }).type).toBe("MATCHMAKING_JOIN");
  });
});
