"use client";

import { useContext, useMemo } from "react";
import type { LiveMatch, TeamInfo } from "@/types";
import { LangContext, useLang } from "@/lib/i18n";
import { useCountdown } from "@/lib/countdown";
import {
  findFinal, summarizeFinal, buildRoad, TOURNAMENT_AWARDS, CHAMPION_FACTS,
  WC2030_START_UTC, WC2030_HOSTS, WC2030_CENTENARY_HOSTS, type RoadStop,
} from "@/lib/championData";

interface Props {
  liveMatches: LiveMatch[];
  teams?: Record<string, TeamInfo>;
  /** oculta la tarjeta de resultado de la final (para cuando ya se muestra
      arriba, p. ej. dentro del modal de celebración) */
  hideHero?: boolean;
}

/* ══════════════════════════════════════════════════════
   MUNDIAL 2026 — resultado de la final, premios, camino de
   la campeona y cuenta regresiva al próximo Mundial (2030).
   El campeón se lee de los datos reales (findFinal); si el
   torneo aún no terminó, solo se muestra la cuenta regresiva.
══════════════════════════════════════════════════════ */
export default function ChampionSpotlight({ liveMatches, teams, hideHero }: Props) {
  const T = useLang();
  const lang = useContext(LangContext);

  const final = useMemo(() => findFinal(liveMatches), [liveMatches]);
  const summary = useMemo(() => (final ? summarizeFinal(final) : null), [final]);
  const road = useMemo(
    () => (summary ? buildRoad(liveMatches, summary.champion) : []),
    [liveMatches, summary]
  );
  const countdown = useCountdown(WC2030_START_UTC);

  const flag = (t: string) => teams?.[t]?.flag ?? "🏳️";

  const ROUND_LABEL: Record<string, string> = {
    LAST_32: T.roundOf32, LAST_16: T.roundOf16,
    QUARTER_FINALS: T.quarterFinal, SEMI_FINALS: T.semiFinal,
    THIRD_PLACE: T.lt_brThird, FINAL: T.final,
  };
  const stageLabel = (s: RoadStop) =>
    s.group?.startsWith("Group")
      ? `${T.group} ${s.group.slice(6)}`
      : (s.round ? (ROUND_LABEL[s.round] ?? s.round) : "");

  const decidedLabel =
    summary?.decidedBy === "EXTRA_TIME" ? T.cs_decidedExtra
    : summary?.decidedBy === "PENALTY_SHOOTOUT" ? T.cs_decidedPens
    : T.cs_decidedRegular;

  const outcomeTag = (o: RoadStop["outcome"]) =>
    o === "W" ? T.cs_outcomeW : o === "D" ? T.cs_outcomeD : T.cs_outcomeL;
  const outcomeColor = (o: RoadStop["outcome"]) =>
    o === "W" ? "#4ADE80" : o === "D" ? "var(--wc-gold)" : "#F87171";

  const facts = summary ? (CHAMPION_FACTS[summary.champion] ?? []) : [];

  return (
    <div className="space-y-6">
      {summary && (
        <>
          {/* ── Resultado de la final ── */}
          {!hideHero && (
          <div
            className="stat-card !p-6 text-center"
            style={{
              borderColor: "rgba(212,168,67,0.4)",
              background: "linear-gradient(160deg, rgba(212,168,67,0.08), var(--surface))",
            }}
          >
            <div
              className="text-[10px] uppercase tracking-[0.24em] font-mono mb-3"
              style={{ color: "var(--wc-gold)" }}
            >
              🏆 {T.cs_champTitle}
            </div>
            <div className="text-5xl mb-2">{flag(summary.champion)}</div>
            <div
              className="font-black"
              style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.6rem, 5vw, 2.4rem)" }}
            >
              {summary.champion}
            </div>
            <div className="flex items-center justify-center gap-3 mt-4 flex-wrap">
              <span className="text-sm font-bold">{flag(summary.champion)} {summary.champion}</span>
              <span className="score-final" style={{ color: "var(--wc-gold)" }}>
                {summary.score1}–{summary.score2}
              </span>
              <span className="text-sm font-bold">{summary.runnerUp} {flag(summary.runnerUp)}</span>
            </div>
            <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
              {T.cs_finalLabel} · {decidedLabel}
              {summary.penalties && ` (${summary.penalties.champion}–${summary.penalties.runnerUp} pen.)`}
            </p>
          </div>
          )}

          {/* ── Premios individuales ── */}
          <div className="stat-card">
            <h3 className="font-bold mb-4">{T.cs_awardsTitle}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TOURNAMENT_AWARDS.map((a) => (
                <div
                  key={a.player}
                  className="flex items-start gap-3 rounded-lg p-3"
                  style={{ background: "var(--surface-2)" }}
                >
                  <span className="text-2xl shrink-0">{a.icon}</span>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-widest font-mono" style={{ color: "var(--wc-gold)" }}>
                      {a.award[lang]}
                    </p>
                    <p className="text-sm font-bold truncate">{flag(a.team)} {a.player}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{a.detail[lang]}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Camino al título ── */}
          {road.length > 0 && (
            <div className="stat-card overflow-x-auto">
              <h3 className="font-bold mb-1">{T.cs_roadTitle}</h3>
              <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>{T.cs_roadNote}</p>
              <div className="space-y-2 min-w-[320px]">
                {road.map((s, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span
                      className="text-[10px] font-mono uppercase tracking-wider w-24 shrink-0"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {stageLabel(s)}
                    </span>
                    <span className="flex-1 min-w-0 truncate">{flag(s.opponent)} {s.opponent}</span>
                    <span className="tabular-nums font-bold shrink-0">
                      {s.myScore}–{s.theirScore}
                      {s.penalties && (
                        <span className="text-[10px] align-top" style={{ color: "var(--wc-gold)" }}>
                          {" "}({s.penalties.mine}–{s.penalties.theirs} pen.)
                        </span>
                      )}
                    </span>
                    <span
                      className="verdict-badge shrink-0"
                      style={{
                        color: outcomeColor(s.outcome),
                        borderColor: `${outcomeColor(s.outcome)}66`,
                        background: `${outcomeColor(s.outcome)}14`,
                      }}
                    >
                      {outcomeTag(s.outcome)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Datos curiosos ── */}
          {facts.length > 0 && (
            <div className="stat-card">
              <h3 className="font-bold mb-4">{T.cs_factsTitle}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {facts.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-lg p-3"
                    style={{ background: "var(--surface-2)" }}
                  >
                    <span className="text-xl shrink-0">{f.icon}</span>
                    <p className="text-sm leading-snug">{f.text[lang]}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Cuenta regresiva: próximo Mundial (2030) — no depende del campeón ── */}
      <div className="stat-card !p-5 text-center">
        <h3 className="font-bold mb-1">{T.cs_nextWcTitle}</h3>
        <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>{T.cs_nextWcHosts}</p>
        {countdown && (
          <div className="flex justify-center gap-3 sm:gap-6 flex-wrap">
            {[
              { v: countdown.days, l: T.cs_days },
              { v: countdown.hours, l: T.cs_hours },
              { v: countdown.minutes, l: T.cs_min },
              { v: countdown.seconds, l: T.cs_sec },
            ].map(({ v, l }) => (
              <div key={l} className="text-center">
                <div
                  className="tabular-nums font-black"
                  style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.8rem, 6vw, 2.6rem)", color: "var(--wc-gold)" }}
                >
                  {String(v).padStart(2, "0")}
                </div>
                <div className="text-[10px] uppercase tracking-widest font-mono" style={{ color: "var(--text-muted)" }}>
                  {l}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-center gap-2 mt-4 text-xl">
          <span>{WC2030_HOSTS.join(" ")}</span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>·</span>
          <span className="opacity-70">{WC2030_CENTENARY_HOSTS.join(" ")}</span>
        </div>
      </div>
    </div>
  );
}
