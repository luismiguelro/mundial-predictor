import type { LiveMatch, Prediction, TeamInfo } from "@/types";
import { buildFixedResults, buildScoreMap } from "@/lib/live";
import { runMonteCarlo, type Bracket } from "@/lib/simulator";

/* ─────────────────────────────────────────────────────────────
   EVOLUCIÓN DE P(CAMPEÓN) — cómo se mueve el favorito jornada a jornada.
   En cada "corte" temporal volvemos a correr el Monte Carlo condicionando
   SOLO a los partidos de grupo jugados hasta esa fecha. Así obtenemos la
   trayectoria honesta de la probabilidad de cada selección a lo largo del
   torneo (p. ej. España 12 % → 19 % tras la fase de grupos), sin necesidad
   de guardar nada: se recalcula en el navegador con los resultados reales.

   Nota: el Monte Carlo condiciona a resultados de la FASE DE GRUPOS (vía
   fixedResults/scoreMap); el cuadro eliminatorio siempre se simula. Por eso
   la evolución es significativa durante los grupos — justo el periodo en que
   más se mueven las probabilidades.
───────────────────────────────────────────────────────────── */

export interface TrendPoint {
  /** fecha límite del corte (YYYY-MM-DD), o null = pretorneo (sin resultados) */
  date: string | null;
  /** nº de partidos de grupo ya jugados hasta este corte */
  played: number;
  /** P(campeón) por equipo en este corte */
  champ: Record<string, number>;
}

/** Máximo de cortes a calcular (cada uno es una corrida de Monte Carlo). */
const MAX_CUTS = 8;

export function buildChampionTrend(
  predictions: Record<string, Prediction>,
  groups: Record<string, string[]>,
  teams: Record<string, TeamInfo>,
  bracket: Bracket | null | undefined,
  liveMatches: LiveMatch[],
  n = 1200,
): TrendPoint[] {
  // Partidos ya jugados con fecha (grupos + eliminatoria): definen los cortes
  // y condicionan el modelo —los grupos vía marcador real, el KO vía quién avanzó.
  const played = liveMatches.filter(
    (m) => m.score1 !== null && m.score2 !== null && m.date,
  );
  const dates = [...new Set(played.map((m) => m.date!))].sort();
  if (dates.length === 0) return []; // aún no hay nada que mostrar

  // Cortes: pretorneo + cada fecha jugada. Si hay demasiadas fechas,
  // submuestreamos a MAX_CUTS conservando siempre el inicio y el último corte.
  let cutDates: (string | null)[] = [null, ...dates];
  if (cutDates.length > MAX_CUTS) {
    const picked: (string | null)[] = [null];
    const step = (dates.length - 1) / (MAX_CUTS - 2);
    for (let i = 0; i < MAX_CUTS - 2; i++) picked.push(dates[Math.round(i * step)]);
    picked.push(dates[dates.length - 1]);
    cutDates = [...new Set(picked)];
  }

  const points: TrendPoint[] = [];
  for (const cut of cutDates) {
    const upTo = cut === null ? [] : played.filter((m) => m.date! <= cut);
    // buildFixedResults/buildScoreMap ya filtran solo grupos; el KO de `upTo`
    // se aplica vía runMonteCarlo (8.º arg) → 0 % a los eliminados a esa fecha.
    const fixed = buildFixedResults(upTo);
    const scoreMap = buildScoreMap(upTo);
    const sims = runMonteCarlo(predictions, groups, teams, n, fixed, scoreMap, bracket ?? undefined, upTo);
    const champ: Record<string, number> = {};
    for (const s of sims) champ[s.team] = s.champion;
    points.push({ date: cut, played: upTo.length, champ });
  }
  return points;
}

/** Variación de P(campeón) de un equipo entre el primer y el último corte. */
export interface TrendDelta {
  team: string;
  first: number;   // P(campeón) en el primer corte (pretorneo)
  last: number;    // P(campeón) en el último corte
  delta: number;   // last − first
}

/** Equipos ordenados por su P(campeón) actual, con la variación desde el inicio. */
export function trendDeltas(points: TrendPoint[]): TrendDelta[] {
  if (points.length === 0) return [];
  const first = points[0].champ;
  const last = points[points.length - 1].champ;
  return Object.keys(last)
    .map((team) => ({
      team,
      first: first[team] ?? 0,
      last: last[team] ?? 0,
      delta: (last[team] ?? 0) - (first[team] ?? 0),
    }))
    .sort((a, b) => b.last - a.last);
}
