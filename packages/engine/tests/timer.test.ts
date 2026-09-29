import { describe, expect, it } from "vitest";
import { STANDARD_RULES, createGame, createTurnClock, isTurnExpired, startGame } from "../src/index.js";

describe("turn clock", () => {
  it("uses the authoritative server timestamp and configured duration", () => {
    const state = startGame(createGame(["p1", "p2"], STANDARD_RULES)).state;
    const clock = createTurnClock(state, 1_000, STANDARD_RULES);
    expect(clock.turnStartedAt).toBe(1_000);
    expect(clock.turnExpiresAt).toBe(16_000);
    expect(clock.playerId).toBe("p1");
  });

  it("expires only at or after the server deadline", () => {
    const state = startGame(createGame(["p1", "p2"], STANDARD_RULES)).state;
    const clock = createTurnClock(state, 1_000, STANDARD_RULES);
    expect(isTurnExpired(clock, 15_999)).toBe(false);
    expect(isTurnExpired(clock, 16_000)).toBe(true);
  });
});
