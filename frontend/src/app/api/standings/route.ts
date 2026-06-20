import { NextResponse } from "next/server";

/**
 * Proxy a football-data.org — tabla de posiciones OFICIAL del Mundial 2026.
 * La usamos en vez de calcular nosotros el orden, porque los desempates reales
 * (diferencia de goles, goles a favor, fair play / tarjetas, head-to-head…) los
 * resuelve la fuente oficial. Mismo patrón de caché que /api/live (60 s).
 *
 * Sin token o con error upstream responde 5xx y el cliente cae al cálculo
 * propio a partir de los marcadores (ver computeGroupStandings en lib/live.ts).
 */

const UPSTREAM = "https://api.football-data.org/v4/competitions/WC/standings";

interface FdRow {
  position: number;
  team: { name: string | null } | null;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

interface FdGroup {
  stage: string | null;
  type: string | null;     // TOTAL | HOME | AWAY
  group: string | null;    // ¡OJO! el endpoint de standings usa "Group A" (con espacio),
  table: FdRow[];          // no "GROUP_A" como el de /matches
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
  const groups = ((data?.standings ?? []) as FdGroup[])
    .filter((g) => (g.type ?? "TOTAL") === "TOTAL" && /^group[_\s]/i.test(g.group ?? ""))
    .map((g) => ({
      // acepta "Group A" (standings) y "GROUP_A" (por si acaso) → "A"
      group: (g.group ?? "").replace(/^group[_\s]+/i, "").trim().toUpperCase(),
      table: (g.table ?? []).map((r) => ({
        position: r.position,
        team: r.team?.name ?? "",
        played: r.playedGames,
        won: r.won,
        draw: r.draw,
        lost: r.lost,
        points: r.points,
        gf: r.goalsFor,
        ga: r.goalsAgainst,
        gd: r.goalDifference,
      })),
    }));

  return NextResponse.json(
    { source: "football-data.org", standings: groups },
    { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" } }
  );
}
