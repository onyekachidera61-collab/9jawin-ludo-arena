import { describe, expect, it } from "vitest";
import { STANDARD_RULES, canLandAt, createGame, getOccupancy } from "../src/index.js";

describe("occupancy rules", () => {
  it("allows a single opponent on a non-safe square", () => {
    const state = createGame(["p1", "p2"], STANDARD_RULES);
    const p1 = state.players[0]!;
    const p2 = { ...state.players[1]!, tokens: state.players[1]!.tokens.map((token, index) => index === 0 ? { ...token, progress: 39 } : token) };
    const moving = { ...p1, tokens: p1.tokens.map((token, index) => index === 0 ? { ...token, progress: 39 } : token) };
    const occupancy = getOccupancy([moving, p2], moving, moving.tokens[0]!, STANDARD_RULES);
    expect(occupancy?.opponentCount).toBe(1);
    expect(canLandAt([moving, p2], moving, moving.tokens[0]!, STANDARD_RULES)).toBe(true);
  });

  it("blocks landing at the configured block size", () => {
    const state = createGame(["p1", "p2"], STANDARD_RULES);
    const p1 = state.players[0]!;
    const p2 = { ...state.players[1]!, tokens: state.players[1]!.tokens.map((token, index) => index < 2 ? { ...token, progress: 39 } : token) };
    const moving = { ...p1, tokens: p1.tokens.map((token, index) => index === 0 ? { ...token, progress: 39 } : token) };
    expect(canLandAt([moving, p2], moving, moving.tokens[0]!, STANDARD_RULES)).toBe(false);
  });

  it("permits landing on safe squares", () => {
    const state = createGame(["p1", "p2"], STANDARD_RULES);
    const p1 = state.players[0]!;
    const p2 = { ...state.players[1]!, tokens: state.players[1]!.tokens.map((token, index) => index === 0 ? { ...token, progress: 0 } : token) };
    const moving = { ...p1, tokens: p1.tokens.map((token, index) => index === 0 ? { ...token, progress: 0 } : token) };
    expect(canLandAt([moving, p2], moving, moving.tokens[0]!, STANDARD_RULES)).toBe(true);
  });
});
