import { describe, expect, it } from "vitest";
import {
  STANDARD_RULES,
  absoluteTrackPosition,
  boardPosition,
  createGame,
  legalTokenIds
} from "../src/index.js";

describe("board topology", () => {
  it("maps each player start to a distinct shared-track square", () => {
    const state = createGame(["p1", "p2", "p3", "p4"], STANDARD_RULES);
    expect(STANDARD_RULES.safeSquares).toEqual([0, 8, 13, 21, 26, 34, 39, 47]);
    expect(state.players.map((player) =>
      absoluteTrackPosition(player, { ...player.tokens[0]!, progress: 0 }, STANDARD_RULES)
    )).toEqual([0, 13, 26, 39]);
  });

  it("maps progress zero to each player's start square", () => {
    const state = createGame(["p1", "p2", "p3", "p4"], STANDARD_RULES);
    const players = state.players.map((player) => ({
      ...player,
      tokens: player.tokens.map((token) => ({ ...token, progress: 0 }))
    }));
    expect(players.map((player) =>
      absoluteTrackPosition(player, player.tokens[0]!, STANDARD_RULES)
    )).toEqual([0, 13, 26, 39]);
  });

  it("separates shared track, home lane, home and yard", () => {
    const state = createGame(["p1", "p2"], STANDARD_RULES);
    const player = state.players[0]!;
    const token = player.tokens[0]!;
    expect(boardPosition(player, token, STANDARD_RULES).kind).toBe("YARD");
    expect(boardPosition(player, { ...token, progress: 10 }, STANDARD_RULES).kind).toBe("TRACK");
    expect(boardPosition(player, { ...token, progress: 55 }, STANDARD_RULES).kind).toBe("HOME_LANE");
    expect(boardPosition(player, { ...token, progress: 57 }, STANDARD_RULES).kind).toBe("HOME");
  });

  it("returns only legal tokens for a roll", () => {
    const state = createGame(["p1", "p2"], STANDARD_RULES);
    const player = {
      ...state.players[0]!,
      tokens: state.players[0]!.tokens.map((token, index) =>
        index === 0 ? { ...token, progress: 51 } : index === 1 ? { ...token, progress: 56 } : token
      )
    };
    expect(legalTokenIds(player, 1, STANDARD_RULES)).toEqual([1]);
    expect(legalTokenIds(player, 6, STANDARD_RULES)).toEqual([0, 2, 3]);
  });
});
