"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
import type { TeamInfo, Prediction, FixedResults, LiveMatch } from "@/types";
import type { ScoreMap } from "@/lib/live";
import { simulateTeamPath, type Bracket, type TeamPath, type TeamPathRound } from "@/lib/simulator";
import { useLang } from "@/lib/i18n";

interface Props {
  teams: Record<string, TeamInfo>;
  predictions: Record<string, Prediction>;
  groups: Record<string, string[]>;
  bracket?: Bracket | null;
  fixedResults?: FixedResults;
  liveScores?: ScoreMap;
  /** Partidos reales (incl. KO): condicionan el camino a lo ya jugado. */
  liveMatches?: LiveMatch[];
}

const N_SIMS = 2000;

const ROUND_META: Record<TeamPathRound["round"], { accent: string }> = {
  r32:   { accent: "#4a4a8a" },
  r16:   { accent: "#1c3f94" },
  qf:    { accent: "#7b1c94" },
  sf:    { accent: "#cf0a2c" },
  final: { accent: "#d4a843" },
};

function pct(v: number, d = 0) { return `${(v * 100).toFixed(d)}%`; }

export default function ChampionPath({ teams, predictions, groups, bracket, fixedResults, liveScores, liveMatches }: Props) {
  const T = useLang();

  const roster = useMemo(
    () => Object.values(groups).flat().filter((t) => teams[t]).sort((a, b) => a.localeCompare(b)),
    [groups, teams]
  );

  /* arranca con el favorito (mejor ELO) para mostrar algo útil de entrada */
  const [team, setTeam] = useState<string>("");
  useEffect(() => {
    if (team || roster.length === 0) return;
    const fav = [...roster].sort((a, b) => (teams[b]?.elo ?? 0) - (teams[a]?.elo ?? 0))[0];
    setTeam(fav);
  }, [roster, teams, team]);

  const [path, setPath] = useState<TeamPath | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!team || !bracket) { setPath(null); return; }
    startTransition(() => {
      setPath(simulateTeamPath(team, predictions, groups, teams, bracket, N_SIMS, fixedResults, liveScores, liveMatches));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, bracket, fixedResults, liveScores, liveMatches]);

  const roundLabel = (r: TeamPathRound["round"]) =>
    r === "r32" ? T.roundOf32 : r === "r16" ? T.roundOf16 : r === "qf" ? T.quarterFinal
    : r === "sf" ? T.semiFinal : T.final;

  if (!bracket) {
    return <p className="text-sm text-center py-12" style={{ color: "var(--text-muted)" }}>{T.cp_noBracket}</p>;
  }

  const flag = (n: string) => teams[n]?.flag ?? "🏳️";

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* selector de equipo */}
      <div className="flex items-center justify-center gap-2.5 flex-wrap">
        <span className="text-xs uppercase tracking-widest" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          {T.cp_pickTeam}
        </span>
        <select
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold"
          style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border-subtle)" }}
        >
          {roster.map((t) => (
            <option key={t} value={t}>{flag(t)} {t}</option>
          ))}
        </select>
      </div>

      {isPending && (
        <div className="flex flex-col items-center py-16 gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[var(--wc-red)] border-t-transparent animate-spin" />
          <p className="text-[var(--text-muted)] text-sm">
            {T.calculatingTourneys.replace("{n}", N_SIMS.toLocaleString())}
          </p>
        </div>
      )}

      {path && !isPending && (
        <div className="space-y-4 animate-in fade-in duration-300">
          {/* cabecera: equipo + prob de campeón */}
          <div className="stat-card text-center">
            <div className="text-4xl mb-1">{flag(path.team)}</div>
            <div className="font-bold text-lg">{path.team}</div>
            <div className="text-xs text-[var(--text-muted)] mt-2 uppercase tracking-widest" style={{ fontFamily: "var(--font-mono)" }}>
              {T.worldChampion}
            </div>
            <div className="text-4xl font-black mt-0.5" style={{ color: "#f5cc6a" }}>{pct(path.champion, 1)}</div>
          </div>

          {/* embudo del camino, ronda a ronda */}
          <div className="stat-card">
            <h4 className="font-bold text-sm mb-4 text-[var(--text-muted)] uppercase tracking-widest">
              {T.cp_routeTitle}
            </h4>
            <div className="space-y-3">
              {path.rounds.map((r) => {
                const meta = ROUND_META[r.round];
                const top = r.topOpponents[0];
                return (
                  <div key={r.round} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold" style={{ color: meta.accent }}>
                        {roundLabel(r.round)}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">
                        {T.cp_reach}: <strong className="text-[var(--text)]">{pct(r.reach)}</strong>
                      </span>
                    </div>
                    {/* barra de prob de LLEGAR a esa ronda */}
                    <div className="h-3 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                           style={{ width: `${r.reach * 100}%`, background: `linear-gradient(90deg,${meta.accent}cc,${meta.accent})` }} />
                    </div>
                    {/* rival probable + dificultad de la ronda */}
                    <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
                      <span className="truncate">
                        {top
                          ? <>{T.cp_opponent}: <strong className="text-[var(--text)]">{flag(top.team)} {top.team}</strong> ({pct(top.prob)})</>
                          : "—"}
                      </span>
                      <span className="shrink-0">
                        {T.cp_passIfReach}: <strong className="text-[var(--text)]">{pct(r.condAdvance)}</strong>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-4 leading-snug">
              {T.cp_note.replace("{n}", N_SIMS.toLocaleString())}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
