import { describe, expect, it } from "vitest";
import { STANDARD_RULES, canMove, moveToken, playerScore } from "../src/index.js";
import type { PlayerState } from "../src/index.js";

const player: PlayerState = {
  playerId: "p1",
  colorIndex: 0,
  score: 0,
  consecutiveMissedTurns: 0,
  eliminated: false,
  tokens: [
    { tokenId: 0, progress: -1, movementPoints: 0, homeMultiplierApplied: false },
    { tokenId: 1, progress: 0, movementPoints: 3, homeMultiplierApplied: false },
    { tokenId: 2, progress: 56, movementPoints: 56, homeMultiplierApplied: false },
    { tokenId: 3, progress: 57, movementPoints: 20, homeMultiplierApplied: true }
  ]
};

describe("standard movement", () => {
  it("requires six to leave the yard", () => {
    expect(canMove(player.tokens[0]!, 5, STANDARD_RULES)).toBe(false);
    expect(canMove(player.tokens[0]!, 6, STANDARD_RULES)).toBe(true);
  });

  it("does not award a fake entry bonus", () => {
    const result = moveToken(player, 0, 6, STANDARD_RULES);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.distance).toBe(0);
      expect(result.token.progress).toBe(0);
      expect(result.token.movementPoints).toBe(0);
    }
  });

  it("awards one point per advanced square", () => {
    const result = moveToken(player, 1, 4, STANDARD_RULES);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.token.movementPoints).toBe(7);
  });

  it("doubles a token exactly once on home", () => {
    const result = moveToken(player, 2, 1, STANDARD_RULES);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.token.progress).toBe(57);
      expect(result.token.homeMultiplierApplied).toBe(true);
      expect(playerScore({ ...player, tokens: [result.token, player.tokens[1]!, player.tokens[3]!, player.tokens[0]!] })).toBe(154);
    }
  });

  it("rejects overshooting home", () => {
    expect(canMove(player.tokens[2]!, 2, STANDARD_RULES)).toBe(false);
  });
});
