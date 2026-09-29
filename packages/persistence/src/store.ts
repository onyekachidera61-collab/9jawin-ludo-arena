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

  async createGuestSession(sessionId: string, playerId: string, displayName: string, sessionTokenNonce: string, expiresAt: Date): Promise<void> {
    await this.pool.query(
      "INSERT INTO guest_sessions (session_id,player_id,display_name,session_token_nonce,expires_at) VALUES ($1,$2,$3,$4,$5)",
      [sessionId, playerId, displayName, sessionTokenNonce, expiresAt]
    );
  }

  async addGamePlayer(gameId: string, playerId: string, slotIndex: number, displayName: string): Promise<void> {
    await this.pool.query(
      "INSERT INTO game_players (game_id,player_id,slot_index,display_name) VALUES ($1,$2,$3,$4)",
      [gameId, playerId, slotIndex, displayName]
    );
  }

  async isGameMember(gameId: string, playerId: string): Promise<boolean> {
    const result = await this.pool.query("SELECT 1 FROM game_players WHERE game_id=$1 AND player_id=$2", [gameId, playerId]);
    return result.rowCount === 1;
  }

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

