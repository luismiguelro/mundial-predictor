"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { TeamInfo, Prediction, LiveMatch } from "@/types";
import type { LiveStats, MatchVerdict, StandingRow } from "@/lib/live";
import { computeGroupStandings, isTightMatch, predictedOutcome } from "@/lib/live";
import { overriddenGroups } from "@/lib/overrides";
import { type Bracket } from "@/lib/simulator";
import LiveBracket from "@/components/LiveBracket";
import { staggerContainer, fadeUp } from "@/lib/animations";
import { useLang } from "@/lib/i18n";

interface Props {
  teams: Record<string, TeamInfo>;
  predictions: Record<string, Prediction>;
  groups: Record<string, string[]>;
  liveMatches: LiveMatch[];
  stats: LiveStats;
  verdicts: MatchVerdict[];
  bracket?: Bracket | null;
  /** zona horaria por IP (Vercel geo); null → zona del sistema */
  timezone?: string | null;
  /** tabla oficial (football-data); null → se calcula desde los marcadores */
  apiStandings?: Record<string, StandingRow[]> | null;
}

const MVR_PREVIEW = 6; // tarjetas visibles antes de "Ver todos"

function fmtPct(n: number) { return `${(n * 100).toFixed(0)}%`; }

/* ══════════════════════════════════════════════════════
   EN VIVO — lo que va del torneo: realidad + modelo
══════════════════════════════════════════════════════ */
export default function LiveTournament({
  teams, predictions, groups, liveMatches, stats, verdicts, bracket, timezone, apiStandings,
}: Props) {
  const T = useLang();
  const [showAll, setShowAll] = useState(false);
  const flag = (name: string) => teams[name]?.flag ?? "";

  const ROUND_LABEL: Record<string, string> = {
    LAST_32: T.roundOf32, LAST_16: T.roundOf16,
    QUARTER_FINALS: T.quarterFinal, SEMI_FINALS: T.semiFinal,
    THIRD_PLACE: T.lt_brThird, FINAL: T.final,
  };
  const stageLabel = (m: LiveMatch) =>
    m.group?.startsWith("Group")
      ? `${T.group} ${m.group.slice(6)}`
      : (m.round ? (ROUND_LABEL[m.round] ?? m.round) : "");

  /* En juego ahora (estado solo disponible vía API) */
  const inPlay = useMemo(
    () => liveMatches.filter((m) => m.status === "IN_PLAY" || m.status === "PAUSED"),
    [liveMatches]
  );

  /* Modelo vs Realidad: más reciente primero */
  const recent = useMemo(
    () => [...verdicts].sort((a, b) => (b.m.date ?? "").localeCompare(a.m.date ?? "")),
    [verdicts]
  );
  const visible = showAll ? recent : recent.slice(0, MVR_PREVIEW);
  const hits = verdicts.filter((v) => v.hit).length;
  const pct = verdicts.length ? Math.round((hits / verdicts.length) * 100) : 0;

  /* Posiciones por grupo: ÚNICA y DIRECTAMENTE de la tabla oficial de la API
     (orden y stats tal cual football-data, con sus desempates reales). Aunque
     tarde en actualizarse, manda la API. Solo si la API no responde (sin token /
     error) se cae al cálculo propio desde los marcadores para no quedar vacío. */
  const allStandings = useMemo(() => {
    const hasApi = apiStandings && Object.keys(apiStandings).length > 0;
    if (!hasApi) return computeGroupStandings(liveMatches, groups);
    // La tabla oficial aún puede traer un marcador erróneo ya corregido a mano:
    // para esos grupos la recalculamos desde los marcadores corregidos, usando
    // el orden oficial como desempate fino. El resto queda tal cual la API.
    const affected = overriddenGroups(liveMatches);
    if (affected.size === 0) return apiStandings;
    const apiOrder = Object.fromEntries(
      Object.entries(apiStandings).map(([g, rows]) => [g, rows.map((r) => r.team)])
    );
    const computed = computeGroupStandings(liveMatches, groups, apiOrder);
    const merged = { ...apiStandings };
    for (const g of affected) if (computed[g]) merged[g] = computed[g];
    return merged;
  }, [apiStandings, liveMatches, groups]);

  /* Posiciones reales: solo grupos con al menos un partido jugado */
  const standings = useMemo(
    () =>
      Object.entries(allStandings)
        .filter(([, rows]) => rows.some((r) => r.played > 0))
        .sort(([a], [b]) => a.localeCompare(b)),
    [allStandings]
  );

  /* Vista de la sección final: cuadro de eliminatorias (por defecto) o tabla */
  const [liveView, setLiveView] = useState<"bracket" | "standings">("bracket");

  /* Próximos partidos: las siguientes 2 fechas con partidos pendientes */
  const today = new Date().toLocaleDateString("en-CA");
  const upcoming = useMemo(() => {
    const pending = liveMatches.filter(
      (m) =>
        m.score1 === null && m.status !== "IN_PLAY" && m.status !== "PAUSED" &&
        m.date && m.date >= today && teams[m.team1] && teams[m.team2]
    );
    const dates = [...new Set(pending.map((m) => m.date!))].sort().slice(0, 2);
    return dates.map((d) => ({ date: d, fixtures: pending.filter((m) => m.date === d) }));
  }, [liveMatches, teams, today]);

  /* Pronóstico del modelo para un partido pendiente o en juego */
  type Forecast = { label: string; prob: number; probs: { t1: number; draw: number; t2: number }; tight: boolean };
  function forecast(m: LiveMatch): Forecast | null {
    const direct = predictions[`${m.team1}|${m.team2}`];
    const reverse = predictions[`${m.team2}|${m.team1}`];
    const probs = direct
      ? { t1: direct.home_win, draw: direct.draw, t2: direct.away_win }
      : reverse
        ? { t1: reverse.away_win, draw: reverse.draw, t2: reverse.home_win }
        : null;
    if (!probs) return null;
    // Muy parejo (equipos a la par + empate competitivo) → se da por empate
    const k = predictedOutcome(probs);
    const tight = isTightMatch(probs);
    return { label: k === "t1" ? m.team1 : k === "t2" ? m.team2 : T.draw, prob: probs[k], probs, tight };
  }

  /* Si hay zona por IP (geo de Vercel) se usa esa; si no, la del sistema. */
  const tzOpt = timezone ? { timeZone: timezone } : {};
  const fmtDate = (d: string) =>
    // mediodía UTC para que el nombre del día no se desplace al cambiar de zona
    new Date(d + "T12:00:00Z").toLocaleDateString(T.locale, {
      weekday: "short", day: "numeric", month: "short", ...tzOpt,
    });
  const fmtTime = (utc?: string) =>
    utc
      ? new Date(utc).toLocaleTimeString(T.locale, {
          hour: "2-digit", minute: "2-digit", ...tzOpt,
        })
      : "";

  /* Etiqueta de la zona en uso (ej. "GMT-5"), para dejar claro al usuario
     en qué horario está viendo los partidos. */
  const tzLabel = useMemo(() => {
    try {
      return (
        new Intl.DateTimeFormat(T.locale, { timeZoneName: "short", ...tzOpt })
          .formatToParts(new Date())
          .find((p) => p.type === "timeZoneName")?.value ?? ""
      );
    } catch {
      return "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [T.locale, timezone]);

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-7">

      {/* ── KPIs del torneo ── */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <Kpi label={T.lt_played}   value={String(stats.played)} />
        <Kpi label={T.lt_goals}    value={String(stats.goals)} />
        <Kpi label={T.lt_avgGoals} value={stats.played ? stats.avg.toFixed(2) : "—"} />
        <Kpi
          label={T.modelRecord}
          value={verdicts.length ? `${pct}%` : "—"}
          sub={verdicts.length ? `${hits}/${verdicts.length}` : undefined}
          gold
        />
      </motion.div>

      {/* ── En juego ahora ── */}
      {inPlay.length > 0 && (
        <motion.section variants={fadeUp} className="space-y-3">
          <SectionTitle dot title={T.lt_inPlay} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {inPlay.map((m) => {
              const half = m.status === "PAUSED";
              const hasScore =
                typeof m.liveScore1 === "number" && typeof m.liveScore2 === "number";
              const f = forecast(m);
              return (
                <div
                  key={`${m.team1}|${m.team2}`}
                  className="stat-card !p-4 text-center"
                  style={{ borderColor: "rgba(207,10,44,0.45)" }}
                >
                  {/* fase + estado (en juego / entretiempo) */}
                  <div className="flex items-center justify-center gap-2 mb-2.5">
                    <span className="live-dot" />
                    <span
                      className="text-[10px] uppercase tracking-[0.18em]"
                      style={{ fontFamily: "var(--font-mono)", color: "var(--wc-red)" }}
                    >
                      {stageLabel(m)} · {half ? T.lt_halftime : T.lt_live}
                    </span>
                  </div>

                  {/* equipos + marcador en vivo */}
                  <div className="flex items-center gap-2">
                    <span className="flex-1 min-w-0 text-right text-sm font-bold truncate">
                      {flag(m.team1)} {m.team1}
                    </span>
                    {hasScore ? (
                      <span
                        className="score-final shrink-0 px-1 tabular-nums"
                        style={{ color: "var(--wc-red)" }}
                      >
                        {m.liveScore1}–{m.liveScore2}
                      </span>
                    ) : (
                      <span className="text-xs shrink-0 px-1" style={{ color: "var(--text-muted)" }}>
                        vs
                      </span>
                    )}
                    <span className="flex-1 min-w-0 text-left text-sm font-bold truncate">
                      {m.team2} {flag(m.team2)}
                    </span>
                  </div>

                  {/* pronóstico del modelo */}
                  {f && (
                    <>
                      <div className="flex h-2 rounded-full overflow-hidden mt-3 mb-1.5">
                        <div style={{ width: `${f.probs.t1 * 100}%`, background: "#c8102e" }} />
                        <div style={{ width: `${f.probs.draw * 100}%`, background: "rgba(255,255,255,0.15)" }} />
                        <div style={{ width: `${f.probs.t2 * 100}%`, background: "#003087" }} />
                      </div>
                      <p className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                        {T.lt_forecast}:{" "}
                        <span className="font-bold" style={{ color: "var(--text)" }}>{f.label}</span> · {fmtPct(f.prob)}
                      </p>
                      {f.tight && (
                        <p
                          className="text-[10px] mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
                          style={{
                            fontFamily: "var(--font-mono)",
                            background: "rgba(119,119,153,0.14)",
                            border: "1px solid rgba(119,119,153,0.30)",
                            color: "var(--text-muted)",
                          }}
                        >
                          🟰 {T.tightMatch}
                        </p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* ── Modelo vs Realidad ── */}
      <motion.section variants={fadeUp} className="space-y-3">
        <SectionTitle title={T.lt_mvrTitle} note={T.lt_mvrNote} />

        {recent.length === 0 ? (
          <div className="stat-card !p-5 flex items-center gap-3">
            <span className="live-dot shrink-0" />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>{T.lt_empty}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {visible.map((v) => {
                const { m } = v;
                const pickLabel =
                  v.predicted === "t1" ? m.team1 : v.predicted === "t2" ? m.team2 : T.draw;
                return (
                  <div key={`${m.team1}|${m.team2}|${m.date}`} className="stat-card !p-4 text-left">
                    {/* fecha + fase + veredicto */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span
                        className="text-[10px] uppercase tracking-wider truncate"
                        style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
                      >
                        {m.date ? fmtDate(m.date) : ""} · {stageLabel(m)}
                      </span>
                      <span className={`verdict-badge ${v.hit ? "verdict-hit" : "verdict-miss"}`}>
                        {v.hit ? `✓ ${T.verdictHit}` : `✗ ${T.verdictMiss}`}
                      </span>
                    </div>

                    {/* equipos + marcador oficial */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="flex-1 min-w-0 text-right text-sm font-bold truncate">
                        {flag(m.team1)} {m.team1}
                      </span>
                      <span className="score-final shrink-0 px-1">
                        {m.score1}–{m.score2}
                        {m.penalties && (
                          <span className="text-[10px] align-top" style={{ color: "var(--wc-gold)" }}>
                            {" "}({T.lt_pens} {m.penalties.home}–{m.penalties.away})
                          </span>
                        )}
                      </span>
                      <span className="flex-1 min-w-0 text-sm font-bold truncate">
                        {m.team2} {flag(m.team2)}
                      </span>
                    </div>

                    {/* lo que dijo el modelo */}
                    <div className="flex h-2 rounded-full overflow-hidden mb-1.5">
                      <div style={{ width: `${v.probs.t1 * 100}%`, background: "#c8102e" }} />
                      <div style={{ width: `${v.probs.draw * 100}%`, background: "rgba(255,255,255,0.15)" }} />
                      <div style={{ width: `${v.probs.t2 * 100}%`, background: "#003087" }} />
                    </div>
                    <p className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {T.lt_forecast}: <span className="font-bold" style={{ color: "var(--text)" }}>{pickLabel}</span> · {fmtPct(v.prob)}
                    </p>
                  </div>
                );
              })}
            </div>

            {recent.length > MVR_PREVIEW && (
              <div className="text-center">
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="text-xs px-4 py-2 rounded-lg font-semibold transition-all bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  {showAll ? T.backtestLess : `${T.backtestMore} (${recent.length})`}
                </button>
              </div>
            )}
          </>
        )}
      </motion.section>

      {/* ── Próximos partidos ── */}
      {upcoming.length > 0 && (
        <motion.section variants={fadeUp} className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <SectionTitle title={T.lt_upcoming} />
            {tzLabel && (
              <span
                className="text-[10px] uppercase tracking-wider"
                style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
              >
                🕒 {T.lt_upcomingTz} · {tzLabel}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            {upcoming.map(({ date, fixtures }) => (
              <div key={date} className="stat-card !p-4 text-left">
                <p
                  className="text-[10px] uppercase tracking-[0.18em] mb-1"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--wc-gold)" }}
                >
                  {fmtDate(date)}
                </p>
                <div className="divide-y divide-[var(--border-subtle)]">
                  {fixtures.map((m) => {
                    const f = forecast(m);
                    return (
                      <div key={`${m.team1}|${m.team2}`} className="py-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[10px] tabular-nums w-11 shrink-0"
                            style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
                          >
                            {fmtTime(m.utc)}
                          </span>
                          <span className="flex-1 min-w-0 text-right text-sm truncate">
                            {flag(m.team1)} {m.team1}
                          </span>
                          <span className="text-[10px] shrink-0 px-0.5" style={{ color: "var(--text-muted)" }}>
                            vs
                          </span>
                          <span className="flex-1 min-w-0 text-sm truncate">
                            {m.team2} {flag(m.team2)}
                          </span>
                        </div>
                        {f && (
                          <div className="flex justify-end mt-1.5 pl-11">
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full tabular-nums"
                              style={{
                                fontFamily: "var(--font-mono)",
                                background: "rgba(212,168,67,0.10)",
                                border: "1px solid rgba(212,168,67,0.30)",
                                color: "var(--wc-gold)",
                              }}
                            >
                              {T.lt_forecast}: {f.label} {fmtPct(f.prob)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {/* ── Tabla de posiciones / Eliminatorias (dos botones) ── */}
      {(standings.length > 0 || bracket) && (
        <motion.section variants={fadeUp} className="space-y-3">
          <div className="flex gap-1 bg-[var(--surface-2)] rounded-lg p-1 w-fit">
            {([
              { key: "bracket"   as const, label: T.lt_tabBracket },
              { key: "standings" as const, label: T.lt_tabStandings },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setLiveView(key)}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  liveView === key ? "bg-[var(--wc-red)] text-white" : "text-[var(--text-muted)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {liveView === "standings" ? (
            standings.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {standings.map(([g, rows]) => (
                  <div key={g} className="stat-card !p-4 text-left">
                    <div className="grid grid-cols-[1fr_1.8rem_2.4rem_1.9rem] gap-x-1.5 items-baseline mb-2 pb-2 border-b border-[var(--border-subtle)]">
                      <span className="text-xs font-black" style={{ color: "var(--wc-red)" }}>
                        {T.group} {g}
                      </span>
                      {[T.lt_playedHead, T.lt_gdHead, T.lt_ptsHead].map((h) => (
                        <span
                          key={h}
                          className="text-[9px] uppercase tracking-wider text-right"
                          style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
                        >
                          {h}
                        </span>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      {rows.map((r, i) => (
                        <div
                          key={r.team}
                          className="grid grid-cols-[1fr_1.8rem_2.4rem_1.9rem] gap-x-1.5 items-center text-xs"
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{
                                background:
                                  i < 2 ? "#22c55e" : i === 2 ? "#f59e0b88" : "rgba(255,255,255,0.10)",
                              }}
                            />
                            <span className="truncate">{flag(r.team)} {r.team}</span>
                          </span>
                          <span className="tabular-nums text-right" style={{ color: "var(--text-muted)" }}>
                            {r.played}
                          </span>
                          <span className="tabular-nums text-right" style={{ color: "var(--text-muted)" }}>
                            {r.gd > 0 ? `+${r.gd}` : r.gd}
                          </span>
                          <span className="tabular-nums font-bold text-right" style={{ color: "var(--wc-gold)" }}>
                            {r.points}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-center py-6" style={{ color: "var(--text-muted)" }}>{T.lt_empty}</p>
            )
          ) : (
            <LiveBracket
              liveMatches={liveMatches}
              teams={teams}
              predictions={predictions}
            />
          )}
        </motion.section>
      )}

      <motion.p
        variants={fadeUp}
        className="text-center text-xs"
        style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
      >
        {T.lt_source}
      </motion.p>
    </motion.div>
  );
}

/* ── Piezas ─────────────────────────────────────────── */
function Kpi({ label, value, sub, gold }: {
  label: string; value: string; sub?: string; gold?: boolean;
}) {
  return (
    <div
      className="stat-card !p-4 text-left"
      style={gold ? { borderColor: "rgba(212,168,67,0.35)" } : undefined}
    >
      <p
        className="text-[10px] uppercase tracking-widest mb-1.5"
        style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
      >
        {label}
      </p>
      <p
        className="leading-none tabular-nums flex items-baseline gap-2 flex-wrap"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(1.7rem, 4vw, 2.4rem)",
          color: gold ? "var(--wc-gold)" : "var(--text)",
        }}
      >
        {value}
        {sub && (
          <span className="text-sm" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
            {sub}
          </span>
        )}
      </p>
    </div>
  );
}

/** Encabezado editorial: guion rojo + título mono uppercase + nota */
function SectionTitle({ title, note, dot }: { title: string; note?: string; dot?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      {dot
        ? <span className="live-dot shrink-0" />
        : <span className="shrink-0" style={{ width: 18, height: 3, background: "var(--wc-red)" }} />}
      <h3
        className="text-[11px] font-bold uppercase tracking-[0.18em]"
        style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}
      >
        {title}
      </h3>
      {note && (
        <span className="text-xs hidden sm:inline" style={{ color: "var(--text-muted)" }}>
          · {note}
        </span>
      )}
    </div>
  );
}
