import { describe, expect, it } from "vitest";
import {
  createGame,
  recordRoll,
  startGame,
  type GameState
} from "@portable-ludo/engine";
import type { GameStore } from "@portable-ludo/persistence";
import { GameSession } from "../src/game-session.js";

describe("GameSession recovery", () => {
  it("restores a persisted pending roll so a move can continue after reload", async () => {
    const started = startGame(createGame(["p1", "p2"], {
      name: "STANDARD",
      playerCounts: [2, 4],
      tokenCount: 4,
      trackLength: 52,
      homeLength: 6,
      yardProgress: -1,
      homeProgress: 57,
      safeSquares: [0, 8, 13, 21, 26, 34, 39, 47],
      turnDurationMs: 15_000,
      maxConsecutiveMissedTurns: 3,
      extraRollOnSix: true,
      extraRollOnCapture: true,
      extraRollOnHome: true,
      multipleExtraRollsCollapse: true,
      threeSixesGrantExtraRoll: false,
      allowStacking: true,
      blockSize: 2
    }));

    const rolled = recordRoll(started.state, 6, "p1");
    const persisted: GameState = rolled.state;

    let saved = false;
    const store = {
      saveTransition: async () => {
        saved = true;
        return 1;
      }
    } as unknown as GameStore;

    const session = GameSession.fromPersisted("game-1", persisted, 1, store);
    session.join("p1");

    const events = await session.move("p1", 0);

    expect(events.length).toBeGreaterThan(0);
    expect(session.getState().pendingRoll).toBeNull();
    expect(session.getVersion()).toBe(2);
    expect(saved).toBe(true);
    expect(session.getState().players[0]?.tokens[0]?.progress).toBe(0);
  });
});
