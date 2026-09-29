import { describe, expect, it } from "vitest";
import { STANDARD_RULES, applyMove, createGame, recordRoll, startGame } from "../src/index.js";

describe("game transitions", () => {
  it("starts with the first player's turn", () => {
    const initial = createGame(["p1", "p2"], STANDARD_RULES);
    const started = startGame(initial);
    expect(started.state.phase).toBe("ACTIVE");
    expect(started.state.turnId).toBe(1);
    expect(started.events[0]?.type).toBe("GAME_STARTED");
  });

  it("rejects a roll from the wrong player", () => {
    const started = startGame(createGame(["p1", "p2"], STANDARD_RULES));
    expect(() => recordRoll(started.state, 6, "p2")).toThrow("NOT_PLAYER_TURN");
  });

  it("allows a six to move a yard token onto the start square", () => {
    const started = startGame(createGame(["p1", "p2"], STANDARD_RULES));
    const rolled = recordRoll(started.state, 6, "p1");
    const moved = applyMove(rolled.state, rolled.rollState, 0, STANDARD_RULES);
    expect(moved.state.players[0]?.tokens[0]?.progress).toBe(0);
    expect(moved.events.some((event) => event.type === "EXTRA_ROLL_GRANTED")).toBe(true);
  });

  it("captures an opponent on a non-safe shared square", () => {
    let state = startGame(createGame(["p1", "p2"], STANDARD_RULES)).state;
    state = {
      ...state,
      players: state.players.map((player, index) =>
        index === 1
          ? {
              ...player,
              tokens: player.tokens.map((token, tokenIndex) =>
                tokenIndex === 0 ? { ...token, progress: 39, movementPoints: 39 } : token
              )
            }
          : player
      )
    };
    const rolled = recordRoll(state, 6, "p1");
    const moved = applyMove(rolled.state, rolled.rollState, 0, STANDARD_RULES);
    expect(moved.state.players[1]?.tokens[0]?.progress).toBe(-1);
    expect(moved.events.some((event) => event.type === "TOKEN_CAPTURED")).toBe(true);
    expect(moved.events.some((event) => event.type === "EXTRA_ROLL_GRANTED")).toBe(true);
  });

  it("does not grant an extra roll after three consecutive sixes", () => {
    let state = startGame(createGame(["p1", "p2"], STANDARD_RULES)).state;
    state = { ...state, consecutiveSixes: 2 };
    const rolled = recordRoll(state, 6, "p1");
    const moved = applyMove(rolled.state, rolled.rollState, 0, STANDARD_RULES);
    expect(moved.events.some((event) => event.type === "EXTRA_ROLL_GRANTED")).toBe(false);
    expect(moved.events.some((event) => event.type === "TURN_ADVANCED")).toBe(true);
  });
  it("rejects landing on a configured opponent block", () => {
    let state = startGame(createGame(["p1", "p2"], STANDARD_RULES)).state;
    state = {
      ...state,
      players: state.players.map((player, index) =>
        index === 1
          ? {
              ...player,
              tokens: player.tokens.map((token, tokenIndex) =>
                tokenIndex < 2 ? { ...token, progress: 39 } : token
              )
            }
          : player
      )
    };
    const rolled = recordRoll(state, 6, "p1");
    expect(() => applyMove(rolled.state, rolled.rollState, 0, STANDARD_RULES)).toThrow("BLOCKED_DESTINATION");
  });

});
