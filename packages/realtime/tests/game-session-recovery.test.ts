import { describe, expect, it } from "vitest";
import {
  createGame,
  recordRoll,
  startGame,
  STANDARD_RULES,
  type GameState
} from "@portable-ludo/engine";
import type { GameStore } from "@portable-ludo/persistence";
import { GameSession } from "../src/game-session.js";

describe("GameSession recovery", () => {
  it("restores a persisted pending roll so a move can continue after reload", async () => {
    const started = startGame(createGame(["p1", "p2"], STANDARD_RULES));
    const rolled = recordRoll(started.state, 6, "p1");
    const persisted: GameState = rolled.state;

    let saved = false;
    const store = {
      saveTransition: async () => {
        saved = true;
        return 2;
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
