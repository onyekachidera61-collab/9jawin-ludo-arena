"use client";
import {useState} from "react";

export default function AdminPage(){
 const [secret,setSecret]=useState("");const [gameId,setGameId]=useState("");const [result,setResult]=useState<any>(null);const [error,setError]=useState("");
 async function inspect(e:React.FormEvent){e.preventDefault();setError("");setResult(null);try{const base=(process.env.NEXT_PUBLIC_REALTIME_URL||"ws://localhost:4000").replace(/^ws/,"http");const r=await fetch(base+"/admin/game?game="+encodeURIComponent(gameId),{headers:{authorization:"Bearer "+secret},cache:"no-store"});const body=await r.json();if(!r.ok)throw new Error(body.error||"ADMIN_FAILED");setResult(body)}catch(e){setError(e instanceof Error?e.message:"ADMIN_FAILED")}}
 return <main className="mx-auto min-h-screen max-w-5xl px-6 py-12 text-white"><h1 className="text-4xl font-black">Portable Ludo Admin</h1><p className="mt-2 text-slate-400">Read-only game inspection. No score or winner mutation is exposed.</p>
 <form onSubmit={inspect} className="mt-8 grid gap-3 rounded-3xl border border-white/10 bg-white/5 p-6 sm:grid-cols-[1fr_1fr_auto]"><input value={secret} onChange={e=>setSecret(e.target.value)} type="password" placeholder="Admin secret" className="rounded-xl bg-black/30 p-3"/><input required value={gameId} onChange={e=>setGameId(e.target.value)} placeholder="Game ID" className="rounded-xl bg-black/30 p-3"/><button className="rounded-xl bg-amber-400 px-5 font-black text-slate-950">Inspect</button></form>
 {error&&<p className="mt-5 rounded-xl bg-red-500/10 p-4 text-red-300">{error}</p>}
 {result&&<pre className="mt-5 max-h-[70vh] overflow-auto rounded-3xl bg-black/40 p-5 text-xs text-slate-300">{JSON.stringify(result,null,2)}</pre>}
 </main>
}
