import Link from "next/link";

export default function Home() {
  return <main className="min-h-screen bg-slate-950 text-white"><section className="mx-auto max-w-6xl px-6 py-24"><p className="text-sm font-bold uppercase tracking-[0.25em] text-amber-300">Portable Ludo</p><h1 className="mt-5 max-w-4xl text-5xl font-black tracking-tight sm:text-7xl">Play Ludo with a server that never guesses.</h1><p className="mt-6 max-w-2xl text-lg text-slate-300">Live multiplayer rooms, authoritative dice and movement, reconnect support, turn timers, captures and exact home scoring.</p><div className="mt-9 flex gap-3"><Link className="rounded-xl bg-amber-400 px-6 py-3 font-bold text-slate-950" href="/create-room">Create room</Link><Link className="rounded-xl border border-slate-700 px-6 py-3 font-bold" href="/join-room">Join room</Link></div></section></main>;
}
