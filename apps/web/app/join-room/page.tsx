"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { joinRoom, roomStatus } from "../../lib/realtime";

export default function JoinRoom() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // Read the optional room query only in the browser so Next.js can prerender this route safely.\n  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    if (room) setCode(room.toUpperCase());
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await joinRoom(code, name);
      if (result.gameId) router.push("/game/" + result.gameId);
      else {
        setMessage("Waiting for another player…");
        const poll = window.setInterval(async () => {
          try {
            const room = await roomStatus(code);
            if (room.gameId) {
              window.clearInterval(poll);
              router.push("/game/" + room.gameId);
            }
          } catch {
            window.clearInterval(poll);
          }
        }, 2000);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "JOIN_FAILED");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-16 text-white">
      <h1 className="text-4xl font-black">Join a room</h1>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="LUDO-AB12" className="w-full rounded-xl bg-slate-900 p-3" />
        <input required minLength={3} maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" className="w-full rounded-xl bg-slate-900 p-3" />
        <button disabled={busy} className="w-full rounded-xl bg-amber-400 p-3 font-bold text-slate-950">
          {busy ? "Joining…" : "Join room"}
        </button>
        {message && <p className="text-amber-200">{message}</p>}
      </form>
    </main>
  );
}
