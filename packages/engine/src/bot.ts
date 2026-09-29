import { getLegalMoves } from "./game.js";
import type { GameState, RuleSet, TokenId } from "./types.js";

export type BotDifficulty = "EASY"|"NORMAL"|"HARD";

export function chooseBotMove(state: GameState, roll: number, rules: RuleSet, difficulty: BotDifficulty): TokenId {
  const legal = [...getLegalMoves(state, state.players[state.currentPlayerIndex]!.playerId, roll, rules)];
  if (legal.length===0) throw new Error("NO_LEGAL_BOT_MOVE");
  if (difficulty==="EASY") return legal[Math.floor(Math.random()*legal.length)]!;
  const player=state.players[state.currentPlayerIndex]!;
  const ranked=legal.map(tokenId=>({tokenId,progress:player.tokens.find(t=>t.tokenId===tokenId)!.progress}));
  ranked.sort((a,b)=>difficulty==="HARD"?b.progress-a.progress:a.progress-b.progress);
  return ranked[0]!.tokenId;
}
