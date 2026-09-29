import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { GameEvent, GameState } from "@portable-ludo/engine";

export type PersistedGame={id:string;phase:GameState["phase"];ruleset:string;state:GameState;version:number;turnDurationMs:number};
export type RoomRecord={
 id:string;code:string;ownerPlayerId:string;ruleset:string;playerCount:number;status:string;gameId:string|null;
 turnDurationMs:number;botSlots:number;botDifficulty:"EASY"|"NORMAL"|"HARD";
};

export class GameStore{
 constructor(private readonly pool:Pool){}
 async ping():Promise<void>{await this.pool.query("SELECT 1");}

 async enqueueMatchmaking(playerId:string,displayName:string,ruleset:string,playerCount:2|4):Promise<{matched:boolean;playerIds:string[]}>{
  const client=await this.pool.connect();
  try{
   await client.query("BEGIN");
   await client.query("INSERT INTO matchmaking_queue(player_id,display_name,ruleset,player_count,status,updated_at) VALUES ($1,$2,$3,$4,'WAITING',now()) ON CONFLICT (player_id,ruleset,player_count) DO UPDATE SET display_name=EXCLUDED.display_name,status='WAITING',updated_at=now()",[playerId,displayName,ruleset,playerCount]);
   const rows=await client.query<{player_id:string}>("SELECT player_id FROM matchmaking_queue WHERE status='WAITING' AND ruleset=$1 AND player_count=$2 AND updated_at>now()-interval '2 minutes' ORDER BY created_at FOR UPDATE SKIP LOCKED",[ruleset,playerCount]);
   if(rows.rows.length<playerCount){await client.query("COMMIT");return {matched:false,playerIds:rows.rows.map(r=>r.player_id)}}
   const selected=rows.rows.slice(0,playerCount).map(r=>r.player_id);
   await client.query("UPDATE matchmaking_queue SET status='MATCHED',updated_at=now() WHERE player_id=ANY($1::text[]) AND ruleset=$2 AND player_count=$3",[selected,ruleset,playerCount]);
   await client.query("COMMIT");return {matched:true,playerIds:selected};
  }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
 }
 async cancelMatchmaking(playerId:string,ruleset:string,playerCount:2|4):Promise<void>{await this.pool.query("UPDATE matchmaking_queue SET status='CANCELLED',updated_at=now() WHERE player_id=$1 AND ruleset=$2 AND player_count=$3 AND status='WAITING'",[playerId,ruleset,playerCount]);}
 async createGuestSession(sessionId:string,playerId:string,displayName:string,sessionTokenNonce:string,expiresAt:Date):Promise<void>{await this.pool.query("INSERT INTO guest_sessions(session_id,player_id,display_name,session_token_nonce,expires_at) VALUES ($1,$2,$3,$4,$5)",[sessionId,playerId,displayName,sessionTokenNonce,expiresAt]);}
 async getGuestSession(playerId:string,nonce:string):Promise<{playerId:string;displayName:string;expiresAt:Date}|null>{const r=await this.pool.query("SELECT player_id,display_name,expires_at FROM guest_sessions WHERE player_id=$1 AND session_token_nonce=$2 AND expires_at>now()",[playerId,nonce]);const row=r.rows[0] as any;if(!row)return null;return {playerId:String(row.player_id),displayName:String(row.display_name),expiresAt:new Date(row.expires_at)}}
 async addGamePlayer(gameId:string,playerId:string,slotIndex:number,displayName:string):Promise<void>{await this.pool.query("INSERT INTO game_players(game_id,player_id,slot_index,display_name) VALUES ($1,$2,$3,$4)",[gameId,playerId,slotIndex,displayName]);}
 async isGameMember(gameId:string,playerId:string):Promise<boolean>{const r=await this.pool.query("SELECT 1 FROM game_players WHERE game_id=$1 AND player_id=$2",[gameId,playerId]);return r.rowCount===1;}

 async createRoom(room:{id:string;code:string;ownerPlayerId:string;ruleset:string;playerCount:number;expiresAt:Date;turnDurationMs?:number;botSlots?:number;botDifficulty?:"EASY"|"NORMAL"|"HARD"}):Promise<void>{
  await this.pool.query("INSERT INTO rooms(id,code,owner_player_id,ruleset,player_count,status,expires_at,turn_duration_ms,bot_slots,bot_difficulty) VALUES ($1,$2,$3,$4,$5,'WAITING',$6,$7,$8,$9)",[room.id,room.code,room.ownerPlayerId,room.ruleset,room.playerCount,room.expiresAt,room.turnDurationMs??15000,room.botSlots??0,room.botDifficulty??"NORMAL"]);
 }
 async createRoomWithOwner(room:{id:string;code:string;ownerPlayerId:string;ruleset:string;playerCount:number;expiresAt:Date;displayName:string;turnDurationMs?:number;botSlots?:number;botDifficulty?:"EASY"|"NORMAL"|"HARD"}):Promise<void>{
  const client=await this.pool.connect();
  try{
   await client.query("BEGIN");
   await client.query("INSERT INTO rooms(id,code,owner_player_id,ruleset,player_count,status,expires_at,turn_duration_ms,bot_slots,bot_difficulty) VALUES ($1,$2,$3,$4,$5,'WAITING',$6,$7,$8,$9)",[room.id,room.code,room.ownerPlayerId,room.ruleset,room.playerCount,room.expiresAt,room.turnDurationMs??15000,room.botSlots??0,room.botDifficulty??"NORMAL"]);
   await client.query("INSERT INTO room_players(room_id,player_id,slot_index,display_name) VALUES ($1,$2,0,$3)",[room.id,room.ownerPlayerId,room.displayName]);
   await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
 }
 async addRoomPlayer(roomId:string,playerId:string,slotIndex:number,displayName:string):Promise<void>{await this.pool.query("INSERT INTO room_players(room_id,player_id,slot_index,display_name) VALUES ($1,$2,$3,$4)",[roomId,playerId,slotIndex,displayName]);}
 async getRoom(roomIdOrCode:string):Promise<RoomRecord|null>{
  const r=await this.pool.query("SELECT id,code,owner_player_id,ruleset,player_count,status,game_id,turn_duration_ms,bot_slots,bot_difficulty FROM rooms WHERE (id=$1 OR code=$1) AND expires_at>now()",[roomIdOrCode]);
  const row=r.rows[0] as any;if(!row)return null;
  return {id:String(row.id),code:String(row.code),ownerPlayerId:String(row.owner_player_id),ruleset:String(row.ruleset),playerCount:Number(row.player_count),status:String(row.status),gameId:row.game_id?String(row.game_id):null,turnDurationMs:Number(row.turn_duration_ms),botSlots:Number(row.bot_slots),botDifficulty:String(row.bot_difficulty) as any};
 }
 async getRoomPlayers(roomId:string):Promise<Array<{playerId:string;slotIndex:number;displayName:string;ready:boolean}>>{
  const r=await this.pool.query("SELECT player_id,slot_index,display_name,ready FROM room_players WHERE room_id=$1 ORDER BY slot_index",[roomId]);
  return r.rows.map((x:any)=>({playerId:String(x.player_id),slotIndex:Number(x.slot_index),displayName:String(x.display_name),ready:Boolean(x.ready)}));
 }
 async joinRoom(roomIdOrCode:string,playerId:string,displayName:string):Promise<{room:RoomRecord;slotIndex:number;playerCount:number;shouldStart:boolean}>{
  const client=await this.pool.connect();
  try{
   await client.query("BEGIN");
   const q=await client.query("SELECT id,code,owner_player_id,ruleset,player_count,status,game_id,turn_duration_ms,bot_slots,bot_difficulty FROM rooms WHERE (id=$1 OR code=$1) AND expires_at>now() FOR UPDATE",[roomIdOrCode]);
   const row=q.rows[0] as any;if(!row)throw new Error("ROOM_NOT_FOUND");if(row.status!=="WAITING")throw new Error("ROOM_NOT_WAITING");
   const existing=await client.query("SELECT slot_index FROM room_players WHERE room_id=$1 AND player_id=$2",[row.id,playerId]);
   const room:RoomRecord={id:String(row.id),code:String(row.code),ownerPlayerId:String(row.owner_player_id),ruleset:String(row.ruleset),playerCount:Number(row.player_count),status:String(row.status),gameId:row.game_id?String(row.game_id):null,turnDurationMs:Number(row.turn_duration_ms),botSlots:Number(row.bot_slots),botDifficulty:String(row.bot_difficulty) as any};
   if(existing.rowCount===1){await client.query("COMMIT");return {room,slotIndex:Number(existing.rows[0].slot_index),playerCount:room.playerCount,shouldStart:false}}
   const count=await client.query("SELECT COUNT(*)::int AS count FROM room_players WHERE room_id=$1",[row.id]);
   const occupied=Number(count.rows[0].count);const humanTarget=room.playerCount-room.botSlots;
   if(occupied>=humanTarget)throw new Error("ROOM_HUMAN_SLOTS_FULL");
   const slots=await client.query("SELECT slot_index FROM room_players WHERE room_id=$1 ORDER BY slot_index",[row.id]);
   const used=new Set(slots.rows.map((x:any)=>Number(x.slot_index)));let slotIndex=0;while(used.has(slotIndex))slotIndex++;
   await client.query("INSERT INTO room_players(room_id,player_id,slot_index,display_name) VALUES ($1,$2,$3,$4)",[row.id,playerId,slotIndex,displayName]);
   const shouldStart=occupied+1>=humanTarget;
   if(shouldStart){const t=await client.query("UPDATE rooms SET status='STARTING',updated_at=now() WHERE id=$1 AND status='WAITING' AND game_id IS NULL",[row.id]);if(t.rowCount!==1)throw new Error("ROOM_START_TRANSITION_FAILED")}
   await client.query("COMMIT");return {room:{...room,status:shouldStart?"STARTING":"WAITING"},slotIndex,playerCount:room.playerCount,shouldStart};
  }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
 }

 async finalizeRoomGame(roomId:string,gameId:string,state:GameState,ruleset:string,players:readonly {playerId:string;slotIndex:number;displayName:string}[]):Promise<void>{
  const client=await this.pool.connect();
  try{
   await client.query("BEGIN");
   const room=await client.query("SELECT id,status,game_id,player_count FROM rooms WHERE id=$1 FOR UPDATE");
   if(room.rowCount!==1||room.rows[0].status!=="STARTING")throw new Error("ROOM_STARTING_REQUIRED");
   if(room.rows[0].game_id&&room.rows[0].game_id!==gameId)throw new Error("ROOM_GAME_CONFLICT");
   if(players.length!==Number(room.rows[0].player_count))throw new Error("ROOM_PLAYER_COUNT_MISMATCH");
   if(new Set(players.map(p=>p.playerId)).size!==players.length||new Set(players.map(p=>p.slotIndex)).size!==players.length)throw new Error("ROOM_PLAYER_SET_INVALID");
   await client.query("INSERT INTO games(id,phase,ruleset,state_json,version,turn_duration_ms) VALUES ($1,$2,$3,$4,1,$5)",[gameId,state.phase,ruleset,JSON.stringify(state)]);
   for(const p of players)await client.query("INSERT INTO game_players(game_id,player_id,slot_index,display_name) VALUES ($1,$2,$3,$4)",[gameId,p.playerId,p.slotIndex,p.displayName]);
   const startPlayerId=state.players[state.currentPlayerIndex]?.playerId;if(!startPlayerId)throw new Error("GAME_START_PLAYER_MISSING");
   const startEvent={type:"GAME_STARTED",turnId:state.turnId,playerId:startPlayerId};
   for(const p of state.players)for(const token of p.tokens)await client.query("INSERT INTO game_tokens(game_id,player_id,token_id,progress,movement_points,home_multiplier_applied) VALUES ($1,$2,$3,$4,$5,$6)",[gameId,p.playerId,token.tokenId,token.progress,token.movementPoints,token.homeMultiplierApplied]);
   await client.query("INSERT INTO game_events(event_id,game_id,sequence_number,event_type,player_id,payload,server_timestamp) VALUES ($1,$2,1,$3,$4,$5,$6)",[randomUUID(),gameId,startEvent.type,startPlayerId,JSON.stringify(startEvent),new Date()]);
   await client.query("INSERT INTO game_snapshots(game_id,sequence_number,state_json) VALUES ($1,1,$2)",[gameId,JSON.stringify(state)]);
   const activation=await client.query("UPDATE rooms SET status='ACTIVE',game_id=$2,updated_at=now() WHERE id=$1 AND status='STARTING' AND game_id IS NULL",[roomId,gameId]);
   if(activation.rowCount!==1)throw new Error("ROOM_ACTIVATION_FAILED");
   await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
 }
 async resetStartingRoom(roomId:string):Promise<void>{const r=await this.pool.query("UPDATE rooms SET status='WAITING',updated_at=now() WHERE id=$1 AND status='STARTING' AND game_id IS NULL",[roomId]);if(r.rowCount!==1)throw new Error("ROOM_RESET_FAILED");}
 async markBotGame(gameId:string,difficulty:"EASY"|"NORMAL"|"HARD"):Promise<void>{await this.pool.query("INSERT INTO bot_games(game_id,difficulty) VALUES ($1,$2) ON CONFLICT(game_id) DO UPDATE SET difficulty=EXCLUDED.difficulty",[gameId,difficulty]);}
 async createGame(id:string,state:GameState,ruleset:string,turnDurationMs=15000):Promise<void>{await this.pool.query("INSERT INTO games(id,phase,ruleset,state_json,version,turn_duration_ms) VALUES ($1,$2,$3,$4,0,$5)",[id,state.phase,ruleset,JSON.stringify(state),turnDurationMs]);}
 async listActiveGameIds():Promise<readonly string[]>{const r=await this.pool.query("SELECT id FROM games WHERE phase='ACTIVE' ORDER BY created_at ASC");return r.rows.map((x:any)=>String(x.id));}
 async loadGame(id:string):Promise<PersistedGame|null>{
  const r=await this.pool.query("SELECT id,phase,ruleset,state_json,version,updated_at,turn_duration_ms FROM games WHERE id=$1",[id]);const row=r.rows[0] as any;if(!row)return null;const state=row.state_json as GameState;
  if(state.phase==="ACTIVE"&&(state.turnStartedAt===undefined||state.turnExpiresAt===undefined)){const startedAt=new Date(row.updated_at).getTime();state.turnStartedAt=startedAt;state.turnExpiresAt=startedAt+Number(row.turn_duration_ms??15000)}
  if(state.phase!=="ACTIVE"){state.turnStartedAt=null;state.turnExpiresAt=null}
  return {id:String(row.id),phase:row.phase,ruleset:String(row.ruleset),state,version:Number(row.version),turnDurationMs:Number(row.turn_duration_ms??15000)};
 }
 async saveTransition(id:string,expectedVersion:number,state:GameState,events:readonly GameEvent[]):Promise<number>{
  const client=await this.pool.connect();
  try{
   await client.query("BEGIN");if(events.length===0)throw new Error("EMPTY_TRANSITION");const nextVersion=expectedVersion+events.length;
   const updated=await client.query("UPDATE games SET phase=$2,state_json=$3,version=$4,updated_at=now() WHERE id=$1 AND version=$5 RETURNING version",[id,state.phase,JSON.stringify(state),nextVersion,expectedVersion]);if(updated.rowCount!==1)throw new Error("GAME_VERSION_CONFLICT");
   let sequence=expectedVersion;
   for(const event of events){sequence++;await client.query("INSERT INTO game_events(event_id,game_id,sequence_number,event_type,player_id,payload,server_timestamp) VALUES ($1,$2,$3,$4,$5,$6,$7)",[randomUUID(),id,sequence,event.type,"playerId" in event?event.playerId:null,JSON.stringify(event),new Date()]);if(event.type==="DICE_ROLLED")await client.query("INSERT INTO game_moves(game_id,turn_id,player_id,token_id,dice_value,move_distance) VALUES ($1,$2,$3,NULL,$4,NULL)",[id,event.turnId,event.playerId,event.roll]);else if(event.type==="TOKEN_MOVED")await client.query("INSERT INTO game_moves(game_id,turn_id,player_id,token_id,dice_value,move_distance) VALUES ($1,$2,$3,$4,NULL,$5)",[id,event.turnId,event.playerId,event.tokenId,event.distance]);}
   for(const p of state.players)for(const token of p.tokens)await client.query("INSERT INTO game_tokens(game_id,player_id,token_id,progress,movement_points,home_multiplier_applied) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(game_id,player_id,token_id) DO UPDATE SET progress=EXCLUDED.progress,movement_points=EXCLUDED.movement_points,home_multiplier_applied=EXCLUDED.home_multiplier_applied",[id,p.playerId,token.tokenId,token.progress,token.movementPoints,token.homeMultiplierApplied]);
   await client.query("INSERT INTO game_snapshots(game_id,sequence_number,state_json) VALUES ($1,$2,$3) ON CONFLICT(game_id,sequence_number) DO UPDATE SET state_json=EXCLUDED.state_json",[id,nextVersion,JSON.stringify(state)]);
   if(state.phase==="FINISHED"&&state.winnerId){const eligibility=await client.query("SELECT is_test,is_invalid FROM games WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM bot_games WHERE game_id=$1)",[id]);if(eligibility.rowCount===1&&!eligibility.rows[0].is_test&&!eligibility.rows[0].is_invalid){await client.query("DELETE FROM leaderboard_entries WHERE game_id=$1",[id]);await client.query("INSERT INTO leaderboard_entries(game_id,player_id,display_name,score,rank) SELECT $1,gp.player_id,gp.display_name,gp_score.score,ROW_NUMBER() OVER(ORDER BY gp_score.score DESC) FROM (SELECT player_id,score FROM jsonb_to_recordset($2::jsonb) AS x(player_id text,score integer)) gp_score JOIN game_players gp ON gp.game_id=$1 AND gp.player_id=gp_score.player_id",[id,JSON.stringify(state.players.map(p=>({player_id:p.playerId,score:p.score})))])}}
   await client.query("COMMIT");return nextVersion;
  }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
 }
 async listGameEvents(gameId:string):Promise<readonly {sequence:number;eventType:string;playerId:string|null;payload:unknown;serverTimestamp:string}[]>{const r=await this.pool.query("SELECT sequence_number,event_type,player_id,payload,server_timestamp FROM game_events WHERE game_id=$1 ORDER BY sequence_number",[gameId]);return r.rows.map((x:any)=>({sequence:Number(x.sequence_number),eventType:String(x.event_type),playerId:x.player_id===null?null:String(x.player_id),payload:x.payload,serverTimestamp:new Date(x.server_timestamp).toISOString()}));}
 async listGameSnapshots(gameId:string):Promise<readonly {sequence:number;state:GameState}[]>{const r=await this.pool.query("SELECT sequence_number,state_json FROM game_snapshots WHERE game_id=$1 ORDER BY sequence_number",[gameId]);return r.rows.map((x:any)=>({sequence:Number(x.sequence_number),state:x.state_json as GameState}));}
 async getLeaderboard(limit=100):Promise<readonly {gameId:string;playerId:string;displayName:string;score:number;rank:number}[]>{const safe=Math.max(1,Math.min(1000,Math.floor(limit)));const r=await this.pool.query("SELECT game_id,player_id,display_name,score,rank FROM leaderboard_entries ORDER BY score DESC,rank ASC LIMIT $1",[safe]);return r.rows.map((x:any)=>({gameId:String(x.game_id),playerId:String(x.player_id),displayName:String(x.display_name),score:Number(x.score),rank:Number(x.rank)}));}
 async writeAdminAudit(actorId:string,action:string,gameId:string|null,payload:unknown={}):Promise<void>{await this.pool.query("INSERT INTO admin_audit_logs(actor_id,action,game_id,payload) VALUES ($1,$2,$3,$4)",[actorId,action,gameId,JSON.stringify(payload)]);}
}
export function createPool(databaseUrl:string):Pool{return new Pool({connectionString:databaseUrl,max:10,idleTimeoutMillis:30000});}
