import type { FixedResults, GroupMatch, LiveMatch } from "@/types";

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
export type ScoreMap = Map<string, { s1: number; s2: number; team1: string }>;

export function buildScoreMap(matches: LiveMatch[]): ScoreMap {
  const scores: ScoreMap = new Map();
  for (const m of matches) {
    if (m.score1 === null || m.score2 === null) continue;
    if (!m.group?.startsWith("Group")) continue;
    scores.set(pairKey(m.team1, m.team2), { s1: m.score1, s2: m.score2, team1: m.team1 });
  }
  return scores;
}

/* ── Stats agregadas del torneo en curso (todas las fases) ── */
export interface LiveStats {
  played: number;
  goals: number;
  avg: number;
  last: LiveMatch | null;
}

export function buildLiveStats(matches: LiveMatch[]): LiveStats {
  let played = 0, goals = 0, last: LiveMatch | null = null;
  for (const m of matches) {
    if (m.score1 === null || m.score2 === null) continue;
    played++;
    goals += m.score1 + m.score2;
    if ((m.date ?? "") >= (last?.date ?? "")) last = m;
  }
  return { played, goals, avg: played ? goals / played : 0, last };
}

/* ── Partidos del día ──
   Los de hoy (fecha local del usuario); si hoy no hay jornada,
   el próximo día con partidos pendientes. */
export function fixturesOfTheDay(
  matches: LiveMatch[],
  today: string
): { date: string; fixtures: LiveMatch[] } {
  const dated = matches.filter((m) => m.date);
  const todays = dated.filter((m) => m.date === today);
  if (todays.length > 0) return { date: today, fixtures: todays };
  const nextDate = dated
    .filter((m) => m.date! > today && m.score1 === null)
    .map((m) => m.date!)
    .sort()[0];
  if (!nextDate) return { date: today, fixtures: [] };
  return { date: nextDate, fixtures: dated.filter((m) => m.date === nextDate) };
}

/* ── Veredicto del modelo vs resultado real ── */
export type Verdict = { hit: boolean; predicted: "t1" | "draw" | "t2"; prob: number };

/** Compara el resultado más probable según el modelo con el resultado real. */
export function modelVerdict(m: GroupMatch, s: { s1: number; s2: number }): Verdict {
  const actual = s.s1 > s.s2 ? "t1" : s.s1 < s.s2 ? "t2" : "draw";
  const probs = { t1: m.t1_win, draw: m.draw, t2: m.t2_win } as const;
  const predicted = (Object.entries(probs)
    .sort((a, b) => b[1] - a[1])[0][0]) as Verdict["predicted"];
  return { hit: predicted === actual, predicted, prob: probs[predicted] };
}

/** Orienta el marcador live al orden team1/team2 del fixture local. */
export function orientScore(
  m: GroupMatch,
  liveScores?: ScoreMap
): { s1: number; s2: number } | null {
  const live = liveScores?.get(pairKey(m.team1, m.team2));
  if (!live) return null;
  return live.team1 === m.team1 ? { s1: live.s1, s2: live.s2 } : { s1: live.s2, s2: live.s1 };
}

/** Récord global del modelo sobre los partidos de grupos ya jugados. */
export function modelRecord(
  groupMatches: Record<string, GroupMatch[]>,
  liveScores: ScoreMap
): { played: number; hits: number } {
  let played = 0, hits = 0;
  for (const m of Object.values(groupMatches).flat()) {
    const score = orientScore(m, liveScores);
    if (!score) continue;
    played++;
    if (modelVerdict(m, score).hit) hits++;
  }
  return { played, hits };
}
