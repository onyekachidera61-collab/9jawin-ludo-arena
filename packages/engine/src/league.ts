import { randomInt } from "node:crypto";
import type { RuleSet } from "./types.js";

export const LEAGUE_RULES: RuleSet & { timebankMs: number; outcomeCount: number } = {
  name: "LEAGUE",
  playerCounts: [2,4],
  tokenCount: 4,
  trackLength: 52,
  homeLength: 6,
  yardProgress: -1,
  homeProgress: 57,
  safeSquares: [0,8,13,21,26,34,39,47],
  turnDurationMs: 15_000,
  maxConsecutiveMissedTurns: 3,
  extraRollOnSix: false,
  extraRollOnCapture: false,
  extraRollOnHome: false,
  multipleExtraRollsCollapse: true,
  threeSixesGrantExtraRoll: false,
  allowStacking: true,
  blockSize: 2,
  timebankMs: 60_000,
  outcomeCount: 36
};

export type LeagueDie = { sequence:number; value:1|2|3|4|5|6 };

export function createLeagueDeck(): readonly LeagueDie[] {
  const deck:Array<1|2|3|4|5|6>=[];
  for (const value of [1,2,3,4,5,6] as const) for(let i=0;i<6;i++) deck.push(value);
  for(let i=deck.length-1;i>0;i--){const j=randomInt(i+1);[deck[i],deck[j]]=[deck[j]!,deck[i]!];}
  return deck.map((value,index)=>({sequence:index+1,value}));
}

export function validateLeagueDeck(deck: readonly LeagueDie[]): void {
  if(deck.length!==36) throw new Error("INVALID_LEAGUE_DECK_LENGTH");
  for(const value of [1,2,3,4,5,6] as const) if(deck.filter(d=>d.value===value).length!==6) throw new Error("INVALID_LEAGUE_DECK_DISTRIBUTION");
  if(new Set(deck.map(d=>d.sequence)).size!==36) throw new Error("INVALID_LEAGUE_SEQUENCE");
}
