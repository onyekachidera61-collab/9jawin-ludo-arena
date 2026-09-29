"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, openRealtime } from "../../lib/realtime";

export default function MatchmakingPage(){
  const router=useRouter();
  const wsRef=useRef<WebSocket|null>(null);
  const [ruleset,setRuleset]=useState<"STANDARD"|"LEAGUE">("STANDARD");
  const [playerCount,setPlayerCount]=useState<2|4>(2);
  const [status,setStatus]=useState("Choose a queue.");
  const [busy,setBusy]=useState(false);

  useEffect(()=>()=>{wsRef.current?.close()},[]);
  async function queue(){
    const session=getSession(); setBusy(true); setStatus("Connecting…");
    const ws=await openRealtime(); wsRef.current=ws;
    ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==="MATCHMAKING_STATUS"){if(m.status==="MATCHED"&&m.gameId){setStatus("Match found.");router.push("/game/"+m.gameId)}else if(m.status==="CANCELLED"){setBusy(false);setStatus("Queue cancelled.")}else setStatus("Waiting for players…")}};
    ws.onclose=()=>{if(busy)setStatus("Connection closed.")};
    ws.send(JSON.stringify({type:"MATCHMAKING_JOIN",ruleset,playerCount,playerId:session.playerId,displayName:session.displayName,sessionToken:session.sessionToken}));
  }
  function cancel(){
    const session=getSession(); const ws=wsRef.current;
    if(ws&&ws.readyState===WebSocket.OPEN){ws.send(JSON.stringify({type:"MATCHMAKING_CANCEL",ruleset,playerCount,playerId:session.playerId,displayName:session.displayName,sessionToken:session.sessionToken}));}
    else setBusy(false);
  }
  return <main className="mx-auto min-h-screen max-w-xl p-6 text-slate-900"><h1 className="text-3xl font-black">Matchmaking</h1><p className="mt-2 text-slate-600">Server-authoritative public games.</p>
    <div className="mt-6 grid gap-4 rounded-3xl border bg-white p-6 shadow-sm">
      <label className="font-semibold">Ruleset<select className="mt-1 w-full rounded-xl border p-3" value={ruleset} onChange={e=>setRuleset(e.target.value as any)}><option value="STANDARD">Standard</option><option value="LEAGUE">League</option></select></label>
      <label className="font-semibold">Players<select className="mt-1 w-full rounded-xl border p-3" value={playerCount} onChange={e=>setPlayerCount(Number(e.target.value) as 2|4)}><option value={2}>2 players</option><option value={4}>4 players</option></select></label>
      <div className="flex gap-3"><button disabled={busy} onClick={queue} className="flex-1 rounded-xl bg-black p-3 font-bold text-white disabled:opacity-40">Find game</button><button disabled={!busy} onClick={cancel} className="rounded-xl border px-4 font-bold disabled:opacity-40">Cancel</button></div>
      <p className="rounded-xl bg-slate-50 p-3 text-sm">{status}</p>
    </div>
  </main>;
}
