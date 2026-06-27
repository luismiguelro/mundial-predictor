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
  bracket: Bracket;
  liveMatches: LiveMatch[];
  /** tabla por grupo, ya ordenada (oficial de la API o calculada) */
  standings: Record<string, StandingRow[]>;
  teams: Record<string, TeamInfo>;
  /** probabilidades del modelo para anotar cada cruce sin jugar */
  predictions: Record<string, Prediction>;
}

type PenRates = Record<string, number>;

/* color de cabecera por ronda (solo el rótulo; las cartas quedan neutras) */
const ROUND_ACCENT: Record<KoRoundKey, string> = {
  r32: "#8b8bd6", r16: "#5b8ff5", qf: "#c489e0", sf: "#ff5a6e", final: "#e8c45a",
};

const COL_W = 172;               // ancho de cada carta/columna
const CONNECTOR_W = 20;          // carril de líneas a la derecha de cada carta
const CELL_MIN_H = 78;           // alto mínimo de celda en R32 (cabe la carta sin recortar)
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

/** Prettifica el placeholder de un slot ("W89" → "Ganador #89"; "3.º …" se deja). */
function slotLabel(s: BracketSlotLive, T: T): string {
  const m = /^W(\d+)$/.exec(s.label);
  return m ? `${T.lt_brWinnerOf} #${m[1]}` : s.label;
}

export default function LiveBracket({ bracket, liveMatches, standings, teams, predictions }: Props) {
  const T = useLang();

  const states = useMemo(() => buildMatchStates(liveMatches), [liveMatches]);
  const data = useMemo(() => buildLiveBracket(bracket, standings, states), [bracket, standings, states]);
  const penRates = useMemo(() => buildPenRates(teams), [teams]);
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
              {T.lt_brChampion}
            </div>
            <div className="text-sm font-bold flex items-center gap-1.5">
              {data.champion
                ? <>{flag(data.champion)} {data.champion}</>
                : <span className="text-[var(--text-muted)]">{T.lt_brTbd}</span>}
            </div>
          </div>
        </div>
        {/* indicador de scroll (sobre todo para mobile) */}
        <span className="text-[10px] sm:hidden" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          {T.lt_brScrollHint} →
        </span>
      </div>

      {/* columnas R32 → Final, con líneas. Alto completo (sin caja con scroll):
          la página scrollea normal; solo se desliza HORIZONTAL entre rondas. */}
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
        {c.played ? (
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
  let myScore: number | null = null;
  if (c.played && c.state && slot.team) {
    myScore = c.state.team1 === slot.team ? c.state.s1 : c.state.s2;
  }
  const showProb = winProb !== null && !!slot.team;

  return (
    <div
      className="w-full flex items-center gap-1.5 px-2 py-1.5"
      style={isWinner
        ? { background: WIN_BG, borderLeft: `2px solid ${WIN_LINE}` }
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
            <span className="text-xs font-bold tabular-nums shrink-0 w-3 text-right"
                  style={{ color: isWinner ? WIN_LINE : "var(--text-muted)" }}>
              {myScore}
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
