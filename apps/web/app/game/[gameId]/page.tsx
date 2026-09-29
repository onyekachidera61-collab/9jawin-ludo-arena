"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { connectGame, getSession } from "../../../lib/realtime";

type Token = { tokenId:number; progress:number; movementPoints:number; homeMultiplierApplied:boolean };
type Player = { playerId:string; colorIndex:number; tokens:Token[]; score:number; eliminated:boolean; consecutiveMissedTurns:number; timebankRemainingMs?:number };
type State = { phase:string; players:Player[]; currentPlayerIndex:number; turnId:number; consecutiveSixes:number; winnerId:string|null; pendingRoll:{value:number;playerId:string;turnId:number}|null; turnStartedAt:number|null; turnExpiresAt:number|null; moveCount?:number; leagueDeckIndex?:number };

const TRACK = 52;
const PATH = Array.from({length:15},(_,r)=>Array.from({length:15},(_,col)=>({r,col}))).flat().filter(({r,col}) => !((r===0||r===14)&&(col===0||col===14)));
const progressLabel=(p:number)=>p<0?"Yard":p===57?"Home":p<52?`Track ${p+1}`:`Home lane ${p-51}`;

export default function GamePage(){
  const {gameId}=useParams<{gameId:string}>();
  const [state,setState]=useState<State|null>(null);
  const [error,setError]=useState("");
  const [lastRoll,setLastRoll]=useState<number|null>(null);
  const connectRef=useRef<ReturnType<typeof connectGame>|null>(null);
  const [now,setNow]=useState(Date.now());
  const playerId=useMemo(()=>{try{return getSession().playerId}catch{return ""}},[]);

  useEffect(()=>{
    const timer=window.setInterval(()=>setNow(Date.now()),250);
    const c=connectGame(gameId,{
      state:(next)=>{setState(next as State);setError("")},
      events:(events)=>{const dice=[...(events as any[])].find((e)=>e.type==="DICE_ROLLED");if(dice)setLastRoll(dice.roll)},
      error:(e)=>setError(String((e as any)?.code||"ERROR"))
    });
    connectRef.current=c;
    return()=>{window.clearInterval(timer);c.close();connectRef.current=null};
  },[gameId]);

  if(!state)return <main className="min-h-screen bg-slate-950 p-6 text-white"><div className="mx-auto max-w-6xl"><h1 className="text-3xl font-black">Portable Ludo</h1><p className="mt-8 rounded-2xl bg-white/5 p-6">Reconnecting to game…</p></div></main>;

  const me=state.players.find(p=>p.playerId===playerId);
  const current=state.players[state.currentPlayerIndex];
  const myTurn=current?.playerId===playerId;
  const seconds=state.turnExpiresAt===null?0:Math.max(0,Math.ceil((state.turnExpiresAt-now)/1000));
  const pending=state.pendingRoll?.playerId===playerId?state.pendingRoll:null;
  const legalHint=pending?"Choose a token that can move.":"Roll when it is your turn.";

  return <main className="min-h-screen bg-slate-950 p-4 text-white sm:p-6">
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm font-semibold uppercase tracking-widest text-amber-300">Portable Ludo</p><h1 className="text-2xl font-black sm:text-3xl">Game {gameId}</h1></div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right"><div className="text-xs text-slate-400">Turn timer</div><div className="text-2xl font-black">{state.phase==="ACTIVE"?`${seconds}s`:"—"}</div><div className="text-[10px] text-slate-500">Moves {state.moveCount??0}{state.leagueDeckIndex!==undefined?` · League ${state.leagueDeckIndex}/36`:""}</div></div>
      </header>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {state.players.map(p=><div key={p.playerId} className={`rounded-2xl border p-4 ${p.playerId===current?.playerId?"border-amber-300 bg-amber-300/10":"border-white/10 bg-white/5"}`}>
          <div className="flex items-center justify-between"><span className="font-bold">{p.playerId===playerId?"You":p.playerId}</span><span className="font-black">{p.score}</span></div>
          <div className="mt-2 text-xs text-slate-400">{p.eliminated?"Eliminated":p.playerId===current?.playerId?"Current turn":"Waiting"} · missed {p.consecutiveMissedTurns}/3</div>
          {p.timebankRemainingMs!==undefined&&<div className="mt-1 text-xs text-slate-500">Timebank {Math.ceil(p.timebankRemainingMs/1000)}s</div>}
        </div>)}
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="rounded-3xl border border-white/10 bg-emerald-950/80 p-4 sm:p-6">
          <div className="mx-auto grid aspect-square max-w-[680px] grid-cols-[repeat(15,minmax(0,1fr))] overflow-hidden rounded-2xl border-4 border-white/10 bg-slate-900">
            {PATH.map(({r,col},i)=>{
              const trackIndex=i;
              const occupied=(me?.tokens??[]).filter(t=>t.progress===trackIndex).length;
              return <div key={r+"-"+col} className={`relative flex items-center justify-center border border-white/5 ${[0,13,26,39].includes(trackIndex)?"bg-amber-300/30":"bg-white/10"}`}>
                <span className="text-[7px] text-slate-400 sm:text-[9px]">{trackIndex+1}</span>
                {[0,8,13,21,26,34,39,47].includes(trackIndex)&&<span className="absolute right-0.5 top-0.5 text-[8px] text-amber-300">★</span>}
                {occupied>0&&<span className="absolute bottom-0.5 right-0.5 rounded-full bg-amber-300 px-1 text-[8px] font-black text-slate-950">{occupied}</span>}
              </div>;
            })}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[10px] text-slate-400">
            {state.players.map((p,i)=><div key={p.playerId} className="rounded-xl bg-black/20 p-2">{p.playerId===playerId?"You":p.playerId}<div className="mt-1 font-black text-white">{p.tokens.filter(t=>t.progress===-1).length} yard · {p.tokens.filter(t=>t.progress===57).length} home</div></div>)}
          </div>
          <div className="mt-4 rounded-2xl bg-black/20 p-4 text-sm text-slate-300">Each square advanced earns 1 movement point. A token reaching Home doubles its accumulated movement points once.</div>
        </div>

        <aside className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between"><span className="text-sm text-slate-400">Status</span><span className="rounded-full bg-white/10 px-3 py-1 text-xs">{state.phase}</span></div>
          <p className="mt-3 text-sm text-slate-300">{legalHint}</p>
          <div className="mt-5 rounded-2xl bg-slate-950 p-5 text-center"><div className="text-xs uppercase tracking-widest text-slate-500">Dice</div><div className="mt-2 text-5xl font-black">{pending?.value??lastRoll??"—"}</div></div>
          <button disabled={!myTurn||!!state.pendingRoll||state.phase!=="ACTIVE"} onClick={()=>connectRef.current?.roll()} className="mt-4 w-full rounded-2xl bg-amber-400 p-4 font-black text-slate-950 disabled:opacity-40">Roll dice</button>
          {error&&<p className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
        </aside>
      </section>

      <section className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between"><h2 className="text-xl font-black">Your tokens</h2><span className="text-sm text-slate-400">{myTurn?pending?"Select a legal token":"Roll the dice":"Waiting for your turn"}</span></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(me?.tokens??[]).map(token=><button key={token.tokenId} disabled={!myTurn||!pending||state.phase!=="ACTIVE"} onClick={()=>connectRef.current?.move(token.tokenId)} className="rounded-2xl border border-white/10 bg-slate-950 p-4 text-left transition hover:border-amber-300 disabled:opacity-40"><div className="flex items-center justify-between"><span className="font-black">Token {token.tokenId+1}</span><span className="text-amber-300">{token.progress===57?"HOME":token.progress<0?"YARD":token.progress}</span></div><div className="mt-2 text-xs text-slate-400">{progressLabel(token.progress)} · {token.movementPoints} points{token.homeMultiplierApplied?" · doubled":""}</div></button>)}
        </div>
      </section>

      {state.phase==="FINISHED"&&<section className="mt-5 rounded-3xl border border-amber-300/30 bg-amber-300/10 p-6 text-center"><p className="text-sm uppercase tracking-widest text-amber-300">Game finished</p><h2 className="mt-2 text-3xl font-black">{state.winnerId===playerId?"You won!":`${state.winnerId} won`}</h2></section>}
    </div>
  </main>;
}


