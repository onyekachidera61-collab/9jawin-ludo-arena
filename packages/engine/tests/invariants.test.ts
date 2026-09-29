import { describe, expect, it } from "vitest";
import { STANDARD_RULES, assertGameInvariants, createGame, startGame } from "../src/index.js";

describe("game invariants", () => {
  it("accepts a newly started valid game", () => {
    const state = startGame(createGame(["p1", "p2"], STANDARD_RULES)).state;
    expect(() => assertGameInvariants(state, STANDARD_RULES)).not.toThrow();
  });

  it("rejects duplicate player ids", () => {
    const state = startGame(createGame(["p1", "p2"], STANDARD_RULES)).state;
    expect(() => assertGameInvariants({ ...state, players: [state.players[0]!, state.players[0]!] }, STANDARD_RULES)).toThrow("DUPLICATE_PLAYER");
  });

  it("rejects a score mismatch", () => {
    const state = startGame(createGame(["p1", "p2"], STANDARD_RULES)).state;
    expect(() => assertGameInvariants({ ...state, players: state.players.map((p,i)=>i===0?{...p,score:99}:p) }, STANDARD_RULES)).toThrow("SCORE_INVARIANT");
  });
});
