import type { GameEvent, GameState } from "./game.js";

export type ReplayFrame = { sequence:number; event:GameEvent; state:GameState|null };

export function buildReplay(events: readonly GameEvent[], snapshots: readonly {sequence:number;state:GameState}[]): readonly ReplayFrame[] {
  const bySequence=new Map(snapshots.map(s=>[s.sequence,s.state]));
  return events.map((event,index)=>({sequence:index+1,event,state:bySequence.get(index+1)??null}));
}

export function assertReplayContinuity(events: readonly GameEvent[]): void {
  if (events.length===0) throw new Error("REPLAY_EMPTY");
  for (let i=0;i<events.length;i++) {
    const e=events[i]!;
    if (e.type.length===0) throw new Error("REPLAY_INVALID_EVENT");
  }
}
