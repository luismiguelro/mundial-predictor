import type { FixedResults, GroupMatch, GroupStandingEntry, LiveMatch, Prediction } from "@/types";
import { applyScoreOverrides } from "@/lib/overrides";

/**
 * Resultados reales del Mundial 2026.
 * Fuente primaria: /api/live (proxy cacheado a football-data.org).
 * Fallback: openfootball (GitHub raw, sin API key) si la API no responde
 * o no hay token configurado. Si ambos fallan, la app sigue funcionando
 * solo con predicciones.
 */

const API_URL = "/api/live";
const OPENFOOTBALL_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

/** Nombres de las fuentes externas → nombres del dataset del modelo */
const NAME_MAP: Record<string, string> = {
  // openfootball
  "Bosnia & Herzegovina": "Bosnia and Herzegovina",
  USA: "United States",
  "Curaçao": "Curacao",
  // football-data.org
  "Bosnia-Herzegovina": "Bosnia and Herzegovina",
  "Korea Republic": "South Korea",
  Czechia: "Czech Republic",
  "Côte d'Ivoire": "Ivory Coast",
  "Congo DR": "DR Congo",
  "Cape Verde Islands": "Cape Verde",
  "Cabo Verde": "Cape Verde",
  "IR Iran": "Iran",
};

export function normalizeName(raw: unknown): string {
  const name =
    typeof raw === "string"
      ? raw
      : ((raw as { name?: string })?.name ?? "");
  return NAME_MAP[name] ?? name;
}

interface ApiMatch {
  team1: string;
  team2: string;
  score1: number | null;
  score2: number | null;
  liveScore1?: number | null;
  liveScore2?: number | null;
  group?: string;
  round?: string;
  utcDate?: string | null;
  status?: string;
  winner?: string | null;
  penalties?: { home: number; away: number } | null;
  decidedBy?: string | null;
}

/** Fuente primaria: football-data.org vía nuestro route handler. */
async function fetchFromApi(): Promise<LiveMatch[] | null> {
  try {
    const res = await fetch(API_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const raw: ApiMatch[] = data?.matches ?? [];
    if (raw.length === 0) return null;
    return raw.map((m) => ({
      team1: normalizeName(m.team1),
      team2: normalizeName(m.team2),
      score1: typeof m.score1 === "number" ? m.score1 : null,
      score2: typeof m.score2 === "number" ? m.score2 : null,
      liveScore1: typeof m.liveScore1 === "number" ? m.liveScore1 : null,
      liveScore2: typeof m.liveScore2 === "number" ? m.liveScore2 : null,
      group: m.group,
      round: m.round,
      // día calendario del usuario: "partidos de hoy" según su zona horaria
      date: m.utcDate ? new Date(m.utcDate).toLocaleDateString("en-CA") : undefined,
      status: m.status,
      utc: m.utcDate ?? undefined,
      winner: m.winner ?? null,
      penalties: m.penalties ?? null,
      decidedBy: m.decidedBy ?? null,
    }));
  } catch {
    return null;
  }
}

/** Fallback: dataset de openfootball en GitHub. */
async function fetchFromOpenfootball(): Promise<LiveMatch[]> {
  try {
    const res = await fetch(OPENFOOTBALL_URL, { signal: AbortSignal.timeout(8000) });
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

export async function fetchLiveMatches(): Promise<LiveMatch[]> {
  const matches = (await fetchFromApi()) ?? (await fetchFromOpenfootball());
  // Correcciones manuales de marcadores erróneos de la fuente (ver overrides.ts)
  return applyScoreOverrides(matches);
}

export function pairKey(t1: string, t2: string): string {
  return [t1, t2].sort().join("|");
}

/* ── Tabla de posiciones OFICIAL (football-data vía /api/standings) ──
   Devuelve cada grupo ya ordenado por la posición oficial (desempates reales:
   diferencia de goles, fair play, etc.). null si no hay token / falla upstream:
   el llamador cae a computeGroupStandings (cálculo propio desde marcadores). */
interface ApiStandingRow {
  position: number;
  team: string;
  played: number; won: number; draw: number; lost: number;
  points: number; gf: number; ga: number; gd: number;
}

export async function fetchStandings(): Promise<Record<string, StandingRow[]> | null> {
  try {
    const res = await fetch("/api/standings", { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const groups: { group: string; table: ApiStandingRow[] }[] = data?.standings ?? [];
    if (groups.length === 0) return null;
    const out: Record<string, StandingRow[]> = {};
    for (const g of groups) {
      out[g.group] = [...g.table]
        .sort((a, b) => a.position - b.position) // respeta el orden oficial
        .map((r) => ({
          team: normalizeName(r.team),
          played: r.played, won: r.won, drawn: r.draw, lost: r.lost,
          gf: r.gf, ga: r.ga, gd: r.gd, points: r.points,
        }));
    }
    return out;
  } catch {
    return null;
  }
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

/* ── Estado en vivo por partido (todas las fases, no solo grupos) ──
   Lo consume el calendario: marcador final, marcador en curso, estado y
   ganador resuelto (incluye penales) para encadenar el cuadro eliminatorio. */
export interface MatchState {
  /** equipo de referencia para orientar el marcador (m.team1 del live) */
  team1: string;
  s1: number | null;       // marcador final (solo FINISHED)
  s2: number | null;
  live1: number | null;    // marcador en curso (IN_PLAY/PAUSED)
  live2: number | null;
  status?: string;
  /** ganador real del cruce, o null si empate/no resuelto */
  winner: string | null;
  /** tanda de penales orientada a team1/team2 (null si no hubo) */
  pen1: number | null;
  pen2: number | null;
  /** REGULAR | EXTRA_TIME | PENALTY_SHOOTOUT (null si no terminó) */
  decidedBy: string | null;
}

export function buildMatchStates(matches: LiveMatch[]): Map<string, MatchState> {
  const out = new Map<string, MatchState>();
  for (const m of matches) {
    if (!m.team1 || !m.team2) continue;
    // ganador: campo explícito (penales) o, en su defecto, el del marcador final
    let winner = m.winner ?? null;
    if (!winner && m.score1 !== null && m.score2 !== null) {
      winner = m.score1 > m.score2 ? m.team1 : m.score2 > m.score1 ? m.team2 : null;
    }
    out.set(pairKey(m.team1, m.team2), {
      team1: m.team1,
      s1: m.score1,
      s2: m.score2,
      live1: m.liveScore1 ?? null,
      live2: m.liveScore2 ?? null,
      status: m.status,
      winner,
      // penalties viene orientado home/away = team1/team2 del partido (= MatchState.team1)
      pen1: m.penalties?.home ?? null,
      pen2: m.penalties?.away ?? null,
      decidedBy: m.decidedBy ?? null,
    });
  }
  return out;
}

/* ── Forma de cada equipo en ESTE Mundial (solo resultados V/E/D) ──
   Insumo para ajustar la predicción de las eliminatorias: cuánto rinde cada
   selección respecto a lo esperado, medido por su saldo de victorias/derrotas
   en lo que lleva jugado (grupos + eliminatorias). No usa goles esperados. */
export interface TeamForm {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  /** saldo de resultados (victorias − derrotas); base del ajuste de forma */
  net: number;
}

export function buildForm(matches: LiveMatch[]): Record<string, TeamForm> {
  const out: Record<string, TeamForm> = {};
  const ensure = (t: string) => (out[t] ??= { played: 0, won: 0, drawn: 0, lost: 0, net: 0 });
  for (const m of matches) {
    if (m.score1 === null || m.score2 === null) continue;
    if (!m.team1 || !m.team2) continue;
    const a = ensure(m.team1), b = ensure(m.team2);
    a.played++; b.played++;
    // ganador real (incluye penales en knockout vía m.winner)
    const w = m.winner ?? (m.score1 > m.score2 ? m.team1 : m.score2 > m.score1 ? m.team2 : null);
    if (w === m.team1)      { a.won++; b.lost++; }
    else if (w === m.team2) { b.won++; a.lost++; }
    else                    { a.drawn++; b.drawn++; }
  }
  for (const f of Object.values(out)) f.net = f.won - f.lost;
  return out;
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

/* ── Modelo vs Realidad: veredicto por cada partido terminado ──
   Usa predictions.json (todas las parejas posibles), así también
   cubre el knockout cuando se definan los cruces. */
export interface MatchVerdict {
  m: LiveMatch;
  predicted: "t1" | "draw" | "t2";
  prob: number;
  probs: { t1: number; draw: number; t2: number };
  hit: boolean;
  /** partido de eliminatoria: el acierto se evalúa sobre quién AVANZÓ (con
      penales), no sobre el marcador de 90'. */
  knockout?: boolean;
}

/** Umbral de "partido parejo": el favorito supera al empate por ≤6 puntos. */
export const TIGHT_THRESHOLD = 0.06;

type Probs3 = { t1: number; draw: number; t2: number };

/** true si no hay favorito claro: empate competitivo frente al mejor equipo. */
export function isTightMatch(p: Probs3): boolean {
  return Math.max(p.t1, p.t2) - p.draw <= TIGHT_THRESHOLD;
}

/**
 * Resultado más probable. Pero si el partido es MUY parejo —los dos equipos van
 * a la par y el empate es casi tan probable como ganar (ej. 36/35/36)— se da por
 * EMPATE en vez de elegir un favorito marginal que es casi un volado.
 */
export function predictedOutcome(p: Probs3): "t1" | "draw" | "t2" {
  if (isTightMatch(p) && Math.abs(p.t1 - p.t2) <= TIGHT_THRESHOLD) return "draw";
  return (Object.entries(p).sort((a, b) => b[1] - a[1])[0][0]) as "t1" | "draw" | "t2";
}

/**
 * Evalúa un pronóstico contra el resultado real.
 * Si pronosticamos EMPATE (partido parejo) y NO termina en empate, igual cuenta
 * como acierto si gana el equipo con mayor probabilidad de ganar — solo fallamos
 * si lo gana el menos probable (un batacazo). Para no-empate, acierto estricto.
 * Además: en cualquier partido PAREJO (avisamos "empate muy probable") un empate
 * real cuenta como acierto, aunque hubiéramos marcado un favorito leve.
 */
export function evaluatePrediction(
  p: Probs3,
  actual: "t1" | "draw" | "t2"
): { predicted: "t1" | "draw" | "t2"; hit: boolean } {
  const predicted = predictedOutcome(p);
  if (predicted === "draw") {
    const favorite = p.t1 >= p.t2 ? "t1" : "t2";
    return { predicted, hit: actual === "draw" || actual === favorite };
  }
  // Partido parejo: si empata, es acierto (coherente con el aviso "empate muy probable").
  if (isTightMatch(p) && actual === "draw") return { predicted, hit: true };
  return { predicted, hit: predicted === actual };
}

/** Índice de probabilidades de la fase de grupos (group_matches.json), por par
    de equipos. Permite que Modelo vs Realidad use las MISMAS probabilidades que
    la pestaña Grupos (con ventaja de localía para anfitriones), y no las
    neutrales de predictions.json — así los aciertos coinciden en ambas vistas. */
export type GroupProbIndex = Map<string, { t1_win: number; draw: number; t2_win: number; team1: string }>;

export function buildGroupProbIndex(groupMatches: Record<string, GroupMatch[]>): GroupProbIndex {
  const out: GroupProbIndex = new Map();
  for (const list of Object.values(groupMatches)) {
    for (const m of list) {
      out.set(pairKey(m.team1, m.team2), {
        t1_win: m.t1_win, draw: m.draw, t2_win: m.t2_win, team1: m.team1,
      });
    }
  }
  return out;
}

export function buildVerdicts(
  matches: LiveMatch[],
  predictions: Record<string, Prediction>,
  groupProbs?: GroupProbIndex,
  /** win-rate histórico en penales por equipo (buildPenRates). Reparte el empate
      al evaluar cruces de eliminatoria; sin él, se reparte 50/50. */
  penRates?: Record<string, number>
): MatchVerdict[] {
  const out: MatchVerdict[] = [];
  for (const m of matches) {
    if (m.score1 === null || m.score2 === null) continue;

    // 1) partido de grupos → mismas probabilidades que la pestaña Grupos
    const gp = groupProbs?.get(pairKey(m.team1, m.team2));
    if (gp) {
      const probs = gp.team1 === m.team1
        ? { t1: gp.t1_win, draw: gp.draw, t2: gp.t2_win }
        : { t1: gp.t2_win, draw: gp.draw, t2: gp.t1_win };
      const actual = m.score1 > m.score2 ? "t1" : m.score1 < m.score2 ? "t2" : "draw";
      const { predicted, hit } = evaluatePrediction(probs, actual);
      out.push({ m, predicted, prob: probs[predicted], probs, hit });
      continue;
    }

    // 2) eliminatoria → predicciones neutrales del modelo. En el mata-mata
    //    SIEMPRE avanza alguien: el acierto es "¿predijimos a quien avanzó?",
    //    colapsando el empate a probabilidad de avance (penales por historial).
    const direct = predictions[`${m.team1}|${m.team2}`];
    const reverse = predictions[`${m.team2}|${m.team1}`];
    let probs: { t1: number; draw: number; t2: number } | null = null;
    if (direct) probs = { t1: direct.home_win, draw: direct.draw, t2: direct.away_win };
    else if (reverse) probs = { t1: reverse.away_win, draw: reverse.draw, t2: reverse.home_win };
    if (!probs) continue;

    // quién avanzó de verdad: m.winner incluye el desempate por penales
    const advanced = m.winner === m.team1 ? "t1"
      : m.winner === m.team2 ? "t2"
      : m.score1 > m.score2 ? "t1"
      : m.score2 > m.score1 ? "t2"
      : null;
    if (!advanced) continue; // empate sin ganador conocido → no evaluable

    const r1 = penRates?.[m.team1] ?? 0.5;
    const r2 = penRates?.[m.team2] ?? 0.5;
    const pAdv1 = probs.t1 + probs.draw * (r1 / (r1 + r2)); // P(avanza team1)
    const predicted = pAdv1 >= 0.5 ? "t1" : "t2";
    out.push({
      m, predicted,
      prob: predicted === "t1" ? pAdv1 : 1 - pAdv1,
      probs,                         // se conserva 1X2 real (la calibración lo usa)
      hit: predicted === advanced,
      knockout: true,
    });
  }
  return out;
}

/* ── Calidad probabilística del pronóstico en vivo ──
   Brier (multiclase) y RPS (Ranked Probability Score). El RPS es la métrica
   estándar en forecasting de fútbol porque respeta el orden natural del
   resultado (local → empate → visitante): castiga menos fallar por poco.
   Ambas: menor = mejor. Se comparan contra un pronóstico uniforme (azar,
   1/3 a cada resultado) sobre los MISMOS partidos, para dar contexto. */
export interface ForecastMetrics {
  n: number;
  brier: number;
  rps: number;
  brierBaseline: number;
  rpsBaseline: number;
}

export function forecastMetrics(verdicts: MatchVerdict[]): ForecastMetrics {
  const U = 1 / 3; // pronóstico uniforme (azar)
  let brierSum = 0, rpsSum = 0, brierBase = 0, rpsBase = 0, n = 0;
  for (const v of verdicts) {
    const { score1, score2 } = v.m;
    if (score1 === null || score2 === null) continue;
    n++;
    const oT1 = score1 > score2 ? 1 : 0;
    const oDraw = score1 === score2 ? 1 : 0;
    const oT2 = score1 < score2 ? 1 : 0;
    // Brier multiclase: Σ (p − o)²
    brierSum += (v.probs.t1 - oT1) ** 2 + (v.probs.draw - oDraw) ** 2 + (v.probs.t2 - oT2) ** 2;
    brierBase += (U - oT1) ** 2 + (U - oDraw) ** 2 + (U - oT2) ** 2;
    // RPS ordinal [t1, draw, t2]: 0.5 · Σ (cumP − cumO)²
    const cp1 = v.probs.t1, cp2 = v.probs.t1 + v.probs.draw;
    const co1 = oT1, co2 = oT1 + oDraw;
    rpsSum += 0.5 * ((cp1 - co1) ** 2 + (cp2 - co2) ** 2);
    rpsBase += 0.5 * ((U - co1) ** 2 + (2 * U - co2) ** 2);
  }
  return {
    n,
    brier: n ? brierSum / n : 0,
    rps: n ? rpsSum / n : 0,
    brierBaseline: n ? brierBase / n : 0,
    rpsBaseline: n ? rpsBase / n : 0,
  };
}

/* ── Calibración del modelo (reliability diagram) ──
   ¿Cuando el modelo dice "60%", ocurre el 60% de las veces? Se mide en
   multiclase one-vs-rest: cada partido aporta 3 pares (probabilidad asignada a
   una clase, ¿ocurrió esa clase?) sobre local/empate/visitante. Se agrupan en
   bins por probabilidad predicha; en cada bin comparamos la confianza media
   predicha con la frecuencia observada. Si coinciden (puntos sobre la diagonal),
   el modelo está bien calibrado. El ECE (Expected Calibration Error) resume la
   desviación media ponderada por nº de casos — menor = mejor. */
export interface ReliabilityBin {
  lo: number;        // límite inferior del bin [0,1)
  hi: number;        // límite superior
  count: number;     // nº de pares (clase × partido) que caen en el bin
  predMean: number;  // confianza media predicha en el bin
  obsFreq: number;   // frecuencia observada de que esas clases ocurrieran
}

export interface Calibration {
  bins: ReliabilityBin[];
  ece: number;       // Expected Calibration Error (0 = perfecto)
  pairs: number;     // nº total de pares evaluados (partidos × 3)
  matches: number;   // nº de partidos terminados que entraron
}

export function calibrationCurve(verdicts: MatchVerdict[], nBins = 5): Calibration {
  const acc = Array.from({ length: nBins }, (_, i) => ({
    lo: i / nBins, hi: (i + 1) / nBins, sumP: 0, sumO: 0, count: 0,
  }));
  let matches = 0;
  for (const v of verdicts) {
    const { score1, score2 } = v.m;
    if (score1 === null || score2 === null) continue;
    matches++;
    const oneVsRest: [number, number][] = [
      [v.probs.t1, score1 > score2 ? 1 : 0],
      [v.probs.draw, score1 === score2 ? 1 : 0],
      [v.probs.t2, score1 < score2 ? 1 : 0],
    ];
    for (const [p, o] of oneVsRest) {
      const idx = Math.min(nBins - 1, Math.max(0, Math.floor(p * nBins)));
      const b = acc[idx];
      b.sumP += p; b.sumO += o; b.count++;
    }
  }
  const pairs = acc.reduce((s, b) => s + b.count, 0);
  const bins: ReliabilityBin[] = acc.map((b) => ({
    lo: b.lo, hi: b.hi, count: b.count,
    predMean: b.count ? b.sumP / b.count : 0,
    obsFreq: b.count ? b.sumO / b.count : 0,
  }));
  let ece = 0;
  for (const b of bins) {
    if (b.count) ece += (b.count / pairs) * Math.abs(b.predMean - b.obsFreq);
  }
  return { bins, ece, pairs, matches };
}

/* ── Posiciones reales por grupo, calculadas con los resultados oficiales ── */
export interface StandingRow {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

export function computeGroupStandings(
  matches: LiveMatch[],
  groups: Record<string, string[]>,
  /** orden por grupo de la tabla oficial (API); solo se usa para romper empates
      que persisten tras puntos/GD/GF/head-to-head (criterio fair-play de FIFA). */
  apiOrder?: Record<string, string[]>
): Record<string, StandingRow[]> {
  const rowByTeam = new Map<string, StandingRow>();
  const out: Record<string, StandingRow[]> = {};
  for (const [g, gteams] of Object.entries(groups)) {
    out[g] = gteams.map((team) => {
      const row: StandingRow = {
        team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0,
      };
      rowByTeam.set(team, row);
      return row;
    });
  }
  for (const m of matches) {
    if (m.score1 === null || m.score2 === null) continue;
    if (!m.group?.startsWith("Group")) continue;
    const r1 = rowByTeam.get(m.team1);
    const r2 = rowByTeam.get(m.team2);
    if (!r1 || !r2) continue;
    r1.played++; r2.played++;
    r1.gf += m.score1; r1.ga += m.score2;
    r2.gf += m.score2; r2.ga += m.score1;
    if (m.score1 > m.score2)      { r1.won++; r2.lost++; r1.points += 3; }
    else if (m.score1 < m.score2) { r2.won++; r1.lost++; r2.points += 3; }
    else                          { r1.drawn++; r2.drawn++; r1.points++; r2.points++; }
  }
  // Partidos de grupo ya jugados (para el desempate por enfrentamiento directo)
  const played = matches.filter(
    (m) => m.score1 !== null && m.score2 !== null && m.group?.startsWith("Group")
  );
  /** Mini-tabla solo entre los equipos empatados (criterio FIFA: head-to-head). */
  const headToHead = (teams: string[]) => {
    const set = new Set(teams);
    const mini = new Map(teams.map((t) => [t, { pts: 0, gd: 0, gf: 0 }]));
    for (const m of played) {
      if (!set.has(m.team1) || !set.has(m.team2)) continue;
      const a = mini.get(m.team1)!, b = mini.get(m.team2)!;
      a.gf += m.score1!; a.gd += m.score1! - m.score2!;
      b.gf += m.score2!; b.gd += m.score2! - m.score1!;
      if (m.score1! > m.score2!) a.pts += 3;
      else if (m.score1! < m.score2!) b.pts += 3;
      else { a.pts++; b.pts++; }
    }
    return mini;
  };

  for (const g of Object.keys(out)) {
    const arr = out[g];
    for (const r of arr) r.gd = r.gf - r.ga;
    // Criterio FIFA: puntos → dif. de goles → goles a favor (todos los partidos)…
    arr.sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);
    // …y para los que siguen empatados, enfrentamiento directo entre ellos.
    let i = 0;
    while (i < arr.length) {
      let j = i + 1;
      while (
        j < arr.length &&
        arr[j].points === arr[i].points && arr[j].gd === arr[i].gd && arr[j].gf === arr[i].gf
      ) j++;
      if (j - i > 1) {
        const tied = arr.slice(i, j);
        const h2h = headToHead(tied.map((r) => r.team));
        const order = apiOrder?.[g] ?? [];
        const apiIdx = (t: string) => { const k = order.indexOf(t); return k === -1 ? 99 : k; };
        tied.sort((a, b) => {
          const ha = h2h.get(a.team)!, hb = h2h.get(b.team)!;
          return hb.pts - ha.pts || hb.gd - ha.gd || hb.gf - ha.gf
            || apiIdx(a.team) - apiIdx(b.team)   // fair-play vía tabla oficial
            || a.team.localeCompare(b.team);
        });
        arr.splice(i, j - i, ...tied);
      }
      i = j;
    }
  }
  return out;
}

/* ── Veredicto del modelo vs resultado real ── */
export type Verdict = { hit: boolean; predicted: "t1" | "draw" | "t2"; prob: number };

/** Compara el resultado más probable según el modelo con el resultado real. */
export function modelVerdict(m: GroupMatch, s: { s1: number; s2: number }): Verdict {
  const actual = s.s1 > s.s2 ? "t1" : s.s1 < s.s2 ? "t2" : "draw";
  const probs = { t1: m.t1_win, draw: m.draw, t2: m.t2_win };
  const { predicted, hit } = evaluatePrediction(probs, actual);
  return { hit, predicted, prob: probs[predicted] };
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

/* ── Aciertos de posición: orden previsto del modelo vs orden real ──
   Una vez que un grupo queda definido (todos sus partidos jugados),
   comparamos la clasificación final real contra la más probable del
   modelo, posición por posición. */

/** Posición final esperada (1 = mejor): Σ pos · P(pos). Menor es mejor. */
function expectedPosition(s: GroupStandingEntry): number {
  return 1 * s.first + 2 * s.second + 3 * s.third + 4 * s.fourth;
}

/** Orden previsto por el modelo (de 1° a último) según la posición esperada. */
export function predictedOrder(standings: GroupStandingEntry[]): string[] {
  return [...standings]
    .sort((a, b) => expectedPosition(a) - expectedPosition(b))
    .map((s) => s.team);
}

export interface GroupPositionResult {
  complete: boolean;   // todos los partidos del grupo terminaron
  order: string[];     // clasificación real (1° → último)
  correct: number;     // posiciones que coinciden con la predicción
  total: number;       // equipos del grupo
}

/** Clasificación real del grupo + nº de posiciones acertadas por el modelo. */
export function groupPositionResult(
  matches: GroupMatch[],
  standings: GroupStandingEntry[],
  liveScores: ScoreMap
): GroupPositionResult {
  const rows = new Map<string, { team: string; pts: number; gd: number; gf: number }>();
  const ensure = (t: string) => {
    let r = rows.get(t);
    if (!r) { r = { team: t, pts: 0, gd: 0, gf: 0 }; rows.set(t, r); }
    return r;
  };
  let played = 0;
  for (const m of matches) {
    const r1 = ensure(m.team1), r2 = ensure(m.team2);
    const s = orientScore(m, liveScores);
    if (!s) continue;
    played++;
    r1.gf += s.s1; r2.gf += s.s2;
    r1.gd += s.s1 - s.s2; r2.gd += s.s2 - s.s1;
    if (s.s1 > s.s2) r1.pts += 3;
    else if (s.s2 > s.s1) r2.pts += 3;
    else { r1.pts += 1; r2.pts += 1; }
  }
  const order = [...rows.values()]
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team))
    .map((r) => r.team);
  const complete = matches.length > 0 && played >= matches.length;
  const predicted = predictedOrder(standings);
  let correct = 0;
  if (complete) {
    for (let i = 0; i < order.length; i++) {
      if (order[i] === predicted[i]) correct++;
    }
  }
  return { complete, order, correct, total: order.length };
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
