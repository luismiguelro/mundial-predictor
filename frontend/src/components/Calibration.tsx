"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { MatchVerdict } from "@/lib/live";
import { calibrationCurve, forecastMetrics } from "@/lib/live";
import { fadeUp } from "@/lib/animations";
import { useLang } from "@/lib/i18n";

/* ══════════════════════════════════════════════════════
   CALIBRACIÓN — reliability diagram en vivo del modelo.
   Mide si la confianza del modelo coincide con la realidad:
   cuando dice "60 %", ¿pasa el 60 % de las veces?
══════════════════════════════════════════════════════ */

const MIN_MATCHES = 6; // por debajo de esto la curva es ruido; se avisa

export default function Calibration({ verdicts, embedded = false }: {
  verdicts: MatchVerdict[];
  /** true: se inserta dentro de otra tarjeta (glosario) → sin header ni stat-card propios */
  embedded?: boolean;
}) {
  const T = useLang();

  /* Segmentación por fase: la calibración en grupos y en eliminatoria son
     regímenes distintos (en KO no hay empate "real"). Solo ofrecemos el filtro
     cuando hay partidos de ambas fases; si no, se comporta como antes. */
  const [phase, setPhase] = useState<"all" | "groups" | "ko">("all");
  const hasKo     = useMemo(() => verdicts.some((v) => v.knockout),  [verdicts]);
  const hasGroups = useMemo(() => verdicts.some((v) => !v.knockout), [verdicts]);
  const showPhaseToggle = hasKo && hasGroups;

  const shownVerdicts = useMemo(() => {
    if (!showPhaseToggle || phase === "all") return verdicts;
    return verdicts.filter((v) => (phase === "ko" ? v.knockout : !v.knockout));
  }, [verdicts, phase, showPhaseToggle]);

  const calib = useMemo(() => calibrationCurve(shownVerdicts), [shownVerdicts]);
  const metrics = useMemo(() => forecastMetrics(shownVerdicts), [shownVerdicts]);

  if (calib.matches === 0) {
    return embedded ? (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>{T.lt_empty}</p>
    ) : null;
  }

  const pts = calib.bins.filter((b) => b.count > 0);
  const maxCount = Math.max(...pts.map((b) => b.count), 1);

  /* Geometría del SVG (cuadrado, eje X = confianza, eje Y = frecuencia real). */
  const W = 320, H = 320;
  const PADL = 40, PADR = 16, PADT = 16, PADB = 32;
  const plotW = W - PADL - PADR;
  const plotH = H - PADT - PADB;
  const px = (p: number) => PADL + p * plotW;
  const py = (f: number) => H - PADB - f * plotH;
  const r = (count: number) => 3.5 + 8 * Math.sqrt(count / maxCount);

  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const curvePath = pts
    .slice()
    .sort((a, b) => a.predMean - b.predMean)
    .map((b, i) => `${i === 0 ? "M" : "L"} ${px(b.predMean)} ${py(b.obsFreq)}`)
    .join(" ");

  const phaseToggle = showPhaseToggle && (
    <div className="flex gap-1 bg-[var(--surface-2)] rounded-lg p-1 w-fit mb-1">
      {([
        { key: "all"    as const, label: T.lt_calibPhaseAll },
        { key: "groups" as const, label: T.lt_calibPhaseGroups },
        { key: "ko"     as const, label: T.lt_calibPhaseKo },
      ]).map(({ key, label }) => (
        <button
          key={key}
          onClick={() => setPhase(key)}
          className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all ${
            phase === key ? "bg-[var(--wc-red)] text-white" : "text-[var(--text-muted)]"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const body = (
    <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-5 lg:gap-7 items-center">
          {/* ── Reliability diagram ── */}
          <div className="mx-auto w-full" style={{ maxWidth: 340 }}>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              width="100%"
              role="img"
              aria-label={`${T.lt_calibTitle}: ${T.lt_calibPredicted} vs ${T.lt_calibObserved}`}
              style={{ display: "block" }}
            >
              {/* rejilla + ticks */}
              {ticks.map((t) => (
                <g key={t}>
                  <line
                    x1={px(t)} y1={py(0)} x2={px(t)} y2={py(1)}
                    stroke="var(--border-subtle)" strokeWidth={1}
                  />
                  <line
                    x1={px(0)} y1={py(t)} x2={px(1)} y2={py(t)}
                    stroke="var(--border-subtle)" strokeWidth={1}
                  />
                  <text
                    x={px(t)} y={py(0) + 16} textAnchor="middle"
                    style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--text-muted)" }}
                  >
                    {Math.round(t * 100)}
                  </text>
                  <text
                    x={px(0) - 7} y={py(t) + 3} textAnchor="end"
                    style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--text-muted)" }}
                  >
                    {Math.round(t * 100)}
                  </text>
                </g>
              ))}

              {/* diagonal: calibración perfecta */}
              <line
                x1={px(0)} y1={py(0)} x2={px(1)} y2={py(1)}
                stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.7}
              />

              {/* curva del modelo */}
              {pts.length > 1 && (
                <path d={curvePath} fill="none" stroke="var(--wc-red)" strokeWidth={2} opacity={0.55} />
              )}

              {/* puntos por bin (radio ∝ nº de pronósticos) */}
              {pts.map((b) => {
                const over = b.obsFreq >= b.predMean; // por encima de la diagonal
                return (
                  <circle
                    key={b.lo}
                    cx={px(b.predMean)} cy={py(b.obsFreq)} r={r(b.count)}
                    fill={over ? "var(--wc-gold)" : "var(--wc-red)"}
                    fillOpacity={0.85}
                    stroke="var(--surface)" strokeWidth={1.5}
                  >
                    <title>
                      {`${Math.round(b.predMean * 100)}% → ${Math.round(b.obsFreq * 100)}% (${b.count})`}
                    </title>
                  </circle>
                );
              })}

              {/* etiquetas de ejes */}
              <text
                x={PADL + plotW / 2} y={H - 2} textAnchor="middle"
                style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}
              >
                {T.lt_calibPredicted}
              </text>
              <text
                transform={`translate(11 ${PADT + plotH / 2}) rotate(-90)`} textAnchor="middle"
                style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}
              >
                {T.lt_calibObserved}
              </text>
            </svg>

            {/* leyenda diagonal + tamaño */}
            <div className="flex items-center justify-center gap-4 mt-1 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[10px]" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                <span style={{ width: 14, height: 0, borderTop: "1.5px dashed var(--text-muted)" }} />
                {T.lt_calibPerfect}
              </span>
              <span className="text-[10px]" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                {T.lt_calibSize}
              </span>
            </div>
          </div>

          {/* ── Métricas resumen ── */}
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2.5">
              <Metric label={T.lt_eceLabel}    value={calib.ece} hint={T.lt_eceHint} />
              <Metric label={T.lt_brierLabel}  value={metrics.brier} baseline={metrics.brierBaseline} baselineLabel={T.lt_vsRandom} hint={T.lt_brierHint} />
              <Metric label={T.lt_rpsLabel}    value={metrics.rps}   baseline={metrics.rpsBaseline}   baselineLabel={T.lt_vsRandom} hint={T.lt_rpsHint} />
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {T.lt_calibReading}
            </p>
            {calib.matches < MIN_MATCHES && (
              <p
                className="text-[11px] inline-flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg"
                style={{
                  fontFamily: "var(--font-mono)",
                  background: "rgba(119,119,153,0.12)",
                  border: "1px solid rgba(119,119,153,0.28)",
                  color: "var(--text-muted)",
                }}
              >
                ⏳ {T.lt_calibFew}
              </p>
            )}
          </div>
        </div>
  );

  if (embedded) return (
    <div className="space-y-3">
      {phaseToggle}
      {body}
    </div>
  );

  return (
    <motion.section variants={fadeUp} className="space-y-3">
      {/* Encabezado */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="shrink-0" style={{ width: 18, height: 3, background: "var(--wc-red)" }} />
        <h3
          className="text-[11px] font-bold uppercase tracking-[0.18em]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}
        >
          {T.lt_calibTitle}
        </h3>
        <span className="text-xs hidden sm:inline" style={{ color: "var(--text-muted)" }}>
          · {T.lt_calibNote}
        </span>
      </div>
      <div className="stat-card !p-4 sm:!p-5 space-y-3">{phaseToggle}{body}</div>
    </motion.section>
  );
}

/* ── Tarjeta de métrica con baseline opcional ── */
function Metric({ label, value, baseline, baselineLabel, hint }: {
  label: string; value: number; baseline?: number; baselineLabel?: string; hint: string;
}) {
  return (
    <div className="text-left">
      <p
        className="text-[10px] uppercase tracking-widest mb-1"
        style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
      >
        {label}
      </p>
      <p
        className="leading-none tabular-nums"
        style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.3rem, 4vw, 1.7rem)", color: "var(--text)" }}
      >
        {value.toFixed(3)}
      </p>
      {baseline !== undefined && (
        <p className="text-[10px] mt-1 tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          {baselineLabel}: {baseline.toFixed(3)}
        </p>
      )}
      <p className="text-[10px] mt-1 leading-snug" style={{ color: "var(--text-muted)", opacity: 0.8 }}>
        {hint}
      </p>
    </div>
  );
}
