import { Pool } from "pg";
import type { GameEvent, GameState } from "@portable-ludo/engine";

export type PersistedGame = {
  id: string;
  phase: GameState["phase"];
  ruleset: string;
  state: GameState;
  version: number;
};


export type RoomRecord = {
  id: string; code: string; ownerPlayerId: string; ruleset: string;
  playerCount: number; status: string; gameId: string | null;
};

export class GameStore {
  constructor(private readonly pool: Pool) {}

  async createGuestSession(sessionId: string, playerId: string, displayName: string, sessionTokenNonce: string, expiresAt: Date): Promise<void> {
    await this.pool.query(
      "INSERT INTO guest_sessions (session_id,player_id,display_name,session_token_nonce,expires_at) VALUES ($1,$2,$3,$4,$5)",
      [sessionId, playerId, displayName, sessionTokenNonce, expiresAt]
    );
  }

  async getGuestSession(playerId: string, nonce: string): Promise<{ playerId: string; displayName: string; expiresAt: Date } | null> {
    const result = await this.pool.query(
      "SELECT player_id,display_name,expires_at FROM guest_sessions WHERE player_id=$1 AND session_token_nonce=$2 AND expires_at > now()",
      [playerId, nonce]
    );
    const row = result.rows[0] as { player_id:string; display_name:string; expires_at:Date } | undefined;
    if (!row) return null;
    return { playerId: String(row.player_id), displayName: String(row.display_name), expiresAt: new Date(row.expires_at) };
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

  async createRoom(room: { id: string; code: string; ownerPlayerId: string; ruleset: string; playerCount: number; expiresAt: Date }): Promise<void> {
    await this.pool.query("INSERT INTO rooms (id,code,owner_player_id,ruleset,player_count,status,expires_at) VALUES ($1,$2,$3,$4,$5,'WAITING',$6)", [room.id, room.code, room.ownerPlayerId, room.ruleset, room.playerCount, room.expiresAt]);
  }

  async createRoomWithOwner(room: { id: string; code: string; ownerPlayerId: string; ruleset: string; playerCount: number; expiresAt: Date; displayName: string }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO rooms (id,code,owner_player_id,ruleset,player_count,status,expires_at) VALUES ($1,$2,$3,$4,$5,'WAITING',$6)",
        [room.id, room.code, room.ownerPlayerId, room.ruleset, room.playerCount, room.expiresAt]
      );
      await client.query(
        "INSERT INTO room_players (room_id,player_id,slot_index,display_name) VALUES ($1,$2,0,$3)",
        [room.id, room.ownerPlayerId, room.displayName]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async addRoomPlayer(roomId: string, playerId: string, slotIndex: number, displayName: string): Promise<void> {
    await this.pool.query("INSERT INTO room_players (room_id,player_id,slot_index,display_name) VALUES ($1,$2,$3,$4)", [roomId, playerId, slotIndex, displayName]);
  }

  async getRoom(roomIdOrCode: string): Promise<RoomRecord | null> {
    const result = await this.pool.query("SELECT id,code,owner_player_id,ruleset,player_count,status,game_id FROM rooms WHERE (id=$1 OR code=$1) AND expires_at > now()", [roomIdOrCode]);
    const row = result.rows[0] as { id:string; code:string; owner_player_id:string; ruleset:string; player_count:number; status:string; game_id:string|null } | undefined;
    return row ? { id:row.id, code:row.code, ownerPlayerId:row.owner_player_id, ruleset:row.ruleset, playerCount:row.player_count, status:row.status, gameId:row.game_id } : null;
  }

  async getRoomPlayers(roomId: string): Promise<Array<{playerId:string; slotIndex:number; displayName:string; ready:boolean}>> {
    const result = await this.pool.query("SELECT player_id,slot_index,display_name,ready FROM room_players WHERE room_id=$1 ORDER BY slot_index", [roomId]);
    return result.rows.map((row) => ({ playerId:String(row.player_id), slotIndex:Number(row.slot_index), displayName:String(row.display_name), ready:Boolean(row.ready) }));
  }

  async joinRoom(roomIdOrCode: string, playerId: string, displayName: string): Promise<{ room: RoomRecord; slotIndex: number; playerCount: number; shouldStart: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const roomResult = await client.query(
        "SELECT id,code,owner_player_id,ruleset,player_count,status,game_id FROM rooms WHERE (id=$1 OR code=$1) AND expires_at > now() FOR UPDATE",
        [roomIdOrCode]
      );
      const row = roomResult.rows[0] as { id:string; code:string; owner_player_id:string; ruleset:string; player_count:number; status:string; game_id:string|null } | undefined;
      if (!row) throw new Error("ROOM_NOT_FOUND");
      if (row.status !== "WAITING") throw new Error("ROOM_NOT_WAITING");

      const existing = await client.query("SELECT slot_index FROM room_players WHERE room_id=$1 AND player_id=$2", [row.id, playerId]);
      if (existing.rowCount === 1) {
        await client.query("COMMIT");
        return { room: { id:row.id, code:row.code, ownerPlayerId:row.owner_player_id, ruleset:row.ruleset, playerCount:row.player_count, status:row.status, gameId:row.game_id }, slotIndex:Number(existing.rows[0].slot_index), playerCount:row.player_count, shouldStart:false };
      }

      const count = await client.query("SELECT COUNT(*)::int AS count FROM room_players WHERE room_id=$1", [row.id]);
      const occupied = Number(count.rows[0].count);
      if (occupied >= row.player_count) throw new Error("ROOM_FULL");

      const slotResult = await client.query("SELECT slot_index FROM room_players WHERE room_id=$1 ORDER BY slot_index", [row.id]);
      const used = new Set(slotResult.rows.map((x) => Number(x.slot_index)));
      let slotIndex = 0;
      while (used.has(slotIndex)) slotIndex += 1;
      await client.query(
        "INSERT INTO room_players (room_id,player_id,slot_index,display_name) VALUES ($1,$2,$3,$4)",
        [row.id, playerId, slotIndex, displayName]
      );
      const shouldStart = occupied + 1 === row.player_count;
      if (shouldStart) {
        await client.query("UPDATE rooms SET status='STARTING', updated_at=now() WHERE id=$1 AND status='WAITING'", [row.id]);
      }
      await client.query("COMMIT");
      return { room: { id:row.id, code:row.code, ownerPlayerId:row.owner_player_id, ruleset:row.ruleset, playerCount:row.player_count, status:shouldStart ? "STARTING" : row.status, gameId:row.game_id }, slotIndex, playerCount:row.player_count, shouldStart };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async finalizeRoomGame(roomId: string, gameId: string, state: GameState, ruleset: string, players: readonly { playerId: string; slotIndex: number; displayName: string }[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const room = await client.query("SELECT id,status,game_id,player_count FROM rooms WHERE id=$1 FOR UPDATE", [roomId]);
      if (room.rowCount !== 1 || room.rows[0].status !== "STARTING") throw new Error("ROOM_STARTING_REQUIRED");
      if (room.rows[0].game_id && room.rows[0].game_id !== gameId) throw new Error("ROOM_GAME_CONFLICT");
      if (players.length !== Number(room.rows[0].player_count)) throw new Error("ROOM_PLAYER_COUNT_MISMATCH");
      const uniquePlayers = new Set(players.map((player) => player.playerId));
      const uniqueSlots = new Set(players.map((player) => player.slotIndex));
      if (uniquePlayers.size !== players.length || uniqueSlots.size !== players.length) throw new Error("ROOM_PLAYER_SET_INVALID");
      await client.query(
        "INSERT INTO games (id,phase,ruleset,state_json,version) VALUES ($1,$2,$3,$4,0) ON CONFLICT (id) DO NOTHING",
        [gameId, state.phase, ruleset, JSON.stringify(state)]
      );
      for (const player of players) {
        await client.query(
          "INSERT INTO game_players (game_id,player_id,slot_index,display_name) VALUES ($1,$2,$3,$4) ON CONFLICT (game_id,player_id) DO NOTHING",
          [gameId, player.playerId, player.slotIndex, player.displayName]
        );
      }
      await client.query("UPDATE rooms SET status='ACTIVE', game_id=$2, updated_at=now() WHERE id=$1 AND status='STARTING'", [roomId, gameId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async resetStartingRoom(roomId: string): Promise<void> {
    const result = await this.pool.query(
      "UPDATE rooms SET status='WAITING', updated_at=now() WHERE id=$1 AND status='STARTING' AND game_id IS NULL",
      [roomId]
    );
    if (result.rowCount !== 1) throw new Error("ROOM_RESET_FAILED");
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


