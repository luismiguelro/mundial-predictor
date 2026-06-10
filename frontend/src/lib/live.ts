import type { FixedResults, LiveMatch } from "@/types";

/**
 * Resultados en vivo del Mundial 2026 vía openfootball (GitHub raw, sin API key).
 * Si el fetch falla, la app sigue funcionando solo con predicciones.
 */

const LIVE_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

/** openfootball usa algunos nombres distintos al dataset del modelo */
const NAME_MAP: Record<string, string> = {
  "Bosnia & Herzegovina": "Bosnia and Herzegovina",
  USA: "United States",
  "Curaçao": "Curacao",
};

function normalizeName(raw: unknown): string {
  const name =
    typeof raw === "string"
      ? raw
      : ((raw as { name?: string })?.name ?? "");
  return NAME_MAP[name] ?? name;
}

export async function fetchLiveMatches(): Promise<LiveMatch[]> {
  try {
    const res = await fetch(LIVE_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    const matches: unknown[] = data?.matches ?? [];
    return matches.map((m) => {
      const match = m as Record<string, unknown>;
      return {
        team1: normalizeName(match.team1),
        team2: normalizeName(match.team2),
        score1: typeof match.score1 === "number" ? match.score1 : null,
        score2: typeof match.score2 === "number" ? match.score2 : null,
        group: typeof match.group === "string" ? match.group : undefined,
        round: typeof match.round === "string" ? match.round : undefined,
        date: typeof match.date === "string" ? match.date : undefined,
      };
    });
  } catch {
    return [];
  }
}

export function pairKey(t1: string, t2: string): string {
  return [t1, t2].sort().join("|");
}

/** Solo fase de grupos: el knockout real define los cruces, no se simula. */
export function buildFixedResults(matches: LiveMatch[]): FixedResults {
  const fixed: FixedResults = new Map();
  for (const m of matches) {
    if (m.score1 === null || m.score2 === null) continue;
    if (!m.group?.startsWith("Group")) continue;
    const winner = m.score1 > m.score2 ? m.team1 : m.score2 > m.score1 ? m.team2 : null;
    fixed.set(pairKey(m.team1, m.team2), winner);
  }
  return fixed;
}

/** Marcadores reales por par de equipos, para mostrarlos en la UI de grupos. */
export function buildScoreMap(
  matches: LiveMatch[]
): Map<string, { s1: number; s2: number; team1: string }> {
  const scores = new Map<string, { s1: number; s2: number; team1: string }>();
  for (const m of matches) {
    if (m.score1 === null || m.score2 === null) continue;
    if (!m.group?.startsWith("Group")) continue;
    scores.set(pairKey(m.team1, m.team2), { s1: m.score1, s2: m.score2, team1: m.team1 });
  }
  return scores;
}
