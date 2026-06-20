import type { FixedResults, Prediction, SimResult, TeamInfo } from "@/types";
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
}

const KO_ROUND_OF = (num: number): KoRoundKey =>
  num <= 96 ? "r16" : num <= 100 ? "qf" : num <= 102 ? "sf" : "final";

/**
 * Cuadro eliminatorio en vivo (R32 → Final): ubica los equipos según la tabla
 * real (1.º/2.º provisionales hasta cerrar el grupo; mejores 8 terceros al
 * terminar los 12 grupos) y avanza SOLO con resultados reales — sin predecir.
 */
export function buildLiveBracket(
  bracket: Bracket,
  standings: Record<string, StandingRow[]>,
  states: Map<string, MatchState>
): LiveBracketData {
  const r32 = projectBracket(bracket, standings);

  const winByNum: Record<number, string> = {};
  const realByNum: Record<number, boolean> = {};
  const crossByRound: Record<KoRoundKey, BracketCrossLive[]> = {
    r32: [], r16: [], qf: [], sf: [], final: [],
  };

  const resolveCross = (
    num: number, round: KoRoundKey, a: BracketSlotLive, b: BracketSlotLive
  ): BracketCrossLive => {
    const state = a.team && b.team ? states.get(pairKey(a.team, b.team)) ?? null : null;
    const played = !!state && state.s1 !== null && state.s2 !== null;
    const winner = state?.winner ?? null;       // solo resultado real
    if (winner) { winByNum[num] = winner; realByNum[num] = true; }
    return { num, round, a, b, played, state, winner };
  };

  // R32: slots desde la tabla real (provisional hasta que cierre el grupo)
  for (const c of r32) {
    const slot = (s: typeof c.a): BracketSlotLive => ({
      team: s.team, label: s.label, decided: s.decided, provisional: !!s.team && !s.decided,
    });
    crossByRound.r32.push(resolveCross(c.num, "r32", slot(c.a), slot(c.b)));
  }

  // R16 → Final: cada lado es el ganador REAL de un cruce anterior (o "Por definir").
  // De paso mapeamos el árbol (qué cruce alimenta a cuál) para ordenar las rondas
  // de forma PLANAR — los rivales reales quedan adyacentes y los conectores cuadran.
  const koSorted = [...bracket.ko].sort((x, y) => x.num - y.num);
  const childrenOf: Record<number, [number, number]> = {};
  const parentOf: Record<number, number> = {};
  for (const c of koSorted) {
    const ca = parseInt(c.a.slice(1), 10);
    const cb = parseInt(c.b.slice(1), 10);
    childrenOf[c.num] = [ca, cb];
    parentOf[ca] = c.num; parentOf[cb] = c.num;
    const ref = (n: number): BracketSlotLive => {
      const team = winByNum[n] ?? null;
      return { team, label: `W${n}`, decided: !!realByNum[n], provisional: false };
    };
    crossByRound[KO_ROUND_OF(c.num)].push(resolveCross(c.num, KO_ROUND_OF(c.num), ref(ca), ref(cb)));
  }

  // La final es el único cruce sin padre; recorremos el árbol para fijar el orden
  const finalNum = koSorted.length
    ? koSorted.map((c) => c.num).find((n) => parentOf[n] === undefined) ?? koSorted[koSorted.length - 1].num
    : 0;
  const leafOrder: number[] = [];
  const dfs = (n: number) => {
    const ch = childrenOf[n];
    if (!ch) { leafOrder.push(n); return; }
    dfs(ch[0]); dfs(ch[1]);
  };
  if (finalNum) dfs(finalNum);

  // Orden por ronda: las hojas (R32) en orden planar, y cada ronda siguiente
  // = los padres de la ronda previa, sin repetir (conserva la adyacencia).
  const roundOrder: Record<KoRoundKey, number[]> = { r32: leafOrder, r16: [], qf: [], sf: [], final: [] };
  let cur = leafOrder;
  for (const key of ["r16", "qf", "sf", "final"] as KoRoundKey[]) {
    const nxt: number[] = [];
    for (const n of cur) {
      const p = parentOf[n];
      if (p !== undefined && !nxt.includes(p)) nxt.push(p);
    }
    roundOrder[key] = nxt;
    cur = nxt;
  }

  const rank = (key: KoRoundKey, num: number) => {
    const i = roundOrder[key].indexOf(num);
    return i === -1 ? num : i;
  };
  const rounds = (["r32", "r16", "qf", "sf", "final"] as KoRoundKey[]).map((key) => ({
    key,
    crosses: crossByRound[key].sort((x, y) => rank(key, x.num) - rank(key, y.num)),
  }));

  return { rounds, champion: winByNum[finalNum] ?? null };
}
