import type { FixedResults, LiveMatch, Prediction, SimResult, TeamInfo } from "@/types";
import type { MatchState, ScoreMap, StandingRow } from "@/lib/live";
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

export function getProbs(predictions: PredictionsMap, t1: string, t2: string): Probs {
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

/**
 * Probabilidad de que cada equipo GANE el cruce de eliminatoria (incluye el
 * desempate por penales, repartido según el historial igual que sampleKnockout).
 * Devuelve {pa, pb} con pa+pb = 1, orientado al orden (a, b).
 */
export function crossWinProb(
  predictions: PredictionsMap, a: string, b: string, pens?: PenRates
): { pa: number; pb: number } {
  const p = getProbs(predictions, a, b);
  const r1 = pens?.[a] ?? 0.5;
  const r2 = pens?.[b] ?? 0.5;
  const pa = p.home_win + p.draw * (r1 / (r1 + r2));
  return { pa, pb: 1 - pa };
}

/** Goles esperados (λ) de cada equipo, orientados al orden (t1, t2). */
export function getLambdas(predictions: PredictionsMap, t1: string, t2: string): { l1: number; l2: number } {
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

/* ── Realidad del mata-mata: condiciona las proyecciones a los resultados
   reales de eliminatoria (no solo grupos). Un equipo eliminado de verdad cae a
   0 % en las rondas que ya no puede alcanzar; uno que superó una ronda real
   queda en 100 % en las fases ya logradas. La fuente es la API (m.round con el
   stage y m.winner con quién avanzó, penales incluidos). ── */
const KO_FIELDS = ["r32", "r16", "qf", "sf", "final", "champion"] as const;
const STAGE_FIELD: Record<string, "r32" | "r16" | "qf" | "sf" | "final"> = {
  LAST_32: "r32", LAST_16: "r16", QUARTER_FINALS: "qf", SEMI_FINALS: "sf", FINAL: "final",
};

export function applyKnockoutReality(results: SimResult[], liveMatches: LiveMatch[]): SimResult[] {
  const reachedIdx: Record<string, number> = {};  // fase más alta garantizada (idx en KO_FIELDS)
  const eliminated: Record<string, boolean> = {};
  const bump = (team: string, idx: number) => {
    if (!(team in reachedIdx) || idx > reachedIdx[team]) reachedIdx[team] = idx;
  };

  for (const m of liveMatches) {
    const field = m.round ? STAGE_FIELD[m.round] : undefined;
    if (!field) continue;
    if (m.score1 === null || m.score2 === null) continue;   // solo cruces terminados
    const t1 = m.team1, t2 = m.team2;
    if (!t1 || !t2) continue;
    const idx = KO_FIELDS.indexOf(field);
    bump(t1, idx); bump(t2, idx);                            // ambos jugaron esa fase
    const winner = m.winner ?? (m.score1 > m.score2 ? t1 : m.score2 > m.score1 ? t2 : null);
    if (!winner) continue;                                   // empate sin desempate conocido
    eliminated[winner === t1 ? t2 : t1] = true;
    bump(winner, Math.min(idx + 1, KO_FIELDS.length - 1));   // el ganador llega a la siguiente
  }

  return results.map((s) => {
    const ri = reachedIdx[s.team];
    if (ri === undefined) return s;                          // sin partidos KO reales aún
    const out = { ...s };
    for (let i = 0; i < KO_FIELDS.length; i++) {
      if (i <= ri) (out[KO_FIELDS[i]] as number) = 1;        // fase ya alcanzada con certeza
      else if (eliminated[s.team]) (out[KO_FIELDS[i]] as number) = 0; // eliminado: 0 hacia adelante
    }
    return out;
  });
}

export function runMonteCarlo(
  predictions: PredictionsMap,
  groups: Groups,
  teams: Record<string, TeamInfo>,
  n = 1000,
  fixedResults?: FixedResults,
  scoreMap?: ScoreMap,
  bracket?: Bracket,
  /** si se pasa, condiciona las proyecciones a los resultados reales del KO */
  liveMatches?: LiveMatch[]
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

  const out = allTeams
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
    }));

  // Condicionar a los resultados reales del mata-mata (eliminados → 0 %)
  const adjusted = liveMatches ? applyKnockoutReality(out, liveMatches) : out;
  return adjusted.sort((a, b) => b.champion - a.champion);
}

/* ──────────────────────────────────────────────────────────────
   CAMINO AL TÍTULO de un equipo (Monte Carlo, ruta personalizada)
   Para el equipo objetivo, en cada ronda del cuadro registra contra
   quién jugaría y con qué probabilidad supera la ronda. Condiciona los
   grupos a los resultados reales (igual que «Proyecciones · Por ronda»);
   el mata-mata se simula. Requiere el bracket oficial.
────────────────────────────────────────────────────────────── */
export interface TeamPathRound {
  round: "r32" | "r16" | "qf" | "sf" | "final";
  /** P(el equipo llega a jugar esta ronda) */
  reach: number;
  /** P(supera esta ronda) — incondicional */
  advance: number;
  /** P(supera | llega): la dificultad real de esa ronda */
  condAdvance: number;
  /** rivales más probables en esa ronda (condicional a llegar) */
  topOpponents: { team: string; prob: number }[];
}
export interface TeamPath {
  team: string;
  rounds: TeamPathRound[];
  /** P(campeón) = supera la final */
  champion: number;
}

/** Ronda del equipo a partir del nº de partido del fixture oficial. */
function roundOfNum(num: number): TeamPathRound["round"] {
  if (num <= 88) return "r32";
  if (num <= 96) return "r16";
  if (num <= 100) return "qf";
  if (num <= 102) return "sf";
  return "final";
}

/** Estado real del mata-mata de un equipo: hasta qué ronda jugó, cuáles ganó y
    si ya está eliminado (desde la API, penales incluidos vía m.winner). */
const PATH_ROUNDS = ["r32", "r16", "qf", "sf", "final"] as const;
function teamKoState(team: string, liveMatches: LiveMatch[]) {
  let playedIdx = -1;
  const wonAt = new Set<number>();
  let eliminated = false;
  for (const m of liveMatches) {
    const field = m.round ? STAGE_FIELD[m.round] : undefined;
    if (!field) continue;
    if (m.score1 === null || m.score2 === null) continue;
    if (m.team1 !== team && m.team2 !== team) continue;
    const i = (PATH_ROUNDS as readonly string[]).indexOf(field);
    if (i < 0) continue;
    if (i > playedIdx) playedIdx = i;
    const winner = m.winner ?? (m.score1 > m.score2 ? m.team1 : m.score2 > m.score1 ? m.team2 : null);
    if (winner === team) wonAt.add(i);
    else if (winner) eliminated = true;
  }
  return { playedIdx, wonAt, eliminated };
}

export function simulateTeamPath(
  team: string,
  predictions: PredictionsMap,
  groups: Groups,
  teams: Record<string, TeamInfo>,
  bracket: Bracket,
  n = 2000,
  fixedResults?: FixedResults,
  scoreMap?: ScoreMap,
  /** si se pasa, condiciona el camino a los resultados reales del KO */
  liveMatches?: LiveMatch[]
): TeamPath {
  const allTeams = Object.values(groups).flat();
  const elos = Object.fromEntries(allTeams.map((t) => [t, teams[t]?.elo ?? 1500]));
  const hostBoost = Object.fromEntries(allTeams.map((t) => [t, teams[t]?.host_boost ?? 1]));
  const penRates = buildPenRates(teams);

  const ROUNDS: TeamPathRound["round"][] = ["r32", "r16", "qf", "sf", "final"];
  const reach: Record<string, number> = {};
  const adv: Record<string, number> = {};
  const opp: Record<string, Record<string, number>> = {};
  for (const r of ROUNDS) { reach[r] = 0; adv[r] = 0; opp[r] = {}; }

  // slots de terceros (fijo entre sims)
  const thirdSlots: { num: number; side: "a" | "b"; groups: string[] }[] = [];
  for (const c of bracket.r32) {
    if (c.a.type === "third") thirdSlots.push({ num: c.num, side: "a", groups: c.a.groups });
    if (c.b.type === "third") thirdSlots.push({ num: c.num, side: "b", groups: c.b.groups });
  }

  const record = (rnd: TeamPathRound["round"], rival: string, won: boolean) => {
    reach[rnd]++;
    opp[rnd][rival] = (opp[rnd][rival] ?? 0) + 1;
    if (won) adv[rnd]++;
  };

  for (let sim = 0; sim < n; sim++) {
    const groupStandings: Record<string, string[]> = {};
    const thirds: Array<{ team: string; group: string; pts: number; gd: number; gf: number; elo: number }> = [];
    for (const [gname, gteams] of Object.entries(groups)) {
      const { standings, stats } = simulateGroup(gteams, predictions, elos, scoreMap, fixedResults, hostBoost);
      groupStandings[gname] = standings;
      const third = standings[2];
      const s = stats[third];
      thirds.push({ team: third, group: gname, pts: s.pts, gd: s.gf - s.ga, gf: s.gf, elo: elos[third] ?? 1500 });
    }
    thirds.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || b.elo - a.elo);
    const thirdAssign = matchThirds(thirdSlots, thirds.slice(0, 8));

    const winByNum: Record<number, string> = {};
    // R32 (dieciseisavos)
    for (const c of bracket.r32) {
      const a = resolveSlot(c.a, c.num, "a", groupStandings, thirdAssign);
      const b = resolveSlot(c.b, c.num, "b", groupStandings, thirdAssign);
      if (!a || !b) continue;
      const w = sampleKnockout(getProbs(predictions, a, b), a, b, penRates);
      winByNum[c.num] = w;
      if (a === team || b === team) record("r32", a === team ? b : a, w === team);
    }
    // R16 → Final
    for (const c of bracket.ko) {
      const a = winByNum[parseInt(c.a.slice(1), 10)];
      const b = winByNum[parseInt(c.b.slice(1), 10)];
      if (!a || !b) continue;
      const w = sampleKnockout(getProbs(predictions, a, b), a, b, penRates);
      winByNum[c.num] = w;
      if (a === team || b === team) record(roundOfNum(c.num), a === team ? b : a, w === team);
    }
  }

  const rounds: TeamPathRound[] = ROUNDS.map((r) => {
    const reached = reach[r];
    const topOpponents = Object.entries(opp[r])
      .sort((x, y) => y[1] - x[1])
      .slice(0, 3)
      .map(([t, c]) => ({ team: t, prob: reached ? c / reached : 0 }));
    return {
      round: r,
      reach: reached / n,
      advance: adv[r] / n,
      condAdvance: reached ? adv[r] / reached : 0,
      topOpponents,
    };
  });

  let champion = adv.final / n;

  // Condicionar el camino a la realidad del KO: fases ya superadas → 100 %,
  // fases inalcanzables tras una eliminación → 0 % (igual que «Por ronda»).
  if (liveMatches) {
    const { playedIdx, wonAt, eliminated } = teamKoState(team, liveMatches);
    if (playedIdx >= 0) {
      for (let i = 0; i < rounds.length; i++) {
        if (i <= playedIdx) {
          rounds[i].reach = 1;
          if (wonAt.has(i)) { rounds[i].advance = 1; rounds[i].condAdvance = 1; }
          else if (i === playedIdx && eliminated) { rounds[i].advance = 0; rounds[i].condAdvance = 0; }
        } else if (eliminated) {
          rounds[i].reach = 0; rounds[i].advance = 0; rounds[i].condAdvance = 0;
        }
      }
      if (eliminated) champion = 0;
      else if (wonAt.has(4)) champion = 1;   // ganó la final
    }
  }

  return { team, rounds, champion };
}

/* ──────────────────────────────────────────────────────────────
   PROYECCIÓN EN VIVO DEL CUADRO (determinista, no Monte Carlo)
   A partir de las posiciones REALES actuales de cada grupo,
   resuelve quién caería en cada cruce de dieciseisavos (R32).
   Los 1.º/2.º se proyectan en cuanto el grupo arranca (provisional
   hasta que cierra); los terceros solo se ubican cuando los 12
   grupos terminaron, porque su ranking es cruzado entre grupos.
────────────────────────────────────────────────────────────── */
export interface ProjSlot {
  /** Equipo proyectado, o null si la posición aún no es determinable. */
  team: string | null;
  /** Etiqueta de respaldo cuando no hay equipo: "1A", "2B", "3.º A·B·C". */
  label: string;
  /** true si la posición ya es definitiva (grupo cerrado / terceros fijados). */
  decided: boolean;
}
export interface ProjCross {
  num: number;
  a: ProjSlot;
  b: ProjSlot;
  /** Nº del partido de octavos al que avanza el ganador (o null). */
  nextNum: number | null;
}

const POS_LABEL = ["1", "2", "3", "4"];

export function projectBracket(
  bracket: Bracket,
  standings: Record<string, StandingRow[]>
): ProjCross[] {
  const started: Record<string, boolean> = {};
  const complete: Record<string, boolean> = {};
  const order: Record<string, string[]> = {};
  for (const [g, rows] of Object.entries(standings)) {
    started[g] = rows.some((r) => r.played > 0);
    complete[g] = rows.length > 0 && rows.every((r) => r.played >= 3);
    order[g] = rows.map((r) => r.team);
  }
  const allComplete =
    Object.keys(complete).length >= 12 && Object.values(complete).every(Boolean);

  // Terceros: solo se ubican cuando TODOS los grupos cerraron (ranking cruzado).
  let thirdAssign: Record<string, string> = {};
  if (allComplete) {
    const thirds = Object.entries(standings)
      .map(([g, rows]) => ({ g, r: rows[2] }))
      .filter((x) => x.r)
      .map((x) => ({ team: x.r.team, group: x.g, pts: x.r.points, gd: x.r.gd, gf: x.r.gf }));
    thirds.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team));
    const top8 = thirds.slice(0, 8).map((t) => ({ team: t.team, group: t.group }));
    const thirdSlots: { num: number; side: "a" | "b"; groups: string[] }[] = [];
    for (const c of bracket.r32) {
      if (c.a.type === "third") thirdSlots.push({ num: c.num, side: "a", groups: c.a.groups });
      if (c.b.type === "third") thirdSlots.push({ num: c.num, side: "b", groups: c.b.groups });
    }
    thirdAssign = matchThirds(thirdSlots, top8);
  }

  const resolve = (slot: Slot, num: number, side: "a" | "b"): ProjSlot => {
    if (slot.type === "pos") {
      const team = started[slot.group] ? (order[slot.group]?.[slot.pos] ?? null) : null;
      return { team, label: `${POS_LABEL[slot.pos]}${slot.group}`, decided: !!complete[slot.group] };
    }
    if (slot.type === "third") {
      return {
        team: thirdAssign[`${num}:${side}`] ?? null,
        label: `3.º ${slot.groups.join("·")}`,
        decided: allComplete,
      };
    }
    return { team: slot.value, label: slot.value, decided: true };
  };

  // A qué partido de octavos avanza el ganador de cada cruce de R32
  const advances: Record<number, number> = {};
  for (const c of bracket.ko) {
    const am = /^W(\d+)$/.exec(c.a); if (am) advances[+am[1]] = c.num;
    const bm = /^W(\d+)$/.exec(c.b); if (bm) advances[+bm[1]] = c.num;
  }

  return bracket.r32.map((c) => ({
    num: c.num,
    a: resolve(c.a, c.num, "a"),
    b: resolve(c.b, c.num, "b"),
    nextNum: advances[c.num] ?? null,
  }));
}

/* ──────────────────────────────────────────────────────────────
   CUADRO ELIMINATORIO EN VIVO (R32 → Final)
   Ubica cada equipo según su puesto en la tabla real y avanza únicamente
   con resultados reales (sin predecir): el cuadro se va llenando como en la
   web de la BBC. La predicción de cada cruce queda para una fase posterior.
────────────────────────────────────────────────────────────── */

export type KoRoundKey = "r32" | "r16" | "qf" | "sf" | "final";

export interface BracketSlotLive {
  team: string | null;
  label: string;       // placeholder legible si no hay equipo ("1A", "Ganador 73"…)
  /** equipo definitivo (clasificó de verdad / ganó un partido real) */
  decided: boolean;
  /** equipo presente pero aún provisional (posición en vivo o ganador previsto) */
  provisional: boolean;
}

export interface BracketCrossLive {
  num: number;
  round: KoRoundKey;
  a: BracketSlotLive;
  b: BracketSlotLive;
  /** partido ya disputado (resultado real disponible) */
  played: boolean;
  state: MatchState | null;
  /** ganador REAL que avanza, o null si aún no se jugó / faltan rivales */
  winner: string | null;
}

export interface LiveBracketData {
  rounds: { key: KoRoundKey; crosses: BracketCrossLive[] }[];
  champion: string | null;
  /** partido por el 3.er puesto (perdedores de semis); aparte del árbol */
  thirdPlace: BracketCrossLive | null;
}

/** stage de football-data → ronda del cuadro ("third" se trata aparte). */
const STAGE_TO_ROUND: Record<string, KoRoundKey | "third"> = {
  LAST_32: "r32",
  LAST_16: "r16",
  QUARTER_FINALS: "qf",
  SEMI_FINALS: "sf",
  FINAL: "final",
  THIRD_PLACE: "third",
};

/**
 * Cuadro eliminatorio EN VIVO directamente desde la API (football-data).
 * La fuente de verdad de QUIÉN juega contra QUIÉN, el marcador, los penales y
 * quién avanza es la API — no se infiere ni se predice nada aquí (las
 * probabilidades del modelo se pintan encima en el componente). Cada ronda se
 * llena conforme la API publica los cruces: equipo real donde ya se conoce y
 * "por definir" donde todavía no. El orden dentro de cada ronda respeta el de
 * la API, que mantiene la estructura del cuadro.
 */
export function buildLiveBracket(
  liveMatches: LiveMatch[],
  states: Map<string, MatchState>
): LiveBracketData {
  const order: KoRoundKey[] = ["r32", "r16", "qf", "sf", "final"];
  const byRound: Record<KoRoundKey, BracketCrossLive[]> = {
    r32: [], r16: [], qf: [], sf: [], final: [],
  };
  let thirdPlace: BracketCrossLive | null = null;

  // Número de partido del Mundial por ronda (rango oficial 73–104): el 3.er
  // puesto es el 103 y la final el 104.
  const BASE: Record<KoRoundKey, number> = { r32: 73, r16: 89, qf: 97, sf: 101, final: 104 };

  const slot = (team: string | null): BracketSlotLive => ({
    team: team || null,
    label: "",                 // sin equipo → el componente muestra "Por definir"
    decided: !!team,
    provisional: false,
  });

  const makeCross = (m: LiveMatch, rk: KoRoundKey, num: number): BracketCrossLive => {
    const a = m.team1 || null;
    const b = m.team2 || null;
    const state = a && b ? states.get(pairKey(a, b)) ?? null : null;
    const played = !!state && state.s1 !== null && state.s2 !== null;
    const winner = state?.winner ?? null;
    return { num, round: rk, a: slot(a), b: slot(b), played, state, winner };
  };

  for (const m of liveMatches) {
    const rk = m.round ? STAGE_TO_ROUND[m.round] : undefined;
    if (!rk) continue;
    if (rk === "third") { thirdPlace = makeCross(m, "final", 103); continue; }
    byRound[rk].push(makeCross(m, rk, BASE[rk] + byRound[rk].length));
  }

  const rounds = order
    .filter((k) => byRound[k].length > 0)
    .map((k) => ({ key: k, crosses: byRound[k] }));

  const champion = byRound.final[0]?.winner ?? null;

  return { rounds, champion, thirdPlace };
}
