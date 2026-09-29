import { describe, expect, it } from "vitest";
import { createGame, recordRoll, startGame, STANDARD_RULES } from "@portable-ludo/engine";
import type { GameStore } from "@portable-ludo/persistence";
import { GameSession } from "./game-session.js";

function fakeStore() {
  return {
    saveTransition: async (_id: string, expectedVersion: number, _state: unknown, events: readonly unknown[]) =>
      expectedVersion + events.length
  } as unknown as GameStore;
}

describe("GameSession recovery", () => {
  it("restores a pending roll after reconstruction", async () => {
    const started = startGame(createGame(["p1", "p2"], STANDARD_RULES), STANDARD_RULES, 10_000);
    const rolled = recordRoll(started.state, 6, "p1");
    const session = GameSession.fromPersisted("game-1", rolled.state, 2, fakeStore());

    const events = await session.move("p1", 0);

    expect(events.some((event) => event.type === "TOKEN_MOVED")).toBe(true);
    expect(session.getVersion()).toBe(4);
  });
});
