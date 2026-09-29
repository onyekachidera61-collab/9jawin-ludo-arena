import type { PlayerState, RuleSet, TokenId, TokenState } from "./types.js";

export type MoveResult =
  | { ok: true; token: TokenState; distance: number }
  | { ok: false; reason: "NOT_IN_YARD" | "NEEDS_SIX" | "OVERSHOOT_HOME" | "ALREADY_HOME" };

export function isHome(token: TokenState, rules: RuleSet): boolean {
  return token.progress === rules.homeProgress;
}

export function canMove(token: TokenState, roll: number, rules: RuleSet): boolean {
  if (roll < 1 || roll > 6) return false;
  if (isHome(token, rules)) return false;
  if (token.progress === rules.yardProgress) return roll === 6;
  return token.progress + roll <= rules.homeProgress;
}

export function moveToken(
  player: PlayerState,
  tokenId: TokenId,
  roll: number,
  rules: RuleSet
): MoveResult {
  const token = player.tokens.find((candidate) => candidate.tokenId === tokenId);
  if (!token) return { ok: false, reason: "ALREADY_HOME" };
  if (isHome(token, rules)) return { ok: false, reason: "ALREADY_HOME" };
  if (token.progress === rules.yardProgress && roll !== 6) {
    return { ok: false, reason: "NEEDS_SIX" };
  }
  if (token.progress !== rules.yardProgress && token.progress < 0) {
    return { ok: false, reason: "NOT_IN_YARD" };
  }
  const nextProgress = token.progress === rules.yardProgress ? 0 : token.progress + roll;
  if (nextProgress > rules.homeProgress) {
    return { ok: false, reason: "OVERSHOOT_HOME" };
  }
  const distance = token.progress === rules.yardProgress ? 0 : roll;
  const next: TokenState = {
    ...token,
    progress: nextProgress,
    movementPoints: token.movementPoints + distance,
    homeMultiplierApplied: nextProgress === rules.homeProgress ? true : token.homeMultiplierApplied
  };
  return { ok: true, token: next, distance };
}
