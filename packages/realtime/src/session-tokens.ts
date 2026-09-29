import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function issueSessionToken(playerId: string, secret: string, ttlSeconds = 3600): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const nonce = randomBytes(18).toString("base64url");
  const payload = `${playerId}.${expiresAt}.${nonce}`;
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string, secret: string): string {
  const parts = token.split(".");
  if (parts.length !== 4) throw new Error("INVALID_SESSION");
  const [playerId, expiryText, nonce, signature] = parts;
  const expiresAt = Number(expiryText);
  if (!playerId || !nonce || !Number.isSafeInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    throw new Error("INVALID_SESSION");
  }
  const payload = `${playerId}.${expiryText}.${nonce}`;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(signature ?? "", "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("INVALID_SESSION");
  return playerId;
}
