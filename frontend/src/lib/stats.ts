import type { SiteStats, LiveMatch, TeamInfo, Upset, TopScoringTeam } from "@/types";

/**
 * Suma al histórico (SiteStats) lo que va del Mundial 2026: KPIs (partidos,
 * goles, media, ediciones), récords (partido más goleador, mayor goleada),
 * gráfica por edición, sorpresas por ELO y equipos más goleadores.
 *
 * No reescribe la historia: parte del snapshot histórico y le añade los
 * partidos 2026 ya terminados. Los equipos/sorpresas nuevos solo se agregan
 * cuando tiene sentido (los equipos goleadores solo se actualizan si ya
 * estaban en el top histórico, para no inventar totales incompletos).
 */
export function augmentStats(
  stats: SiteStats,
  liveMatches: LiveMatch[],
  teams: Record<string, TeamInfo>
): { stats: SiteStats; added: number } {
  const finished = liveMatches
    .filter((m) => m.score1 != null && m.score2 != null)
    .map((m) => ({ team1: m.team1, team2: m.team2, s1: m.score1 as number, s2: m.score2 as number }));

  if (finished.length === 0) return { stats, added: 0 };

  const flag = (t: string) => teams[t]?.flag ?? "🏳️";
  const elo = (t: string) => teams[t]?.elo ?? 0;

  const m2026 = finished.length;
  const g2026 = finished.reduce((n, m) => n + m.s1 + m.s2, 0);

  // ── KPIs ──
  const total_matches = stats.total_matches + m2026;
  const total_goals = stats.total_goals + g2026;
  const avg_goals_all = total_goals / total_matches;
  const n_editions = stats.n_editions + 1; // 2026 es una edición más

  // ── Récords ──
  let highest = stats.highest_scoring_match;
  let biggest = stats.biggest_victory;
  for (const m of finished) {
    const total = m.s1 + m.s2;
    if (total > highest.total) {
      highest = {
        home_team: m.team1, away_team: m.team2,
        home_score: m.s1, away_score: m.s2,
        total, year: 2026, flag_home: flag(m.team1), flag_away: flag(m.team2),
      };
    }
    const margin = Math.abs(m.s1 - m.s2);
    if (margin > biggest.margin) {
      const [hw, aw, hs, as_] = m.s1 >= m.s2
        ? [m.team1, m.team2, m.s1, m.s2]
        : [m.team2, m.team1, m.s2, m.s1];
      biggest = {
        home_team: hw as string, away_team: aw as string,
        home_score: hs as number, away_score: as_ as number,
        margin, year: 2026, flag_home: flag(hw as string), flag_away: flag(aw as string),
      };
    }
  }

  // ── Gráfica por edición + mejor/peor media ──
  const avg2026 = g2026 / m2026;
  const goals_by_year = [...stats.goals_by_year, { year: 2026, total: g2026, matches: m2026, avg: avg2026 }];
  const best_avg_edition = avg2026 > stats.best_avg_edition.avg ? { year: 2026, avg: avg2026 } : stats.best_avg_edition;
  const worst_avg_edition = avg2026 < stats.worst_avg_edition.avg ? { year: 2026, avg: avg2026 } : stats.worst_avg_edition;

  // ── Equipos más goleadores (solo se actualizan los que ya estaban en el top) ──
  const byTeam = new Map<string, TopScoringTeam>(stats.top_scoring_teams.map((t) => [t.team, { ...t }]));
  for (const m of finished) {
    const a = byTeam.get(m.team1);
    const b = byTeam.get(m.team2);
    if (a) { a.matches += 1; a.goals_for += m.s1; a.goals_against += m.s2; }
    if (b) { b.matches += 1; b.goals_for += m.s2; b.goals_against += m.s1; }
  }
  const top_scoring_teams = [...byTeam.values()]
    .map((t) => ({ ...t, goal_diff: t.goals_for - t.goals_against, avg: t.matches ? t.goals_for / t.matches : 0 }))
    .sort((a, b) => b.goals_for - a.goals_for);

  // ── Sorpresas por ELO (perdió el de mayor ELO) ──
  const upsets2026: Upset[] = [];
  for (const m of finished) {
    if (m.s1 === m.s2) continue;
    const winner = m.s1 > m.s2 ? m.team1 : m.team2;
    const loser = m.s1 > m.s2 ? m.team2 : m.team1;
    const eW = elo(winner);
    const eL = elo(loser);
    if (eL > eW && eW > 0) {
      upsets2026.push({
        year: 2026,
        home_team: m.team1, away_team: m.team2,
        home_score: m.s1, away_score: m.s2,
        favored: loser, winner,
        elo_favored: Math.round(eL), elo_winner: Math.round(eW),
        elo_advantage: Math.round(eL - eW),
        flag_favored: flag(loser), flag_winner: flag(winner),
      });
    }
  }
  const top_upsets = [...stats.top_upsets, ...upsets2026]
    .sort((a, b) => b.elo_advantage - a.elo_advantage)
    .slice(0, stats.top_upsets.length);

  return {
    added: m2026,
    stats: {
      ...stats,
      total_matches, total_goals, avg_goals_all, n_editions,
      highest_scoring_match: highest, biggest_victory: biggest,
      goals_by_year, best_avg_edition, worst_avg_edition,
      top_scoring_teams, top_upsets,
    },
  };
}
