import { describe, expect, it } from "vitest";
import { STANDARD_RULES, createGame, createTurnClock, expireTurn, isTurnExpired, startGame } from "../src/index.js";

describe("turn clock", () => {
  it("uses the authoritative server timestamp and configured duration", () => {
    const state = startGame(createGame(["p1", "p2"], STANDARD_RULES), STANDARD_RULES, 1_000).state;
    const clock = createTurnClock(state, 999_999, STANDARD_RULES);
    expect(clock.turnStartedAt).toBe(1_000);
    expect(clock.turnExpiresAt).toBe(16_000);
    expect(clock.playerId).toBe("p1");
  });

  it("expires only at or after the server deadline", () => {
    const state = startGame(createGame(["p1", "p2"], STANDARD_RULES), STANDARD_RULES, 1_000).state;
    const clock = createTurnClock(state, 1_000, STANDARD_RULES);
    expect(isTurnExpired(clock, 15_999)).toBe(false);
    expect(isTurnExpired(clock, 16_000)).toBe(true);
  });
});

describe("turn expiry", () => {
  it("increments missed turns and advances to the next player", () => {
    const state = startGame(createGame(["p1", "p2"], STANDARD_RULES)).state;
    const clock = createTurnClock(state, 1_000, STANDARD_RULES);
    const result = expireTurn(state, 16_000, clock, STANDARD_RULES);

    expect(result.state.currentPlayerIndex).toBe(1);
    expect(result.state.turnId).toBe(2);
    expect(result.state.players[0]?.consecutiveMissedTurns).toBe(1);
    expect(result.state.players[0]?.eliminated).toBe(false);
    expect(result.events.map((event) => event.type)).toEqual([
      "TURN_EXPIRED",
      "PLAYER_MISSED_TURN",
      "TURN_ADVANCED"
    ]);
  });

  it("eliminates a player on the third consecutive missed turn", () => {
    let state = startGame(createGame(["p1", "p2"], STANDARD_RULES)).state;
    state = {
      ...state,
      players: state.players.map((player, index) =>
        index === 0 ? { ...player, consecutiveMissedTurns: 2 } : player
      )
    };
    const clock = createTurnClock(state, 1_000, STANDARD_RULES);
    const result = expireTurn(state, 16_000, clock, STANDARD_RULES);

    expect(result.state.players[0]?.consecutiveMissedTurns).toBe(3);
    expect(result.state.players[0]?.eliminated).toBe(true);
    expect(result.state.phase).toBe("FINISHED");
    expect(result.state.winnerId).toBe("p2");
    expect(result.events.map((event) => event.type)).toEqual([
      "TURN_EXPIRED",
      "PLAYER_MISSED_TURN",
      "PLAYER_ELIMINATED"
    ]);
  });

  it("rejects expiry before the authoritative deadline", () => {
    const state = startGame(createGame(["p1", "p2"], STANDARD_RULES)).state;
    const clock = createTurnClock(state, 1_000, STANDARD_RULES);
    expect(() => expireTurn(state, 15_999, clock, STANDARD_RULES)).toThrow("TURN_NOT_EXPIRED");
  });
});
