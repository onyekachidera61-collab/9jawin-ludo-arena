import type { PlayerState, RuleSet, TokenId, TokenState } from "./types.js";

export const PLAYER_START_OFFSETS = [0, 13, 26, 39] as const;

export type BoardPosition =
  | { kind: "YARD" }
  | { kind: "TRACK"; absolute: number }
  | { kind: "HOME_LANE"; progress: number }
  | { kind: "HOME" };

export function boardPosition(player: PlayerState, token: TokenState, rules: RuleSet): BoardPosition {
  if (token.progress === rules.yardProgress) return { kind: "YARD" };
  if (token.progress === rules.homeProgress) return { kind: "HOME" };
  if (token.progress < rules.trackLength) {
    const start = PLAYER_START_OFFSETS[player.colorIndex as 0 | 1 | 2 | 3];
    if (start === undefined) throw new Error("INVALID_PLAYER_COLOR");
    return { kind: "TRACK", absolute: (start + token.progress) % rules.trackLength };
  }
  return { kind: "HOME_LANE", progress: token.progress };
}

export function absoluteTrackPosition(
  player: PlayerState,
  token: TokenState,
  rules: RuleSet
): number | null {
  const position = boardPosition(player, token, rules);
  return position.kind === "TRACK" ? position.absolute : null;
}

export function isSafeSquare(absolute: number, rules: RuleSet): boolean {
  return rules.safeSquares.includes(absolute);
}

export function legalTokenIds(player: PlayerState, roll: number, rules: RuleSet): TokenId[] {
  return player.tokens
    .filter((token) => token.progress !== rules.homeProgress)
    .filter((token) => {
      if (token.progress === rules.yardProgress) return roll === 6;
      return token.progress + roll <= rules.homeProgress;
    })
    .map((token) => token.tokenId);
}
