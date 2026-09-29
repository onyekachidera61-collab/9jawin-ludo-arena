"use client";
import {useState} from "react";import {useRouter} from "next/navigation";import {createGuest,getSession,openRealtime} from "../../lib/realtime";
export default function Bots(){
 const router=useRouter();const[name,setName]=useState("");const[difficulty,setDifficulty]=useState("NORMAL");const[count,setCount]=useState<2|4>(2);const[error,setError]=useState("");const[busy,setBusy]=useState(false);
 async function start(){
  setBusy(true);setError("");
  try{
   const displayName=name.trim();if(displayName.length<3||displayName.length>20)throw new Error("INVALID_DISPLAY_NAME");
   let s;try{s=getSession()}catch{s=await createGuest(displayName)}
   if(s.displayName!==displayName)s=await createGuest(displayName);
   const ws=await openRealtime();
   ws.onmessage=e=>{try{const m=JSON.parse(String(e.data));if(m.type==="MATCHMAKING_STATUS"&&m.gameId){ws.close();router.push("/game/"+m.gameId)}else if(m.type==="ERROR"){ws.close();setBusy(false);setError(String(m.code||"BOT_GAME_FAILED"))}}catch{ws.close();setBusy(false);setError("INVALID_REALTIME_RESPONSE")}};
   ws.onerror=()=>{setBusy(false);setError("REALTIME_CONNECTION_FAILED")};
   ws.onclose=()=>{if(busy)setBusy(false)};
   ws.onopen=()=>ws.send(JSON.stringify({type:"CREATE_BOT_GAME",playerCount:count,difficulty,sessionToken:s.sessionToken}));
  }catch(e){setBusy(false);setError(e instanceof Error?e.message:"BOT_GAME_FAILED")}
 }
 return <main className="mx-auto max-w-xl p-6 text-white"><h1 className="text-4xl font-black">Practice with bots</h1><p className="mt-2 text-slate-400">Practice games are never included in the leaderboard.</p><input required minLength={3} maxLength={20} className="mt-6 w-full rounded-xl bg-black/30 p-3" value={name} onChange={e=>setName(e.target.value)} placeholder="Display name"/><select className="mt-3 w-full rounded-xl bg-black/30 p-3" value={difficulty} onChange={e=>setDifficulty(e.target.value)}><option>EASY</option><option>NORMAL</option><option>HARD</option></select><select className="mt-3 w-full rounded-xl bg-black/30 p-3" value={count} onChange={e=>setCount(Number(e.target.value) as 2|4)}><option value={2}>2 players</option><option value={4}>4 players</option></select><button disabled={busy} onClick={start} className="mt-4 w-full rounded-xl bg-amber-400 p-3 font-bold text-slate-950 disabled:opacity-40">{busy?"Starting…":"Start practice"}</button>{error&&<p className="mt-4 text-red-300">{error}</p>}</main>
}