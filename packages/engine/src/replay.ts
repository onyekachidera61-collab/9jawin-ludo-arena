import type { GameEvent, GameState } from "./game.js";
import type { RuleSet } from "./types.js";
import { assertGameInvariants } from "./invariants.js";

export type ReplayFrame={sequence:number;event:GameEvent;state:GameState|null};
export type ReplaySnapshot={sequence:number;state:GameState};

export function buildReplay(events:readonly GameEvent[],snapshots:readonly ReplaySnapshot[]):readonly ReplayFrame[]{
 const bySequence=new Map(snapshots.map(s=>[s.sequence,s.state]));
 return events.map((event,index)=>({sequence:index+1,event,state:bySequence.get(index+1)??null}));
}

export function assertReplayContinuity(events:readonly GameEvent[]):void{
 if(events.length===0)throw new Error("REPLAY_EMPTY");
 for(let i=0;i<events.length;i++){const e=events[i]!;if(e.type.length===0)throw new Error("REPLAY_INVALID_EVENT");}
}

export function verifyReplay(events:readonly GameEvent[],snapshots:readonly ReplaySnapshot[],rules:RuleSet):{eventCount:number;snapshotCount:number;finalState:GameState}{
 assertReplayContinuity(events);
 if(snapshots.length===0)throw new Error("REPLAY_SNAPSHOT_EMPTY");
 let previous=0;
 for(const snapshot of snapshots){
  if(!Number.isInteger(snapshot.sequence)||snapshot.sequence<=previous)throw new Error("REPLAY_SEQUENCE_GAP");
  if(snapshot.sequence>events.length)throw new Error("REPLAY_SNAPSHOT_AHEAD");
  assertGameInvariants(snapshot.state,rules);
  previous=snapshot.sequence;
 }
 if(snapshots[snapshots.length-1]!.sequence!==events.length)throw new Error("REPLAY_FINAL_SNAPSHOT_MISSING");
 const finalState=snapshots[snapshots.length-1]!.state;
 if(finalState.phase!=="FINISHED")throw new Error("REPLAY_NOT_FINISHED");
 const finishEvents=events.filter(e=>e.type==="GAME_FINISHED");
 if(finishEvents.length!==1)throw new Error("REPLAY_FINISH_EVENT_INVALID");
 if(finishEvents[0]!.playerId!==finalState.winnerId)throw new Error("REPLAY_WINNER_MISMATCH");
 return {eventCount:events.length,snapshotCount:snapshots.length,finalState};
}
