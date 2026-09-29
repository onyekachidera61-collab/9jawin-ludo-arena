import { randomInt } from "node:crypto";

export const LEAGUE_RULES = {
  name: "LEAGUE" as const,
  turnDurationMs: 15_000,
  timebankMs: 60_000,
  outcomeCount: 36,
  values: [1, 2, 3, 4, 5, 6] as const
};

export type LeagueDie = { sequence: number; value: 1|2|3|4|5|6 };

export function createLeagueDeck(): readonly LeagueDie[] {
  const deck: Array<1|2|3|4|5|6> = [];
  for (const value of LEAGUE_RULES.values) for (let i=0;i<6;i++) deck.push(value);
  for (let i=deck.length-1;i>0;i--) {
    const j=randomInt(i+1);
    [deck[i],deck[j]]=[deck[j]!,deck[i]!];
  }
  return deck.map((value,index)=>({sequence:index+1,value}));
}

export function validateLeagueDeck(deck: readonly LeagueDie[]): void {
  if (deck.length !== 36) throw new Error("INVALID_LEAGUE_DECK_LENGTH");
  const counts = new Map<number,number>();
  for (const die of deck) counts.set(die.value,(counts.get(die.value)??0)+1);
  for (const value of LEAGUE_RULES.values) if (counts.get(value)!==6) throw new Error("INVALID_LEAGUE_DECK_DISTRIBUTION");
  if (new Set(deck.map(d=>d.sequence)).size !== 36) throw new Error("INVALID_LEAGUE_SEQUENCE");
}
