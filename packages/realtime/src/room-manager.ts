import { randomUUID } from "node:crypto";
import { GameSession } from "./game-session.js";
import { createGame,startGame,STANDARD_RULES,LEAGUE_RULES,type RuleSet } from "@portable-ludo/engine";
import type { GameStore } from "@portable-ludo/persistence";

type RoomOptions={turnDurationMs:number;botSlots:number;botDifficulty:"EASY"|"NORMAL"|"HARD"};

export class RoomManager{
 private readonly sessions=new Map<string,GameSession>();
 constructor(private readonly store:GameStore){}
 async create(playerIds:readonly string[],rules:RuleSet=STANDARD_RULES):Promise<GameSession>{
  const gameId=randomUUID();const session=GameSession.create(gameId,playerIds,this.store,rules);await this.store.createGame(gameId,session.snapshot().state,rules.name);
  for(let i=0;i<playerIds.length;i++)await this.store.addGamePlayer(gameId,playerIds[i]!,i,playerIds[i]!);
  this.sessions.set(gameId,session);return session;
 }
 async createLobby(ownerPlayerId:string,displayName:string,playerCount:2|4,ruleset:"STANDARD"|"LEAGUE"="STANDARD",options:Partial<RoomOptions>={}):Promise<{id:string;code:string}>{
  const botSlots=Math.max(0,Math.min(playerCount-1,Math.floor(options.botSlots??0)));
  const turnDurationMs=Math.max(10_000,Math.min(60_000,Math.floor(options.turnDurationMs??15000)));
  const botDifficulty=options.botDifficulty??"NORMAL";
  for(let attempt=0;attempt<5;attempt++){const id=randomUUID();const code=`LUDO-${randomUUID().replaceAll("-","").slice(0,4).toUpperCase()}`;try{await this.store.createRoomWithOwner({id,code,ownerPlayerId,ruleset,playerCount,expiresAt:new Date(Date.now()+30*60_000),displayName,turnDurationMs,botSlots,botDifficulty});return {id,code}}catch(error){const pg=typeof error==="object"&&error!==null&&"code"in error?String((error as {code:unknown}).code):"";if(pg!=="23505"||attempt===4)throw error}}
  throw new Error("ROOM_CREATION_FAILED");
 }
 async getLobby(roomIdOrCode:string){const room=await this.store.getRoom(roomIdOrCode);if(!room)return null;return {...room,players:await this.store.getRoomPlayers(room.id)}}
 private rulesFor(room:{ruleset:string;turnDurationMs:number}):RuleSet{const base=room.ruleset==="LEAGUE"?LEAGUE_RULES:STANDARD_RULES;return {...base,turnDurationMs:room.turnDurationMs}}
 async joinLobby(roomIdOrCode:string,playerId:string,displayName:string){
  const joined=await this.store.joinRoom(roomIdOrCode,playerId,displayName);if(!joined.shouldStart)return joined;
  const players=await this.store.getRoomPlayers(joined.room.id);
  const botsNeeded=joined.room.playerCount-players.length;
  for(let i=0;i<botsNeeded;i++){const botId=`bot-${randomUUID()}`;await this.store.addRoomPlayer(joined.room.id,botId,players.length+i,`Bot ${joined.room.botDifficulty}`)}
  const finalPlayers=await this.store.getRoomPlayers(joined.room.id);
  const gameId=randomUUID();const rules=this.rulesFor(joined.room);const waiting=createGame(finalPlayers.map(p=>p.playerId),rules);const started=startGame(waiting,rules);
  try{await this.store.finalizeRoomGame(joined.room.id,gameId,started.state,rules.name,rules.turnDurationMs,finalPlayers);if(finalPlayers.some(p=>p.playerId.startsWith("bot-")))await this.store.markBotGame(gameId,joined.room.botDifficulty)}
  catch(error){try{await this.store.resetStartingRoom(joined.room.id)}catch(resetError){throw new Error(`ROOM_FINALIZATION_FAILED_AND_RESET_FAILED: ${resetError instanceof Error?resetError.message:"UNKNOWN_RESET_ERROR"}`,{cause:error})}throw error}
  const activeRoom=await this.store.getRoom(joined.room.id);if(!activeRoom||activeRoom.status!=="ACTIVE"||activeRoom.gameId!==gameId)throw new Error("ROOM_FINALIZATION_MISMATCH");
  const session=GameSession.fromPersisted(gameId,started.state,1,this.store,rules);this.sessions.set(gameId,session);
  return {...joined,room:activeRoom,gameId,state:started.state,events:started.events,players:finalPlayers};
 }
 get(gameId:string):GameSession|undefined{return this.sessions.get(gameId)}
 async recoverActiveGames():Promise<void>{for(const gameId of await this.store.listActiveGameIds())await this.load(gameId)}
 async expireTurns(now=Date.now()){const expired:Array<{gameId:string;events:readonly import("@portable-ludo/engine").GameEvent[]}>=[];for(const [gameId,session] of this.sessions){const events=await session.expireTurn(now);if(events.length)expired.push({gameId,events})}return expired}
 async load(gameId:string):Promise<GameSession|undefined>{const persisted=await this.store.loadGame(gameId);if(!persisted)return undefined;const rules=this.rulesFor({ruleset:persisted.ruleset,turnDurationMs:persisted.turnDurationMs});const session=GameSession.fromPersisted(gameId,persisted.state,persisted.version,this.store,rules);this.sessions.set(gameId,session);return session}
}
