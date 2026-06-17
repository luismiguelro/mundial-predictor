import { normalizeName } from "@/lib/live";
import type { Goalscorer, GoalscorerVictim } from "@/types";

/**
 * Goleadores del Mundial 2026 EN VIVO, desde openfootball (gratis, sin token).
 * El feed que usamos para marcadores (football-data.org) no trae goleadores;
 * openfootball sí los publica por partido (`goals1`/`goals2`) y se actualiza
 * a medida que avanzan los partidos.
 *
 * Reglas (coherentes con las estadísticas oficiales de goleadores):
 *  - los penales SÍ cuentan para el goleador,
 *  - los autogoles NO cuentan (se descartan).
 *
 * Es un tablero APARTE del ranking histórico (que es un snapshot validado
 * hasta Qatar 2022): no mezclamos fuentes para no corromper el histórico.
 */

const OPENFOOTBALL_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

interface OfGoal {
  name?: string;
  minute?: string | number;
  penalty?: boolean;
  owngoal?: boolean;
}
interface OfMatch {
  team1?: string;
  team2?: string;
  goals1?: OfGoal[];
  goals2?: OfGoal[];
}

export interface LiveScorer {
  scorer: string;
  team: string;
  goals: number;
  penalties: number;
  /** Rivales a los que les marcó en 2026 (para fusionar con las víctimas históricas). */
  victims: { team: string; goals: number }[];
}

interface ScorerAgg {
  scorer: string;
  team: string;
  goals: number;
  penalties: number;
  victims: Map<string, number>; // rival → goles
}

/** Fuente PRIMARIA de totales: football-data oficial (vía nuestro proxy /api/scorers).
 *  No trae víctimas; null si no hay token o la API falla. */
async function fetchOfficialScorers(): Promise<Omit<LiveScorer, "victims">[] | null> {
  try {
    const res = await fetch("/api/scorers", { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const raw: { scorer?: string; team?: string; goals?: number; penalties?: number }[] =
      data?.scorers ?? [];
    if (raw.length === 0) return null;
    return raw
      .filter((s) => s.scorer)
      .map((s) => ({
        scorer: s.scorer!,
        team: normalizeName(s.team ?? ""),
        goals: typeof s.goals === "number" ? s.goals : 0,
        penalties: typeof s.penalties === "number" ? s.penalties : 0,
      }));
  } catch {
    return null;
  }
}

/** Fuente de VÍCTIMAS (y fallback de totales): openfootball, gol a gol. */
async function fetchOpenfootballScorers(): Promise<LiveScorer[]> {
  try {
    const res = await fetch(OPENFOOTBALL_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    const matches: OfMatch[] = data?.matches ?? [];

    const agg = new Map<string, ScorerAgg>();
    const add = (g: OfGoal, team: string, opponent: string) => {
      if (!g?.name || g.owngoal) return; // autogol no cuenta para el goleador
      const teamN = normalizeName(team);
      const oppN = normalizeName(opponent);
      const key = `${g.name}|${teamN}`;
      let row = agg.get(key);
      if (!row) {
        row = { scorer: g.name, team: teamN, goals: 0, penalties: 0, victims: new Map() };
        agg.set(key, row);
      }
      row.goals += 1;
      if (g.penalty) row.penalties += 1;
      if (oppN) row.victims.set(oppN, (row.victims.get(oppN) ?? 0) + 1);
    };

    for (const m of matches) {
      (m.goals1 ?? []).forEach((g) => add(g, m.team1 ?? "", m.team2 ?? ""));
      (m.goals2 ?? []).forEach((g) => add(g, m.team2 ?? "", m.team1 ?? ""));
    }

    return [...agg.values()]
      .map((r) => ({
        scorer: r.scorer,
        team: r.team,
        goals: r.goals,
        penalties: r.penalties,
        victims: [...r.victims.entries()]
          .map(([team, goals]) => ({ team, goals }))
          .sort((a, b) => b.goals - a.goals),
      }))
      .sort((a, b) => b.goals - a.goals || a.scorer.localeCompare(b.scorer));
  } catch {
    return [];
  }
}

/**
 * Goleadores del Mundial 2026: totales oficiales (football-data) + víctimas
 * (openfootball). Si no hay API oficial (p.ej. sin token en local), usa
 * openfootball como única fuente.
 */
export async function fetchLiveScorers(): Promise<LiveScorer[]> {
  const [official, openfootball] = await Promise.all([
    fetchOfficialScorers(),
    fetchOpenfootballScorers(),
  ]);

  if (!official) return openfootball;

  const victimsByKey = new Map(
    openfootball.map((s) => [keyOf(s.scorer, s.team), s.victims])
  );
  return official
    .map((o) => ({ ...o, victims: victimsByKey.get(keyOf(o.scorer, o.team)) ?? [] }))
    .sort((a, b) => b.goals - a.goals || a.scorer.localeCompare(b.scorer));
}

/** Fusiona las víctimas históricas con las de 2026 (suma por rival, reordena). */
function mergeVictims(
  base: GoalscorerVictim[],
  live: { team: string; goals: number }[],
  flagFor: (team: string) => string
): GoalscorerVictim[] {
  const m = new Map<string, GoalscorerVictim>();
  for (const v of base) m.set(v.team, { ...v });
  for (const v of live) {
    const ex = m.get(v.team);
    if (ex) ex.goals += v.goals;
    else m.set(v.team, { team: v.team, flag: flagFor(v.team), goals: v.goals });
  }
  return [...m.values()].sort((a, b) => b.goals - a.goals);
}

/* ── Fusión histórico + 2026 en un único ranking actualizado ──────────────── */

export interface CombinedScorer extends Goalscorer {
  /** Cuántos de los goles del total vienen del Mundial 2026 (en vivo). */
  goals2026: number;
}

/** Clave canónica para emparejar el mismo jugador entre fuentes distintas:
 *  sin acentos, en minúsculas, sin puntuación y espacios colapsados. */
function canon(s: string): string {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // quita diacríticos
    .toLowerCase()
    .replace(/[.\-'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const keyOf = (name: string, country: string) => `${canon(name)}|${canon(country)}`;

/**
 * Combina el ranking histórico (snapshot validado) con los goleadores del
 * Mundial 2026 (en vivo). Suma los goles, reordena y marca cuántos vienen de
 * 2026. Los goleadores nuevos de 2026 (sin historial en la lista) se agregan.
 *
 * `flagFor` resuelve la bandera de un equipo (desde teams.json) para los
 * jugadores que solo aparecen en 2026.
 */
export function mergeScorers(
  historical: Goalscorer[],
  live: LiveScorer[],
  flagFor: (team: string) => string
): CombinedScorer[] {
  const byKey = new Map<string, CombinedScorer>();
  for (const h of historical) {
    byKey.set(keyOf(h.scorer, h.country), { ...h, goals2026: 0 });
  }
  for (const s of live) {
    const k = keyOf(s.scorer, s.team);
    const existing = byKey.get(k);
    if (existing) {
      existing.goals += s.goals;
      existing.goals2026 += s.goals;
      existing.victims = mergeVictims(existing.victims, s.victims, flagFor);
    } else {
      byKey.set(k, {
        rank: 0,
        scorer: s.scorer,
        country: s.team,
        flag: flagFor(s.team),
        goals: s.goals,
        goals2026: s.goals,
        victims: mergeVictims([], s.victims, flagFor),
      });
    }
  }
  return [...byKey.values()]
    .sort((a, b) => b.goals - a.goals || b.goals2026 - a.goals2026 || a.scorer.localeCompare(b.scorer))
    .map((e, i) => ({ ...e, rank: i + 1 }));
}
