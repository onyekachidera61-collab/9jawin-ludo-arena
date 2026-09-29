"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createGuest, createRoom, getSession } from "../../lib/realtime";

export default function CreateRoom(){
 const router=useRouter();
 const [name,setName]=useState(""); const [ruleset,setRuleset]=useState<"STANDARD"|"LEAGUE">("STANDARD");
 const [count,setCount]=useState<2|4>(2); const [turnSeconds,setTurnSeconds]=useState(15); const [botSlots,setBotSlots]=useState(0);
 const [difficulty,setDifficulty]=useState<"EASY"|"NORMAL"|"HARD">("NORMAL"); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");try{let session;try{session=getSession()}catch{session=await createGuest(name)}if(session.displayName!==name.trim()){session=await createGuest(name)}const room=await createRoom(session,count,ruleset,{turnDurationMs:turnSeconds*1000,botSlots,difficulty});router.push("/join-room?room="+encodeURIComponent(room.code))}catch(e){setError(e instanceof Error?e.message:"CREATE_ROOM_FAILED")}finally{setBusy(false)}}
 return <main className="mx-auto min-h-screen max-w-xl px-6 py-12 text-white"><h1 className="text-4xl font-black">Create a room</h1><p className="mt-2 text-slate-400">Private, server-authoritative Ludo.</p>
 <form onSubmit={submit} className="mt-8 space-y-5 rounded-3xl border border-white/10 bg-white/5 p-6">
  <input required minLength={3} maxLength={20} value={name} onChange={e=>setName(e.target.value)} placeholder="Display name" className="w-full rounded-xl bg-black/30 p-3"/>
  <select value={ruleset} onChange={e=>setRuleset(e.target.value as any)} className="w-full rounded-xl bg-black/30 p-3"><option value="STANDARD">Standard</option><option value="LEAGUE">League</option></select>
  <select value={count} onChange={e=>setCount(Number(e.target.value) as 2|4)} className="w-full rounded-xl bg-black/30 p-3"><option value={2}>2 players</option><option value={4}>4 players</option></select>
  <label className="block text-sm font-semibold">Turn duration<select value={turnSeconds} onChange={e=>setTurnSeconds(Number(e.target.value))} className="mt-1 w-full rounded-xl bg-black/30 p-3"><option value={10}>10 seconds</option><option value={15}>15 seconds</option><option value={20}>20 seconds</option><option value={30}>30 seconds</option></select></label>
  <label className="block text-sm font-semibold">Bot slots<select value={botSlots} onChange={e=>setBotSlots(Number(e.target.value))} className="mt-1 w-full rounded-xl bg-black/30 p-3"><option value={0}>No bots</option><option value={1} disabled={count<2}>1 bot</option><option value={2} disabled={count<4}>2 bots</option></select></label>
  {botSlots>0&&<select value={difficulty} onChange={e=>setDifficulty(e.target.value as any)} className="w-full rounded-xl bg-black/30 p-3"><option value="EASY">Easy bots</option><option value="NORMAL">Normal bots</option><option value="HARD">Hard bots</option></select>}
  {error&&<p className="text-red-300">{error}</p>}<button disabled={busy} className="w-full rounded-xl bg-amber-400 p-3 font-bold text-slate-950">{busy?"Creating…":"Create room"}</button>
 </form></main>;
}
