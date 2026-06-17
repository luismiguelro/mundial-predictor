import { NextResponse } from "next/server";

/**
 * Proxy a football-data.org — goleadores oficiales del Mundial 2026.
 * Mismo patrón que /api/live: token server-side, caché de 60 s (1 llamada
 * upstream por minuto sin importar el tráfico). El endpoint de goleadores SÍ
 * está disponible en el plan gratuito para la competición WC.
 *
 * Devuelve solo los TOTALES por jugador (goles). Las "víctimas" (a quién le
 * marcó) no las da esta API: se enriquecen en el cliente con openfootball.
 */

const UPSTREAM = "https://api.football-data.org/v4/competitions/WC/scorers?limit=100";

interface FdScorer {
  player: { name: string | null } | null;
  team: { name: string | null } | null;
  goals: number | null;
  penalties: number | null;
}

export async function GET() {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "FOOTBALL_DATA_TOKEN not set" }, { status: 503 });
  }

  const res = await fetch(UPSTREAM, {
    headers: { "X-Auth-Token": token },
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    return NextResponse.json({ error: `upstream ${res.status}` }, { status: 502 });
  }

  const data = await res.json();
  const scorers = ((data?.scorers ?? []) as FdScorer[])
    .map((s) => ({
      scorer: s.player?.name ?? "",
      team: s.team?.name ?? "",
      goals: typeof s.goals === "number" ? s.goals : 0,
      penalties: typeof s.penalties === "number" ? s.penalties : 0,
    }))
    .filter((s) => s.scorer && s.goals > 0);

  return NextResponse.json(
    { source: "football-data.org", scorers },
    { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" } }
  );
}
