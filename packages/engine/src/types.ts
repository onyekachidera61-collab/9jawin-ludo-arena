export type PlayerId = string;
export type TokenId = 0 | 1 | 2 | 3;

export type TokenState = {
  tokenId: TokenId;
  progress: number;
  movementPoints: number;
  homeMultiplierApplied: boolean;
};

export type PlayerState = {
  playerId: PlayerId;
  colorIndex: number;
  tokens: readonly TokenState[];
  score: number;
  consecutiveMissedTurns: number;
  eliminated: boolean;
  timebankRemainingMs?: number;
};

export type GamePhase = "WAITING" | "ACTIVE" | "FINISHED";

export type PendingRoll = {
  turnId: number;
  playerId: PlayerId;
  value: number;
  consecutiveSixes: number;
};

export type GameState = {
  phase: GamePhase;
  players: readonly PlayerState[];
  currentPlayerIndex: number;
  turnId: number;
  consecutiveSixes: number;
  winnerId: PlayerId | null;
  pendingRoll: PendingRoll | null;
  turnStartedAt: number | null;
  turnExpiresAt: number | null;
  moveCount?: number;
  leagueDeck?: readonly number[];
  leagueDeckIndex?: number;
};

export type RuleSet = {
  name: "STANDARD" | "LEAGUE";
  playerCounts: readonly (2 | 4)[];
  tokenCount: 4;
  trackLength: 52;
  homeLength: 6;
  yardProgress: -1;
  homeProgress: number;
  safeSquares: readonly number[];
  turnDurationMs: number;
  maxConsecutiveMissedTurns: number;
  extraRollOnSix: boolean;
  extraRollOnCapture: boolean;
  extraRollOnHome: boolean;
  multipleExtraRollsCollapse: true;
  threeSixesGrantExtraRoll: false;
  allowStacking: boolean;
  blockSize: number;
  timebankMs?: number;
};

export const STANDARD_RULES: RuleSet = {
  name: "STANDARD",
  playerCounts: [2, 4],
  tokenCount: 4,
  trackLength: 52,
  homeLength: 6,
  yardProgress: -1,
  homeProgress: 57,
  safeSquares: [0, 8, 13, 21, 26, 34, 39, 47],
  turnDurationMs: 15_000,
  maxConsecutiveMissedTurns: 3,
  extraRollOnSix: true,
  extraRollOnCapture: true,
  extraRollOnHome: true,
  multipleExtraRollsCollapse: true,
  threeSixesGrantExtraRoll: false,
  allowStacking: true,
  blockSize: 2,
  timebankMs: 0
};
