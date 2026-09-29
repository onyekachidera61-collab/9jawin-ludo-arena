import { absoluteTrackPosition, isSafeSquare } from "./board.js";
import type { PlayerState, RuleSet, TokenState } from "./types.js";

export type Occupancy = {
  absolute: number;
  ownCount: number;
  opponentCount: number;
  opponentPlayerIds: readonly string[];
  opponentTokenCount: number;
};

export function getOccupancy(players: readonly PlayerState[], movingPlayer: PlayerState, token: TokenState, rules: RuleSet): Occupancy | null {
  const absolute = absoluteTrackPosition(movingPlayer, token, rules);
  if (absolute === null) return null;
  let ownCount = 0;
  let opponentCount = 0;
  const opponentPlayerIds: string[] = [];
  for (const player of players) {
    for (const candidate of player.tokens) {
      if (absoluteTrackPosition(player, candidate, rules) !== absolute) continue;
      if (player.playerId === movingPlayer.playerId) ownCount += 1;
      else {
        opponentCount += 1;
        if (!opponentPlayerIds.includes(player.playerId)) opponentPlayerIds.push(player.playerId);
      }
    }
  }
  return { absolute, ownCount, opponentCount, opponentPlayerIds, opponentTokenCount: opponentCount };
}

export function canLandAt(players: readonly PlayerState[], movingPlayer: PlayerState, token: TokenState, rules: RuleSet): boolean {
  const occupancy = getOccupancy(players, movingPlayer, token, rules);
  if (!occupancy) return true;
  if (isSafeSquare(occupancy.absolute, rules)) return true;
  if (occupancy.opponentCount === 0) return true;
  if (occupancy.opponentCount >= rules.blockSize) return false;
  return rules.allowStacking || occupancy.ownCount === 0;
}
