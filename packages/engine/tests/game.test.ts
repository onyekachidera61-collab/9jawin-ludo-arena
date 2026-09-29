import { describe, expect, it } from "vitest";
import { STANDARD_RULES, applyMove, createGame, getLegalMoves, recordRoll, startGame } from "../src/index.js";

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

  it("enumerates only legal tokens for a roll", async () => {
    const state = startGame(createGame(["p1", "p2"], STANDARD_RULES)).state;
    expect(getLegalMoves(state, "p1", 6, STANDARD_RULES)).toEqual([0, 1, 2, 3]);
  });

  it("rejects stale roll state", () => {
    const state = startGame(createGame(["p1", "p2"], STANDARD_RULES)).state;
    const rolled = recordRoll(state, 6, "p1");
    expect(() => applyMove(
      { ...rolled.state, turnId: rolled.state.turnId + 1 },
      rolled.rollState,
      0,
      STANDARD_RULES
    )).toThrow("STALE_TURN");
  });

  it("rejects a roll whose six counter no longer matches state", () => {
    const state = startGame(createGame(["p1", "p2"], STANDARD_RULES)).state;
    const rolled = recordRoll(state, 6, "p1");
    expect(() => applyMove(
      { ...rolled.state, consecutiveSixes: 0 },
      rolled.rollState,
      0,
      STANDARD_RULES
    )).toThrow("STALE_ROLL");
  });

  it("respects disabled extra-roll configuration", () => {
    const rules = { ...STANDARD_RULES, extraRollOnSix: false };
    const state = startGame(createGame(["p1", "p2"], rules)).state;
    const rolled = recordRoll(state, 6, "p1");
    const moved = applyMove(rolled.state, rolled.rollState, 0, rules);
    expect(moved.events.some((event) => event.type === "EXTRA_ROLL_GRANTED")).toBe(false);
  });

});
