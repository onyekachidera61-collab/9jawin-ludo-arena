import { randomInt } from "node:crypto";

export function rollDie(): number {
  return randomInt(1, 7);
}
