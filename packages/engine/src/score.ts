import type { PlayerState } from "./types.js";

export function tokenScore(movementPoints: number, homeMultiplierApplied: boolean): number {
  return homeMultiplierApplied ? movementPoints * 2 : movementPoints;
}

export function playerScore(player: PlayerState): number {
  return player.tokens.reduce(
    (total, token) => total + tokenScore(token.movementPoints, token.homeMultiplierApplied),
    0
  );
}
