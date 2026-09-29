"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, openRealtime } from "../../lib/realtime";

export default function MatchmakingPage() {
  const router = useRouter();
  const [ruleset, setRuleset] = useState<"STANDARD" | "LEAGUE">("STANDARD");
  const [playerCount, setPlayerCount] = useState<2 | 4>(2);
  const [status, setStatus] = useState("Choose a queue.");
  const [busy, setBusy] = useState(false);

  async function queue() {
    const session = getSession();
    if (!session) { router.push("/create-room"); return; }
    setBusy(true);
    setStatus("Connecting to matchmaking…");
    const ws = await openRealtime();
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as { type: string; status?: string; gameId?: string };
      if (message.type === "MATCHMAKING_STATUS") {
        setStatus(message.status === "WAITING" ? "Waiting for players…" : message.status ?? "Matched");
        if (message.gameId) router.push("/game/" + message.gameId);
      }
    };
    ws.send(JSON.stringify({ type: "MATCHMAKING_JOIN", ruleset, playerCount, playerId: session.playerId, displayName: session.displayName, sessionToken: session.sessionToken }));
  }

  useEffect(() => () => setBusy(false), []);

  return <main className="mx-auto max-w-xl p-6">
    <h1 className="text-3xl font-bold">Matchmaking</h1>
    <p className="mt-2 text-slate-600">Join a server-authoritative public game.</p>
    <div className="mt-6 grid gap-4">
      <label>Ruleset<select className="mt-1 w-full rounded border p-2" value={ruleset} onChange={e => setRuleset(e.target.value as "STANDARD" | "LEAGUE")}><option value="STANDARD">Standard</option><option value="LEAGUE">League</option></select></label>
      <label>Players<select className="mt-1 w-full rounded border p-2" value={playerCount} onChange={e => setPlayerCount(Number(e.target.value) as 2 | 4)}><option value={2}>2 players</option><option value={4}>4 players</option></select></label>
      <button disabled={busy} onClick={queue} className="rounded bg-black px-4 py-3 text-white disabled:opacity-50">{busy ? "Searching…" : "Find game"}</button>
      <p>{status}</p>
    </div>
  </main>;
}
