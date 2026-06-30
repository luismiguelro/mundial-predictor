"use client";

import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import type { TeamInfo, Prediction } from "@/types";
import type { MatchState } from "@/lib/live";
import { crossWinProb, getProbs, getLambdas } from "@/lib/simulator";
import { useLang } from "@/lib/i18n";

interface Props {
  a: string;
  b: string;
  num: number;
  roundLabel: string;
  teams: Record<string, TeamInfo>;
  predictions: Record<string, Prediction>;
  pens: Record<string, number>;
  /** resultado real si el cruce ya se jugó */
  real?: MatchState | null;
  realWinner?: string | null;
  onClose: () => void;
}

function poissonPmf(k: number, lam: number): number {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return (Math.exp(-lam) * Math.pow(lam, k)) / f;
}

export default function CrossDetail({
  a, b, num, roundLabel, teams, predictions, pens, real, realWinner, onClose,
}: Props) {
  const T = useLang();

  /* cerrar con Escape */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { pa, pb } = crossWinProb(predictions, a, b, pens);
  const p = getProbs(predictions, a, b); // home_win = a gana en 90', draw, away_win = b gana

  /* distribución de marcadores (Poisson independiente sobre los λ del modelo) */
  const { mostLikely, top } = useMemo(() => {
    const { l1, l2 } = getLambdas(predictions, a, b);
    const grid: { s1: number; s2: number; p: number }[] = [];
    for (let i = 0; i <= 6; i++) {
      for (let j = 0; j <= 6; j++) grid.push({ s1: i, s2: j, p: poissonPmf(i, l1) * poissonPmf(j, l2) });
    }
    grid.sort((x, y) => y.p - x.p);
    const pd = predictions[`${a}|${b}`];
    const rv = predictions[`${b}|${a}`];
    const ml = pd?.score_home != null && pd?.score_away != null
      ? { s1: pd.score_home, s2: pd.score_away }
      : rv?.score_home != null && rv?.score_away != null
        ? { s1: rv.score_away, s2: rv.score_home }
        : { s1: grid[0].s1, s2: grid[0].s2 };
    return { mostLikely: ml, top: grid.slice(0, 5) };
  }, [predictions, a, b]);

  const flag = (n: string) => teams[n]?.flag ?? "🏳️";
  const favA = pa >= pb;

  /* marcador real orientado (a, b) si ya se jugó */
  let realA: number | null = null, realB: number | null = null;
  let penA: number | null = null, penB: number | null = null;
  if (real && real.s1 !== null && real.s2 !== null) {
    realA = real.team1 === a ? real.s1 : real.s2;
    realB = real.team1 === a ? real.s2 : real.s1;
    if (real.decidedBy === "PENALTY_SHOOTOUT") {
      penA = real.team1 === a ? real.pen1 : real.pen2;
      penB = real.team1 === a ? real.pen2 : real.pen1;
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: "var(--color-arena-card, var(--surface-2))", border: "1px solid var(--border-subtle)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between px-4 py-2.5"
             style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em]"
                style={{ fontFamily: "var(--font-mono)", color: "var(--wc-gold)" }}>
            {roundLabel} · #{num}
          </span>
          <button onClick={onClose} aria-label="close"
                  className="text-[var(--text-muted)] hover:text-[var(--text)] text-lg leading-none">
            ×
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* equipos + probabilidad de avanzar */}
          <div>
            <p className="text-[10px] uppercase tracking-widest mb-2 text-center"
               style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
              {T.lt_cdAdvance}
            </p>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="flex items-center gap-1.5 text-sm font-bold min-w-0">
                <span className="text-lg shrink-0">{flag(a)}</span>
                <span className="truncate">{a}</span>
              </span>
              <span className="flex items-center gap-1.5 text-sm font-bold min-w-0 justify-end text-right">
                <span className="truncate">{b}</span>
                <span className="text-lg shrink-0">{flag(b)}</span>
              </span>
            </div>
            <div className="flex h-7 rounded-lg overflow-hidden text-xs font-black"
                 style={{ border: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center justify-start px-2"
                   style={{ width: `${pa * 100}%`, background: favA ? "var(--wc-gold)" : "var(--surface-2)", color: favA ? "#000" : "var(--text-muted)" }}>
                {Math.round(pa * 100)}%
              </div>
              <div className="flex items-center justify-end px-2"
                   style={{ width: `${pb * 100}%`, background: !favA ? "var(--wc-gold)" : "var(--surface-2)", color: !favA ? "#000" : "var(--text-muted)" }}>
                {Math.round(pb * 100)}%
              </div>
            </div>
          </div>

          {/* marcador esperado + prob de prórroga/penales */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="stat-card !p-2.5 text-center">
              <p className="text-[9px] uppercase tracking-widest mb-1"
                 style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                {T.lt_cdExpScore}
              </p>
              <p className="text-xl font-black tabular-nums">{mostLikely.s1}–{mostLikely.s2}</p>
            </div>
            <div className="stat-card !p-2.5 text-center">
              <p className="text-[9px] uppercase tracking-widest mb-1"
                 style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                {T.lt_cdToPens}
              </p>
              <p className="text-xl font-black tabular-nums">{Math.round(p.draw * 100)}%</p>
            </div>
          </div>

          {/* marcadores más probables */}
          <div>
            <p className="text-[9px] uppercase tracking-widest mb-1.5"
               style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
              {T.lt_cdLikely}
            </p>
            <div className="space-y-1">
              {top.map((s) => (
                <div key={`${s.s1}-${s.s2}`} className="flex items-center gap-2 text-xs">
                  <span className="tabular-nums w-10 shrink-0 font-semibold">{s.s1}–{s.s2}</span>
                  <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full"
                         style={{ width: `${(s.p / top[0].p) * 100}%`, background: "linear-gradient(90deg,var(--wc-red),#ff4d6d)" }} />
                  </div>
                  <span className="tabular-nums w-9 text-right text-[var(--text-muted)]">{(s.p * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* resultado real si ya se jugó */}
          {realA !== null && realB !== null && (
            <div className="rounded-lg px-3 py-2 flex items-center justify-between"
                 style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)" }}>
              <span className="text-[10px] uppercase tracking-widest"
                    style={{ fontFamily: "var(--font-mono)", color: "#22c55e" }}>
                ✓ {T.lt_cdReal}
              </span>
              <span className="text-sm font-bold tabular-nums">
                {realA}–{realB}
                {penA !== null && penB !== null && (
                  <span className="ml-1 text-[var(--wc-gold)] font-semibold">({T.lt_pens} {penA}–{penB})</span>
                )}
                {realWinner && <span className="ml-2 text-[var(--text-muted)] font-normal">· {flag(realWinner)} {realWinner}</span>}
              </span>
            </div>
          )}

          <p className="text-[10px] leading-snug text-center" style={{ color: "var(--text-muted)" }}>
            {T.lt_cdNote}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
