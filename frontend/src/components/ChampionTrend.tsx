"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";
import type { TeamInfo, Prediction, LiveMatch } from "@/types";
import type { Bracket } from "@/lib/simulator";
import { buildChampionTrend, trendDeltas, type TrendPoint } from "@/lib/championHistory";
import { useLang } from "@/lib/i18n";

interface Props {
  teams: Record<string, TeamInfo>;
  predictions: Record<string, Prediction>;
  groups: Record<string, string[]>;
  bracket?: Bracket | null;
  liveMatches: LiveMatch[];
}

const TOP_N = 6;
const N_SIMS = 1200;

/** Paleta distinguible para las series (equipos). */
const COLORS = ["#cf0a2c", "#d4a843", "#2f72e0", "#2ea44f", "#9b5de5", "#e07b39"];

export default function ChampionTrend({ teams, predictions, groups, bracket, liveMatches }: Props) {
  const T = useLang();
  const [points, setPoints] = useState<TrendPoint[] | null>(null);
  const [isPending, startTransition] = useTransition();

  /* Solo recalcular cuando cambia el nº de partidos de grupo jugados
     (no en cada refresco de marcadores). Cada cambio = una jornada nueva. */
  const playedCount = useMemo(
    () => liveMatches.filter(
      (m) => m.group?.startsWith("Group") && m.score1 !== null && m.score2 !== null,
    ).length,
    [liveMatches],
  );

  useEffect(() => {
    startTransition(() => {
      setPoints(buildChampionTrend(predictions, groups, teams, bracket, liveMatches, N_SIMS));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playedCount, bracket]);

  const fmtShort = (date: string) =>
    new Date(date + "T12:00:00Z").toLocaleDateString(T.locale, { day: "numeric", month: "short" });

  /* Equipos a graficar: los TOP_N por P(campeón) en el corte más reciente. */
  const { chartData, topTeams, deltas } = useMemo(() => {
    if (!points || points.length === 0) return { chartData: [], topTeams: [] as string[], deltas: [] };
    const d = trendDeltas(points);
    const top = d.slice(0, TOP_N).map((x) => x.team);
    const data = points.map((p) => {
      const row: Record<string, string | number> = {
        label: p.date ? fmtShort(p.date) : T.trend_start,
      };
      for (const t of top) row[t] = +(100 * (p.champ[t] ?? 0)).toFixed(1);
      return row;
    });
    return { chartData: data, topTeams: top, deltas: d };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, T.trend_start, T.locale]);

  /* Mayor subida / caída entre selecciones con opción real al título. */
  const movers = useMemo(() => {
    const relevant = deltas.filter((d) => d.last >= 0.005 || d.first >= 0.005);
    if (relevant.length === 0) return null;
    const riser = relevant.reduce((a, b) => (b.delta > a.delta ? b : a));
    const faller = relevant.reduce((a, b) => (b.delta < a.delta ? b : a));
    return { riser, faller };
  }, [deltas]);

  /* Estados sin datos / cargando */
  if (points === null || isPending) {
    return (
      <div className="stat-card !p-8 text-center">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{T.trend_loading}</p>
      </div>
    );
  }
  if (points.length === 0) {
    return (
      <div className="stat-card !p-8 text-center">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{T.trend_empty}</p>
      </div>
    );
  }

  const flag = (t: string) => teams[t]?.flag ?? "";
  const colorOf = (t: string) => COLORS[topTeams.indexOf(t) % COLORS.length];

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="shrink-0" style={{ width: 18, height: 3, background: "var(--wc-red)" }} />
        <h3
          className="text-[11px] font-bold uppercase tracking-[0.18em]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}
        >
          {T.trend_title}
        </h3>
        <span className="text-xs hidden sm:inline" style={{ color: "var(--text-muted)" }}>
          · {T.trend_note}
        </span>
      </div>

      {/* Mayor subida / caída */}
      {movers && (
        <div className="grid grid-cols-2 gap-2.5">
          <Mover
            label={T.trend_topRiser} team={movers.riser.team} flag={flag(movers.riser.team)}
            value={movers.riser.last} delta={movers.riser.delta} up
          />
          <Mover
            label={T.trend_topFaller} team={movers.faller.team} flag={flag(movers.faller.team)}
            value={movers.faller.last} delta={movers.faller.delta}
          />
        </div>
      )}

      {/* Gráfico de evolución */}
      <div className="stat-card !p-4">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              tickFormatter={(v: number) => `${v}%`}
              width={42}
            />
            <Tooltip
              contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: 10, fontSize: 12 }}
              labelStyle={{ color: "var(--text)", fontWeight: 700 }}
              formatter={(v: number, name: string) => [`${v}%`, `${flag(name)} ${name}`]}
              itemSorter={(item) => -(item.value as number)}
            />
            <Legend
              formatter={(value: string) => (
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{flag(value)} {value}</span>
              )}
            />
            {topTeams.map((t) => (
              <Line
                key={t} type="monotone" dataKey={t}
                stroke={colorOf(t)} strokeWidth={2}
                dot={{ r: 2 }} activeDot={{ r: 5 }} isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <p className="text-[11px] mt-2" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          {T.trend_methodNote.replace("{n}", N_SIMS.toLocaleString(T.locale))}
        </p>
      </div>
    </div>
  );
}

/* ── Tarjeta de mayor subida / caída ── */
function Mover({ label, team, flag, value, delta, up }: {
  label: string; team: string; flag: string; value: number; delta: number; up?: boolean;
}) {
  const pp = (delta * 100);
  const sign = pp >= 0 ? "+" : "−";
  const color = up ? "#2ea44f" : "var(--wc-red)";
  return (
    <div className="stat-card !p-3.5 text-left">
      <p
        className="text-[10px] uppercase tracking-widest mb-1.5"
        style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
      >
        {up ? "🔺" : "🔻"} {label}
      </p>
      <p className="text-sm font-bold truncate">{flag} {team}</p>
      <p className="text-xs tabular-nums mt-0.5" style={{ color: "var(--text-muted)" }}>
        {(value * 100).toFixed(1)}%{" "}
        <span style={{ color, fontWeight: 700 }}>
          ({sign}{Math.abs(pp).toFixed(1)} pp)
        </span>
      </p>
    </div>
  );
}
