"use client";

import { useMemo, useState } from "react";
import type { TeamInfo, LiveMatch, Prediction } from "@/types";
import { buildMatchStates, type StandingRow } from "@/lib/live";
import {
  buildLiveBracket, buildPenRates, crossWinProb,
  type Bracket, type BracketCrossLive,
  type BracketSlotLive, type KoRoundKey,
} from "@/lib/simulator";
import { useLang } from "@/lib/i18n";
import CrossDetail from "@/components/CrossDetail";

interface Props {
  /** topología oficial del cuadro (líneas / estructura del árbol) */
  bracket: Bracket;
  /** tabla real por grupo: resuelve la posición (1A/2B…) de cada slot */
  standings: Record<string, StandingRow[]>;
  /** partidos reales (incluye eliminatoria): fuente de los cruces y resultados */
  liveMatches: LiveMatch[];
  teams: Record<string, TeamInfo>;
  /** probabilidades del modelo para anotar cada cruce sin jugar */
  predictions: Record<string, Prediction>;
  /** modo PREDICCIÓN: avanza el favorito del modelo hasta el campeón previsto */
  predict?: boolean;
}

type PenRates = Record<string, number>;

const PRED_BG = "rgba(212,168,67,0.14)";   // resaltado de un ganador PRONOSTICADO (pendiente)
const PRED_LINE = "#d4a843";
const MISS_BG = "rgba(239,68,68,0.12)";    // pronóstico que FALLÓ
const MISS_LINE = "#ef4444";

/* color de cabecera por ronda (solo el rótulo; las cartas quedan neutras) */
const ROUND_ACCENT: Record<KoRoundKey, string> = {
  r32: "#8b8bd6", r16: "#5b8ff5", qf: "#c489e0", sf: "#ff5a6e", final: "#e8c45a",
};

const COL_W = 184;               // ancho de cada carta/columna
const CONNECTOR_W = 22;          // carril de líneas a la derecha de cada carta
const CELL_MIN_H = 112;          // alto mínimo de celda: deja aire entre cartas (sobre todo en 16vos)
const LINE = "rgba(255,255,255,0.16)";
const WIN_BG = "rgba(34,197,94,0.14)";
const WIN_LINE = "#22c55e";

type T = ReturnType<typeof useLang>;

/* Rótulos CORTOS de una sola línea: mantienen las cabeceras de igual altura
   (si envolvieran a 2 líneas, las columnas empezarían a distinta altura y las
   líneas conectoras se descuadrarían). */
function roundLabel(key: KoRoundKey, T: T): string {
  return key === "r32" ? T.lt_brR32
    : key === "r16" ? T.lt_brR16
    : key === "qf" ? T.lt_brQf
    : key === "sf" ? T.lt_brSf
    : T.lt_brFinal;
}

/** Etiqueta del slot sin equipo: siempre "Por definir" (los cruces salen de la API). */
function slotLabel(s: BracketSlotLive, T: T): string {
  return s.label || T.lt_brTbd;
}

export default function LiveBracket({ bracket, standings, liveMatches, teams, predictions, predict }: Props) {
  const T = useLang();

  const states = useMemo(() => buildMatchStates(liveMatches), [liveMatches]);
  const penRates = useMemo(() => buildPenRates(teams), [teams]);
  const data = useMemo(
    () => buildLiveBracket(bracket, standings, liveMatches, states, predict ? { predictions, pens: penRates } : undefined),
    [bracket, standings, liveMatches, states, predict, predictions, penRates]
  );

  // Aciertos del cuadro predictivo: cruces ya jugados donde el favorito avanzó.
  const predStats = useMemo(() => {
    if (!predict) return null;
    const all = [...data.rounds.flatMap((r) => r.crosses), ...(data.thirdPlace ? [data.thirdPlace] : [])];
    let hits = 0, total = 0;
    for (const c of all) if (c.hit === true || c.hit === false) { total++; if (c.hit) hits++; }
    return total > 0 ? { hits, total } : null;
  }, [data, predict]);
  const [sel, setSel] = useState<BracketCrossLive | null>(null);

  const ready = data.rounds[0]?.crosses.some((c) => c.a.team || c.b.team);
  const flag = (name: string | null) => (name ? teams[name]?.flag ?? "" : "");

  if (!ready) {
    return (
      <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>
        {T.lt_brWaiting}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* campeón (solo cuando la final ya se jugó) */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 rounded-xl px-4 py-2.5"
             style={{ background: "rgba(212,168,67,0.10)", border: "1px solid rgba(212,168,67,0.35)" }}>
          <span className="text-xl">🏆</span>
          <div className="leading-tight">
            <div className="text-[9px] uppercase tracking-[0.16em]"
                 style={{ fontFamily: "var(--font-mono)", color: "var(--wc-gold)" }}>
              {predict ? T.lt_brChampionPred : T.lt_brChampion}
            </div>
            <div className="text-sm font-bold flex items-center gap-1.5">
              {data.champion
                ? <>{flag(data.champion)} {data.champion}</>
                : <span className="text-[var(--text-muted)]">{T.lt_brTbd}</span>}
            </div>
          </div>
        </div>

        {/* aciertos del cuadro predictivo */}
        {predStats && (
          <div className="flex items-center gap-2.5 rounded-xl px-4 py-2.5"
               style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.30)" }}>
            <span className="text-xl">🎯</span>
            <div className="leading-tight">
              <div className="text-[9px] uppercase tracking-[0.16em]"
                   style={{ fontFamily: "var(--font-mono)", color: WIN_LINE }}>
                {T.lt_brHits}
              </div>
              <div className="text-sm font-bold tabular-nums">
                {predStats.hits}/{predStats.total}
                <span className="text-[var(--text-muted)] font-normal ml-1.5">
                  ({Math.round((predStats.hits / predStats.total) * 100)}%)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* indicador de scroll (sobre todo para mobile) */}
        <span className="text-[10px] sm:hidden" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          {T.lt_brScrollHint} →
        </span>
      </div>

      {/* Columnas 16vos → Final con LÍNEAS de llave. El orden de cada ronda es
          PLANAR (DFS del árbol oficial en buildLiveBracket), así los rivales que
          se enfrentan quedan adyacentes y los conectores cuadran. La página
          scrollea normal; entre rondas se desliza en horizontal. */}
      <div className="overflow-x-auto pb-3 scrollbar-hide" style={{ scrollSnapType: "x proximity" }}>
        <div className="flex items-stretch" style={{ width: "max-content" }}>
          {data.rounds.map((r, ri) => {
            const isLast = ri === data.rounds.length - 1;
            return (
              <div
                key={r.key}
                className="flex flex-col shrink-0"
                style={{ width: COL_W + (isLast ? 0 : CONNECTOR_W), scrollSnapAlign: "start" }}
              >
                <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-center py-1.5 whitespace-nowrap"
                     style={{ fontFamily: "var(--font-mono)", color: ROUND_ACCENT[r.key] }}>
                  {roundLabel(r.key, T)}
                </div>
                <div className="flex-1 flex flex-col">
                  {r.crosses.map((c, i) => (
                    <div
                      key={c.num}
                      className="relative flex items-center"
                      style={{ flex: "1 1 0", minHeight: CELL_MIN_H, paddingRight: isLast ? 0 : CONNECTOR_W }}
                    >
                      <div style={{ width: COL_W }}>
                        <CrossCard c={c} flag={flag} T={T} predictions={predictions} pens={penRates}
                                   onOpen={c.a.team && c.b.team ? () => setSel(c) : undefined} />
                      </div>
                      {!isLast && <Connectors index={i} winner={!!c.winner} />}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Partido por el 3.er puesto (perdedores de semis): fuera del árbol */}
      {data.thirdPlace && (
        <div className="pt-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.1em] mb-1.5 flex items-center gap-1.5"
               style={{ fontFamily: "var(--font-mono)", color: "#cd7f32" }}>
            🥉 {T.lt_brThird} <span style={{ color: "var(--text-muted)" }}>· #{data.thirdPlace.num}</span>
          </div>
          <div style={{ width: COL_W }}>
            <CrossCard
              c={data.thirdPlace} flag={flag} T={T} predictions={predictions} pens={penRates}
              onOpen={data.thirdPlace.a.team && data.thirdPlace.b.team ? () => setSel(data.thirdPlace) : undefined}
            />
          </div>
        </div>
      )}

      {sel && sel.a.team && sel.b.team && (
        <CrossDetail
          a={sel.a.team} b={sel.b.team} num={sel.num}
          roundLabel={roundLabel(sel.round, T)}
          teams={teams} predictions={predictions} pens={penRates}
          real={sel.played ? sel.state : null} realWinner={sel.winner}
          onClose={() => setSel(null)}
        />
      )}
    </div>
  );
}

/** Líneas tipo llave: stub horizontal + barra vertical que une la pareja + salida a la ronda siguiente. */
function Connectors({ index, winner }: { index: number; winner: boolean }) {
  const even = index % 2 === 0;            // arriba de la pareja
  const half = CONNECTOR_W / 2;
  const color = winner ? WIN_LINE : LINE;
  return (
    <>
      <span style={{ position: "absolute", top: "calc(50% - 1px)", right: half, width: half, height: 2, background: color }} />
      <span style={{
        position: "absolute", right: half - 1, width: 2, background: LINE,
        ...(even ? { top: "50%", height: "50%" } : { top: 0, height: "50%" }),
      }} />
      {even && (
        <span style={{ position: "absolute", top: "calc(100% - 1px)", right: 0, width: half, height: 2, background: LINE }} />
      )}
    </>
  );
}

function CrossCard({ c, flag, T, predictions, pens, onOpen }: {
  c: BracketCrossLive;
  flag: (name: string | null) => string;
  T: T;
  predictions: Record<string, Prediction>;
  pens: PenRates;
  /** abre el detalle del cruce; undefined si aún no hay ambos rivales */
  onOpen?: () => void;
}) {
  /* % del modelo por slot: solo cuando el cruce no se ha jugado y ya hay rivales. */
  const probs = !c.played && c.a.team && c.b.team
    ? crossWinProb(predictions, c.a.team, c.b.team, pens)
    : null;

  return (
    <div
      className={`rounded-lg overflow-hidden text-left transition-colors ${onOpen ? "cursor-pointer hover:border-[var(--wc-gold)]" : ""}`}
      onClick={onOpen}
      onKeyDown={onOpen ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } } : undefined}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      title={onOpen ? T.lt_cdOpen : undefined}
      style={{ background: "var(--color-arena-card, var(--surface-2))", border: "1px solid var(--border-subtle)" }}>
      <div className="flex items-center justify-between px-2.5 py-0.5"
           style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <span className="text-[8px] tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          #{c.num}
        </span>
        {c.predicted ? (
          c.hit === true ? (
            <span className="text-[8px] uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)", color: WIN_LINE }}>
              ✓ {T.verdictHit}
            </span>
          ) : c.hit === false ? (
            <span className="text-[8px] uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)", color: "var(--wc-red)" }}>
              ✗ {T.verdictMiss}
            </span>
          ) : (
            <span className="text-[8px] uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)", color: PRED_LINE }}>
              {T.lt_brPredicted}
            </span>
          )
        ) : c.played ? (
          <span className="text-[8px] uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)", color: WIN_LINE }}>
            ✓ {T.lt_brReal}
          </span>
        ) : probs && (
          <span className="text-[8px] uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)", color: "var(--wc-gold)" }}>
            {T.lt_brOdds}
          </span>
        )}
      </div>
      <SlotRow side="a" c={c} flag={flag} T={T} winProb={probs?.pa ?? null} />
      <div className="h-px" style={{ background: "var(--border-subtle)" }} />
      <SlotRow side="b" c={c} flag={flag} T={T} winProb={probs?.pb ?? null} />
    </div>
  );
}

function SlotRow({ side, c, flag, T, winProb }: {
  side: "a" | "b";
  c: BracketCrossLive;
  flag: (name: string | null) => string;
  T: T;
  /** probabilidad de que este slot gane el cruce (null si ya se jugó / sin rival) */
  winProb: number | null;
}) {
  const slot = c[side];
  const isWinner = !!slot.team && c.winner === slot.team;
  // verde = real/acertó · rojo = pronóstico fallado · dorado = pronóstico pendiente
  const winBg = !c.predicted ? WIN_BG : c.hit === false ? MISS_BG : c.hit === true ? WIN_BG : PRED_BG;
  const winLine = !c.predicted ? WIN_LINE : c.hit === false ? MISS_LINE : c.hit === true ? WIN_LINE : PRED_LINE;
  let myScore: number | null = null;
  let myPen: number | null = null;
  if (c.played && c.state && slot.team) {
    myScore = c.state.team1 === slot.team ? c.state.s1 : c.state.s2;
    if (c.state.decidedBy === "PENALTY_SHOOTOUT") {
      myPen = c.state.team1 === slot.team ? c.state.pen1 : c.state.pen2;
    }
  }
  const showProb = winProb !== null && !!slot.team;

  return (
    <div
      className="w-full flex items-center gap-1.5 px-2 py-1.5"
      style={isWinner
        ? { background: winBg, borderLeft: `2px solid ${winLine}` }
        : { borderLeft: "2px solid transparent" }}
    >
      {slot.team ? (
        <>
          <span className="text-sm shrink-0">{flag(slot.team)}</span>
          <span
            className={`text-xs truncate flex-1 ${isWinner ? "font-bold" : ""}`}
            style={{ color: isWinner ? "var(--text)" : c.played ? "var(--text-muted)" : "var(--text)" }}
          >
            {slot.team}
          </span>
          {slot.provisional && (
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--wc-gold)" }}
                  title={T.lt_provisional} />
          )}
          {myScore !== null && (
            <span className="text-xs font-bold tabular-nums shrink-0 text-right flex items-baseline gap-0.5"
                  style={{ color: isWinner ? WIN_LINE : "var(--text-muted)" }}>
              {myScore}
              {myPen !== null && (
                <span className="text-[9px] font-semibold" style={{ color: "var(--wc-gold)" }}>
                  ({myPen})
                </span>
              )}
            </span>
          )}
          {showProb && (
            <span className="text-[10px] font-bold tabular-nums shrink-0 w-8 text-right"
                  style={{ color: winProb >= 0.5 ? "var(--wc-gold)" : "var(--text-muted)" }}>
              {Math.round(winProb * 100)}%
            </span>
          )}
        </>
      ) : (
        <span className="text-[10px] truncate flex-1" title={slot.label}
              style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          {slotLabel(slot, T)}
        </span>
      )}
    </div>
  );
}
