import { Pool, type PoolClient } from "pg";
import type { GameEvent, GameState } from "@portable-ludo/engine";

export type PersistedGame = {
  id: string;
  phase: GameState["phase"];
  ruleset: string;
  state: GameState;
  version: number;
};

export class GameStore {
  constructor(private readonly pool: Pool) {}

  async createGame(id: string, state: GameState, ruleset: string): Promise<void> {
    await this.pool.query(
      "INSERT INTO games (id, phase, ruleset, state_json, version) VALUES ($1,$2,$3,$4,0)",
      [id, state.phase, ruleset, JSON.stringify(state)]
    );
  }

  async loadGame(id: string): Promise<PersistedGame | null> {
    const result = await this.pool.query(
      "SELECT id, phase, ruleset, state_json, version FROM games WHERE id=$1",
      [id]
    );
    const row = result.rows[0] as { id:string; phase:GameState["phase"]; ruleset:string; state_json:GameState; version:string } | undefined;
    if (!row) return null;
    return { id: row.id, phase: row.phase, ruleset: row.ruleset, state: row.state_json, version: Number(row.version) };
  }

  async saveTransition(id: string, expectedVersion: number, state: GameState, events: readonly GameEvent[]): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (events.length === 0) throw new Error("EMPTY_TRANSITION");
      const nextVersion = expectedVersion + events.length;
      const updated = await client.query(
        "UPDATE games SET phase=$2,state_json=$3,version=$4,updated_at=now() WHERE id=$1 AND version=$5 RETURNING version",
        [id, state.phase, JSON.stringify(state), nextVersion, expectedVersion]
      );
      if (updated.rowCount !== 1) throw new Error("GAME_VERSION_CONFLICT");
      let sequence = expectedVersion;
      for (const event of events) {
        sequence += 1;
        await client.query(
          "INSERT INTO game_events (game_id,sequence_number,event_type,player_id,payload) VALUES ($1,$2,$3,$4,$5)",
          [id, sequence, event.type, "playerId" in event ? event.playerId : null, JSON.stringify(event)]
        );
      }
      await client.query("COMMIT");
      return nextVersion;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export function createPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl, max: 10, idleTimeoutMillis: 30_000 });
}

export type GuestSession = {
  sessionId: string;
  playerId: string;
  displayName: string;
  sessionTokenNonce: string;
  expiresAt: Date;
};

export async function createGuestSession(
  pool: Pool,
  sessionId: string,
  playerId: string,
  displayName: string,
  sessionTokenNonce: string,
  expiresAt: Date
): Promise<void> {
  await pool.query(
    "INSERT INTO guest_sessions (session_id,player_id,display_name,session_token_nonce,expires_at) VALUES ($1,$2,$3,$4,$5)",
    [sessionId, playerId, displayName, sessionTokenNonce, expiresAt]
  );
}

export async function getGuestSession(pool: Pool, playerId: string): Promise<GuestSession | null> {
  const result = await pool.query(
    "SELECT session_id,player_id,display_name,session_token_nonce,expires_at FROM guest_sessions WHERE player_id=$1 AND expires_at > now()",
    [playerId]
  );
  const row = result.rows[0] as {
    session_id:string; player_id:string; display_name:string; session_token_nonce:string; expires_at:Date
  } | undefined;
  return row ? {
    sessionId: row.session_id,
    playerId: row.player_id,
    displayName: row.display_name,
    sessionTokenNonce: row.session_token_nonce,
    expiresAt: row.expires_at
  } : null;
}

export async function addGamePlayer(
  pool: Pool,
  gameId: string,
  playerId: string,
  slotIndex: number,
  displayName: string
): Promise<void> {
  await pool.query(
    "INSERT INTO game_players (game_id,player_id,slot_index,display_name) VALUES ($1,$2,$3,$4)",
    [gameId, playerId, slotIndex, displayName]
  );
}

export async function isGameMember(pool: Pool, gameId: string, playerId: string): Promise<boolean> {
  const result = await pool.query(
    "SELECT 1 FROM game_players WHERE game_id=$1 AND player_id=$2",
    [gameId, playerId]
  );
  return result.rowCount === 1;
}
