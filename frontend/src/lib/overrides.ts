import type { LiveMatch } from "@/types";
import { normalizeName, pairKey } from "@/lib/live";

/**
 * Correcciones manuales de marcadores erróneos de la fuente oficial.
 * ──────────────────────────────────────────────────────────────────
 * football-data.org publica ocasionalmente un marcador equivocado en
 * partidos recién terminados (gol mal atribuido, pendiente de VAR…).
 * Mientras la API se autocorrige, esta tabla fija el resultado correcto
 * para que la app no muestre un dato falso.
 *
 * CÓMO USARLA: añade una fila con los nombres tal cual los maneja el
 * modelo (ya normalizados), la fecha del partido y el marcador real
 * orientado a `team1`. BORRA la fila en cuanto football-data corrija
 * el dato (se valida solo: si la API ya coincide, el override es inocuo).
 *
 * Solo se corrigen partidos FINISHED.
 */
export interface ScoreOverride {
  team1: string;      // nombre normalizado (orienta el marcador)
  team2: string;
  date: string;       // YYYY-MM-DD del kickoff (UTC)
  score1: number;     // goles de team1 (resultado REAL)
  score2: number;     // goles de team2
}

export const SCORE_OVERRIDES: ScoreOverride[] = [
  // football-data marcó 5–0; el resultado real fue 4–0 (3 de España + autogol
  // de Al-Tambakti). Borrar cuando la API se corrija.
  { team1: "Spain", team2: "Saudi Arabia", date: "2026-06-21", score1: 4, score2: 0 },
];

/** Índice por par de equipos + día, con el marcador orientado a su team1.
    Perezoso: se construye en la primera llamada para evitar el ciclo de
    imports con live.ts (normalizeName/pairKey se usan en runtime). */
let _index: Map<string, ScoreOverride> | null = null;
function getIndex(): Map<string, ScoreOverride> {
  if (!_index) {
    _index = new Map(
      SCORE_OVERRIDES.map((o) => [
        `${pairKey(normalizeName(o.team1), normalizeName(o.team2))}|${o.date}`,
        o,
      ])
    );
  }
  return _index;
}

/** Día UTC (YYYY-MM-DD) del kickoff, para casar con la fecha del override. */
function utcDay(m: LiveMatch): string | undefined {
  return m.utc ? m.utc.slice(0, 10) : undefined;
}

/**
 * Aplica las correcciones manuales sobre los partidos ya terminados.
 * Devuelve una copia con score1/score2 y winner ajustados al orden de cada
 * partido. No toca partidos en juego ni los que no tienen override.
 */
export function applyScoreOverrides(matches: LiveMatch[]): LiveMatch[] {
  const index = getIndex();
  if (index.size === 0) return matches;
  return matches.map((m) => {
    if (m.score1 === null || m.score2 === null) return m; // solo FINISHED
    const o = index.get(`${pairKey(m.team1, m.team2)}|${utcDay(m)}`);
    if (!o) return m;
    // orienta el marcador del override al orden team1/team2 de este partido
    const oriented =
      m.team1 === normalizeName(o.team1)
        ? { s1: o.score1, s2: o.score2 }
        : { s1: o.score2, s2: o.score1 };
    if (oriented.s1 === m.score1 && oriented.s2 === m.score2) return m; // ya coincide → inocuo
    const winner =
      oriented.s1 > oriented.s2 ? m.team1 : oriented.s2 > oriented.s1 ? m.team2 : null;
    return { ...m, score1: oriented.s1, score2: oriented.s2, winner };
  });
}
