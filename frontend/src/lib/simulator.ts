import type { FixedResults, Prediction, SimResult, TeamInfo } from "@/types";
import type { ScoreMap } from "@/lib/live";
import { pairKey } from "@/lib/live";

type Probs = { home_win: number; draw: number; away_win: number };
type PredictionsMap = Record<string, Prediction>;
type Groups = Record<string, string[]>;
type PenRates = Record<string, number>;

// ── Cuadro eliminatorio oficial 2026 (bracket.json) ──
type Slot =
  | { type: "pos"; pos: number; group: string }   // 1A / 2B → ganador/segundo de grupo
  | { type: "third"; groups: string[] }            // 3A/B/… → mejor tercero de esos grupos
  | { type: "raw"; value: string };
interface R32Cross { num: number; a: Slot; b: Slot }
interface KoCross { num: number; a: string; b: string }  // a/b: "W74" (ganador del 74)
export interface Bracket { r32: R32Cross[]; ko: KoCross[] }

function getProbs(predictions: PredictionsMap, t1: string, t2: string): Probs {
  return (
    predictions[`${t1}|${t2}`] ??
    (predictions[`${t2}|${t1}`]
      ? {
          home_win: predictions[`${t2}|${t1}`].away_win,
          draw: predictions[`${t2}|${t1}`].draw,
          away_win: predictions[`${t2}|${t1}`].home_win,
        }
      : { home_win: 0.34, draw: 0.32, away_win: 0.34 })
  );
}

/** Goles esperados (λ) de cada equipo, orientados al orden (t1, t2). */
function getLambdas(predictions: PredictionsMap, t1: string, t2: string): { l1: number; l2: number } {
  const d = predictions[`${t1}|${t2}`];
  if (d?.exp_home != null && d?.exp_away != null) return { l1: d.exp_home, l2: d.exp_away };
  const r = predictions[`${t2}|${t1}`];
  if (r?.exp_home != null && r?.exp_away != null) return { l1: r.exp_away, l2: r.exp_home };
  return { l1: 1.3, l2: 1.3 };
}

/** Muestrea un número de goles ~ Poisson(λ) (algoritmo de Knuth). */
function samplePoisson(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

function sampleOutcome(p: Probs): "home" | "draw" | "away" {
  const r = Math.random();
  if (r < p.home_win) return "home";
  if (r < p.home_win + p.draw) return "draw";
  return "away";
}

/**
 * Win rate histórico en tandas de penales, suavizado hacia 0.5
 * (Laplace: +2 victorias / +4 tandas). Equipos sin historial → 0.5.
 */
export function buildPenRates(teams: Record<string, TeamInfo>): PenRates {
  const rates: PenRates = {};
  for (const [name, t] of Object.entries(teams)) {
    rates[name] = ((t.pen_wins ?? 0) + 2) / ((t.pen_total ?? 0) + 4);
  }
  return rates;
}

/** Empate en knockout → penales ponderados por historial (Bradley-Terry). */
function sampleKnockout(p: Probs, t1: string, t2: string, pens?: PenRates): string {
  const o = sampleOutcome(p);
  if (o === "draw") {
    const r1 = pens?.[t1] ?? 0.5;
    const r2 = pens?.[t2] ?? 0.5;
    return Math.random() < r1 / (r1 + r2) ? t1 : t2;
  }
  return o === "home" ? t1 : t2;
}

interface TeamStat { pts: number; gf: number; ga: number; }

function simulateGroup(
  teams: string[],
  predictions: PredictionsMap,
  elos: Record<string, number>,
  scoreMap?: ScoreMap,
  fixed?: FixedResults,
  hostBoost?: Record<string, number>
): { standings: string[]; stats: Record<string, TeamStat> } {
  const stat: Record<string, TeamStat> = Object.fromEntries(
    teams.map((t) => [t, { pts: 0, gf: 0, ga: 0 }])
  );

  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const t1 = teams[i], t2 = teams[j];
      const key = pairKey(t1, t2);
      let g1: number, g2: number;

      const real = scoreMap?.get(key);
      if (real) {
        // partido ya jugado: marcador real, orientado al orden (t1, t2)
        [g1, g2] = real.team1 === t1 ? [real.s1, real.s2] : [real.s2, real.s1];
      } else if (fixed?.has(key)) {
        // jugado pero sin marcador disponible: aproximación desde el ganador
        const w = fixed.get(key);
        [g1, g2] = w == null ? [1, 1] : w === t1 ? [1, 0] : [0, 1];
      } else {
        // partido futuro: se muestrea el marcador con los λ del modelo,
        // con ventaja de localía si el equipo es anfitrión (juega en casa)
        let { l1, l2 } = getLambdas(predictions, t1, t2);
        l1 *= hostBoost?.[t1] ?? 1;
        l2 *= hostBoost?.[t2] ?? 1;
        g1 = samplePoisson(l1);
        g2 = samplePoisson(l2);
      }

      stat[t1].gf += g1; stat[t1].ga += g2;
      stat[t2].gf += g2; stat[t2].ga += g1;
      if (g1 > g2) stat[t1].pts += 3;
      else if (g1 < g2) stat[t2].pts += 3;
      else { stat[t1].pts++; stat[t2].pts++; }
    }
  }

  // Desempates FIFA: puntos → diferencia de goles → goles a favor → ELO (proxy)
  const standings = [...teams].sort((a, b) =>
    stat[b].pts - stat[a].pts ||
    (stat[b].gf - stat[b].ga) - (stat[a].gf - stat[a].ga) ||
    stat[b].gf - stat[a].gf ||
    (elos[b] ?? 1500) - (elos[a] ?? 1500)
  );
  return { standings, stats: stat };
}

/** Etapa que ALCANZA el ganador del partido `num` (R32→Final, nums del fixture). */
function stageWonBy(num: number): "r16" | "qf" | "sf" | "final" | "champion" {
  if (num <= 88) return "r16";      // 73-88: ganar en R32 → llega a octavos
  if (num <= 96) return "qf";       // 89-96: octavos → cuartos
  if (num <= 100) return "sf";      // 97-100: cuartos → semis
  if (num <= 102) return "final";   // 101-102: semis → final
  return "champion";                // 103: gana la final
}

/**
 * Asigna los mejores terceros a los slots "3X/Y/…" respetando, para cada slot,
 * los grupos admitidos (emparejamiento bipartito por backtracking). Devuelve
 * un mapa "num:lado" → equipo.
 */
function matchThirds(
  slots: { num: number; side: "a" | "b"; groups: string[] }[],
  thirds: { team: string; group: string }[]
): Record<string, string> {
  const byGroup: Record<string, string> = {};
  for (const t of thirds) byGroup[t.group] = t.team; // cada grupo aporta ≤1 tercero
  const used = new Set<string>();
  const out: Record<string, string> = {};

  const bt = (i: number): boolean => {
    if (i === slots.length) return true;
    const s = slots[i];
    for (const g of s.groups) {
      if (byGroup[g] && !used.has(g)) {
        used.add(g);
        out[`${s.num}:${s.side}`] = byGroup[g];
        if (bt(i + 1)) return true;
        used.delete(g);
      }
    }
    return false;
  };

  if (!bt(0)) {
    // Fallback (combinación sin matching perfecto): asigna sobrantes en orden.
    const free = thirds.filter((t) => !Object.values(out).includes(t.team));
    let k = 0;
    for (const s of slots) {
      const key = `${s.num}:${s.side}`;
      if (!out[key] && k < free.length) out[key] = free[k++].team;
    }
  }
  return out;
}

function resolveSlot(
  slot: Slot, num: number, side: "a" | "b",
  groupStandings: Record<string, string[]>,
  thirdAssign: Record<string, string>
): string {
  if (slot.type === "pos") return groupStandings[slot.group]?.[slot.pos] ?? "";
  if (slot.type === "third") return thirdAssign[`${num}:${side}`] ?? "";
  return slot.value;
}

/** Juega el cuadro eliminatorio oficial y acumula las rondas alcanzadas. */
function playKnockout(
  bracket: Bracket,
  groupStandings: Record<string, string[]>,
  top8: { team: string; group: string }[],
  predictions: PredictionsMap,
  pens: PenRates,
  counts: Record<string, Record<string, number>>
): void {
  // Asignación de terceros a sus slots
  const thirdSlots: { num: number; side: "a" | "b"; groups: string[] }[] = [];
  for (const c of bracket.r32) {
    if (c.a.type === "third") thirdSlots.push({ num: c.num, side: "a", groups: c.a.groups });
    if (c.b.type === "third") thirdSlots.push({ num: c.num, side: "b", groups: c.b.groups });
  }
  const thirdAssign = matchThirds(thirdSlots, top8);

  const winByNum: Record<number, string> = {};

  // R32: resolver slots → equipos, contar participación y simular
  for (const c of bracket.r32) {
    const a = resolveSlot(c.a, c.num, "a", groupStandings, thirdAssign);
    const b = resolveSlot(c.b, c.num, "b", groupStandings, thirdAssign);
    if (!a || !b) continue;
    if (counts[a]) counts[a].r32++;
    if (counts[b]) counts[b].r32++;
    const w = sampleKnockout(getProbs(predictions, a, b), a, b, pens);
    winByNum[c.num] = w;
    if (counts[w]) counts[w][stageWonBy(c.num)]++;
  }

  // R16 → Final: encadenar ganadores ("W74" → winByNum[74])
  for (const c of bracket.ko) {
    const a = winByNum[parseInt(c.a.slice(1), 10)];
    const b = winByNum[parseInt(c.b.slice(1), 10)];
    if (!a || !b) continue;
    const w = sampleKnockout(getProbs(predictions, a, b), a, b, pens);
    winByNum[c.num] = w;
    if (counts[w]) counts[w][stageWonBy(c.num)]++;
  }
}

export function runMonteCarlo(
  predictions: PredictionsMap,
  groups: Groups,
  teams: Record<string, TeamInfo>,
  n = 1000,
  fixedResults?: FixedResults,
  scoreMap?: ScoreMap,
  bracket?: Bracket
): SimResult[] {
  const allTeams = Object.values(groups).flat();
  const stages = ["r32", "r16", "qf", "sf", "final", "champion"] as const;
  const positions = ["first", "second", "third", "fourth"] as const;
  const counts: Record<string, Record<string, number>> = {};
  for (const t of allTeams) {
    counts[t] = Object.fromEntries([...stages, ...positions].map((s) => [s, 0]));
  }

  const elos = Object.fromEntries(allTeams.map((t) => [t, teams[t]?.elo ?? 1500]));
  const hostBoost = Object.fromEntries(allTeams.map((t) => [t, teams[t]?.host_boost ?? 1]));
  const penRates = buildPenRates(teams);

  for (let sim = 0; sim < n; sim++) {
    const groupStandings: Record<string, string[]> = {};
    const thirds: Array<{ team: string; group: string; pts: number; gd: number; gf: number; elo: number }> = [];

    for (const [gname, gteams] of Object.entries(groups)) {
      const { standings, stats } = simulateGroup(gteams, predictions, elos, scoreMap, fixedResults, hostBoost);
      groupStandings[gname] = standings;
      // track group finish positions (0=1st, 1=2nd, 2=3rd, 3=4th)
      standings.forEach((t, i) => { counts[t][positions[Math.min(i, 3)]]++; });
      const third = standings[2];
      const s = stats[third];
      thirds.push({ team: third, group: gname, pts: s.pts, gd: s.gf - s.ga, gf: s.gf, elo: elos[third] ?? 1500 });
    }

    // Mejores 8 terceros con los mismos desempates FIFA
    thirds.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || b.elo - a.elo);
    const top8 = thirds.slice(0, 8);

    if (bracket) {
      // Cuadro eliminatorio oficial 2026
      playKnockout(bracket, groupStandings, top8, predictions, penRates, counts);
    } else {
      // Fallback: sorteo aleatorio (sin estructura oficial)
      const flat = [
        ...Object.values(groupStandings).flatMap((s) => [s[0], s[1]]),
        ...top8.map((x) => x.team),
      ];
      for (const t of flat) counts[t].r32++;
      for (let i = flat.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [flat[i], flat[j]] = [flat[j], flat[i]];
      }
      const roundKeys: (typeof stages[number])[] = ["r16", "qf", "sf", "final", "champion"];
      let current = flat;
      for (const stage of roundKeys) {
        const next: string[] = [];
        for (let i = 0; i < current.length; i += 2) {
          next.push(sampleKnockout(getProbs(predictions, current[i], current[i + 1]), current[i], current[i + 1], penRates));
        }
        for (const t of next) counts[t][stage]++;
        current = next;
        if (stage === "champion") break;
      }
    }
  }

  return allTeams
    .map((team) => ({
      team,
      flag: teams[team]?.flag ?? "🏳️",
      group: teams[team]?.group ?? "?",
      confederation: teams[team]?.confederation ?? "?",
      elo: elos[team],
      first:   counts[team].first   / n,
      second:  counts[team].second  / n,
      third:   counts[team].third   / n,
      fourth:  counts[team].fourth  / n,
      r32:     counts[team].r32     / n,
      r16:     counts[team].r16     / n,
      qf:      counts[team].qf      / n,
      sf:      counts[team].sf      / n,
      final:   counts[team].final   / n,
      champion: counts[team].champion / n,
    }))
    .sort((a, b) => b.champion - a.champion);
}
