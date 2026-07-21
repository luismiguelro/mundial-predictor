"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  TeamInfo, Prediction, HistoricalMatch, SiteStats, FixedResults,
  Goalscorer, GroupMatch, GroupStandingEntry, LiveMatch, QatarBacktest,
} from "@/types";
import { LangContext, useLang, type Lang } from "@/lib/i18n";
import {
  buildFixedResults, buildGroupProbIndex, buildLiveStats, buildScoreMap, buildVerdicts,
  fetchLiveMatches, fetchStandings, type LiveStats, type ScoreMap, type StandingRow,
} from "@/lib/live";
import Predictor      from "@/components/Predictor";
import SimulatorTab   from "@/components/Simulator";
import { buildPenRates, type Bracket } from "@/lib/simulator";
import FunFacts       from "@/components/FunFacts";
import Groups         from "@/components/Groups";
import Knockout       from "@/components/Knockout";
import ChampionPath   from "@/components/ChampionPath";
import ChampionTrend  from "@/components/ChampionTrend";
import Glossary       from "@/components/Glossary";
import LiveTournament from "@/components/LiveTournament";
import Changelog      from "@/components/Changelog";
import ChampionCelebration from "@/components/ChampionCelebration";
import { findFinal, summarizeFinal, tournamentDateRange, WC2030_START_UTC, type FinalSummary } from "@/lib/championData";
import { useCountdown, pad2 } from "@/lib/countdown";

/* ─────────────────────────────────────────────────────────────
   UI DEL SHELL (hero, navbar, tabs, footer)
───────────────────────────────────────────────────────────── */
const SHELL = {
  es: {
    navLabel:   "Predictor ML",
    weAre26:    "WE ARE 26",
    eyebrow:    "Análisis con Machine Learning",
    subtitle:   "Probabilidades para las 48 selecciones del Mundial 2026, calculadas con un modelo Dixon-Coles de goles sobre 12 000+ partidos internacionales, ratings ELO históricos y simulación Monte Carlo.",
    tabs:       [
      { id: "envivo",        label: "En Vivo"        },
      { id: "predictor",     label: "Predictor"      },
      { id: "grupos",        label: "Grupos"         },
      { id: "proyecciones",  label: "Proyecciones"   },
      { id: "curiosidades",  label: "Stats"          },
      { id: "glosario",      label: "Glosario"       },
    ],
    projByRound: "Por ronda",
    projPath:    "Camino",
    projTrend:   "Evolución",
    projSim:     "Simulador",
    loading:    "Cargando datos del modelo…",
    footerBy:   "por",
    footerNote: "Modelo validado en Qatar 2022 · No afiliado a FIFA",
    kickoffIn:  "El torneo arranca en",
    liveNow:    "Torneo en vivo",
    played:     "partidos",
    goalsLabel: "goles",
    perMatch:   "/partido",
    modelTag:   "Modelo",
    hitsLabel:  "aciertos",
    lastLabel:  "Último",
    pens:       "pen.",
    daysSuffix: "d",
    tournamentOver: "Mundial finalizado",
    championChip:   "Campeón",
    nextWcChip:     "Mundial 2030 en",
  },
  en: {
    navLabel:   "ML Predictor",
    weAre26:    "WE ARE 26",
    eyebrow:    "Machine Learning Analysis",
    subtitle:   "Probabilities for all 48 teams at the 2026 World Cup, computed with a Dixon-Coles goals model trained on 12,000+ international matches, historical ELO ratings and Monte Carlo simulation.",
    tabs:       [
      { id: "envivo",        label: "Live"          },
      { id: "predictor",     label: "Predictor"     },
      { id: "grupos",        label: "Groups"        },
      { id: "proyecciones",  label: "Projections"   },
      { id: "curiosidades",  label: "Stats"         },
      { id: "glosario",      label: "Glossary"      },
    ],
    projByRound: "By round",
    projPath:    "Path",
    projTrend:   "Trend",
    projSim:     "Simulator",
    loading:    "Loading model data…",
    footerBy:   "by",
    footerNote: "Model validated on Qatar 2022 · Not affiliated with FIFA",
    kickoffIn:  "Tournament kicks off in",
    liveNow:    "Tournament live",
    played:     "matches",
    goalsLabel: "goals",
    perMatch:   "/match",
    modelTag:   "Model",
    hitsLabel:  "correct",
    lastLabel:  "Latest",
    pens:       "pens",
    daysSuffix: "d",
    tournamentOver: "World Cup finished",
    championChip:   "Champion",
    nextWcChip:     "2030 World Cup in",
  },
  pt: {
    navLabel:   "Preditor ML",
    weAre26:    "WE ARE 26",
    eyebrow:    "Análise com Machine Learning",
    subtitle:   "Probabilidades para as 48 seleções da Copa 2026, calculadas com um modelo Dixon-Coles de gols sobre 12 000+ jogos internacionais, ratings ELO históricos e simulação Monte Carlo.",
    tabs:       [
      { id: "envivo",        label: "Ao Vivo"         },
      { id: "predictor",     label: "Preditor"        },
      { id: "grupos",        label: "Grupos"          },
      { id: "proyecciones",  label: "Projeções"       },
      { id: "curiosidades",  label: "Stats"           },
      { id: "glosario",      label: "Glossário"       },
    ],
    projByRound: "Por fase",
    projPath:    "Caminho",
    projTrend:   "Evolução",
    projSim:     "Simulador",
    loading:    "Carregando dados do modelo…",
    footerBy:   "por",
    footerNote: "Modelo validado no Qatar 2022 · Não afiliado à FIFA",
    kickoffIn:  "O torneio começa em",
    liveNow:    "Torneio ao vivo",
    played:     "jogos",
    goalsLabel: "gols",
    perMatch:   "/jogo",
    modelTag:   "Modelo",
    hitsLabel:  "acertos",
    lastLabel:  "Último",
    pens:       "pên.",
    daysSuffix: "d",
    tournamentOver: "Copa finalizada",
    championChip:   "Campeão",
    nextWcChip:     "Copa 2030 em",
  },
} as const;

type TabId = "envivo" | "predictor" | "grupos" | "proyecciones" | "curiosidades" | "glosario";

/* ─────────────────────────────────────────────────────────────
   PAGE
───────────────────────────────────────────────────────────── */
export default function Home() {
  const [lang,  setLang]  = useState<Lang>("es");
  const [tab,   setTab]   = useState<TabId>("envivo");

  const [teams,          setTeams]          = useState<Record<string, TeamInfo> | null>(null);
  const [predictions,    setPredictions]    = useState<Record<string, Prediction> | null>(null);
  const [groups,         setGroups]         = useState<Record<string, string[]> | null>(null);
  const [matches,        setMatches]        = useState<HistoricalMatch[]>([]);
  const [stats,          setStats]          = useState<SiteStats | null>(null);
  const [goalscorers,    setGoalscorers]    = useState<Goalscorer[]>([]);
  const [groupMatches,   setGroupMatches]   = useState<Record<string, GroupMatch[]> | null>(null);
  const [groupStandings, setGroupStandings] = useState<Record<string, GroupStandingEntry[]> | null>(null);
  const [liveMatches,    setLiveMatches]    = useState<LiveMatch[]>([]);
  const [apiStandings,   setApiStandings]   = useState<Record<string, StandingRow[]> | null>(null);
  const [qatar,          setQatar]          = useState<QatarBacktest | null>(null);
  const [bracket,        setBracket]        = useState<Bracket | null>(null);
  const [loading,        setLoading]        = useState(true);
  /* Zona horaria por IP (geo de Vercel). null → usar la del sistema. */
  const [geoTz,          setGeoTz]          = useState<string | null>(null);

  /* Resultados reales del torneo — no bloquea la carga inicial.
     Se refresca cada 90 s para captar partidos en juego / que terminan con la
     pestaña abierta. El proxy /api/live cachea 60 s, así que esto NO aumenta
     el consumo del plan gratuito de football-data (las peticiones extra solo
     golpean nuestra caché, no la API externa). */
  useEffect(() => {
    fetchLiveMatches().then(setLiveMatches);
    const id = setInterval(() => fetchLiveMatches().then(setLiveMatches), 90_000);
    return () => clearInterval(id);
  }, []);

  /* Tabla de posiciones oficial (desempates reales: GD, fair play, etc.).
     Solo cambia al terminar un partido, así que la traemos al cargar y cada vez
     que aumenta el nº de partidos finalizados — no en un intervalo fijo.
     Si no hay token cae a null y la UI calcula desde los marcadores. */
  const finishedCount = useMemo(
    () => liveMatches.filter((m) => m.score1 !== null && m.score2 !== null).length,
    [liveMatches]
  );
  useEffect(() => {
    fetchStandings().then(setApiStandings);
  }, [finishedCount]);

  /* Zona horaria del visitante por IP (Vercel). Si falla o es local,
     queda null y los horarios usan la zona del sistema operativo. */
  useEffect(() => {
    fetch("/api/geo")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.timezone) setGeoTz(d.timezone); })
      .catch(() => {});
  }, []);

  const fixedResults = useMemo(() => buildFixedResults(liveMatches), [liveMatches]);
  const liveScores   = useMemo(() => buildScoreMap(liveMatches), [liveMatches]);
  const liveStats    = useMemo(() => buildLiveStats(liveMatches), [liveMatches]);
  /* Probabilidades de grupo (mismas que la pestaña Grupos) para que los aciertos
     coincidan en ambas vistas; el knockout usa las predicciones neutrales. */
  const groupProbIndex = useMemo(
    () => (groupMatches ? buildGroupProbIndex(groupMatches) : undefined),
    [groupMatches]
  );
  /* Tasas de penales por equipo: reparten el empate al evaluar cruces de KO. */
  const penRates = useMemo(
    () => (teams ? buildPenRates(teams) : undefined),
    [teams]
  );
  /* Modelo vs Realidad: un solo cálculo para el hero y la pestaña En Vivo */
  const verdicts     = useMemo(
    () => (predictions ? buildVerdicts(liveMatches, predictions, groupProbIndex, penRates) : []),
    [liveMatches, predictions, groupProbIndex, penRates]
  );
  const record       = useMemo(
    () => ({ played: verdicts.length, hits: verdicts.filter((v) => v.hit).length }),
    [verdicts]
  );
  /* Mundial terminado: se lee del partido de la FINAL en los datos reales
     (nunca se asume un equipo). Alimenta el chip de campeón y el efecto
     de apertura; si el torneo sigue en curso, ambos quedan inactivos. */
  const finalMatch   = useMemo(() => findFinal(liveMatches), [liveMatches]);
  const championInfo = useMemo(() => (finalMatch ? summarizeFinal(finalMatch) : null), [finalMatch]);
  const playedRange  = useMemo(() => tournamentDateRange(liveMatches), [liveMatches]);

  /* Persistencia */
  useEffect(() => {
    const l = localStorage.getItem("wc-lang") as Lang | null;
    if (l === "es" || l === "en" || l === "pt") setLang(l);
  }, []);
  useEffect(() => {
    localStorage.setItem("wc-lang", lang);
  }, [lang]);

  /* Carga de datos */
  useEffect(() => {
    Promise.all([
      fetch("/data/teams.json").then((r) => r.json()),
      fetch("/data/predictions.json").then((r) => r.json()),
      fetch("/data/groups.json").then((r) => r.json()),
      fetch("/data/matches.json").then((r) => r.json()),
      fetch("/data/stats.json").then((r) => r.json()),
      fetch("/data/goalscorers.json").then((r) => r.json()),
      fetch("/data/group_matches.json").then((r) => r.json()),
      fetch("/data/group_standings.json").then((r) => r.json()),
      fetch("/data/qatar2022.json").then((r) => r.json()).catch(() => null),
      fetch("/data/bracket.json").then((r) => r.json()).catch(() => null),
    ]).then(([t, p, g, m, s, gs, gm, gst, q, br]) => {
      setTeams(t); setPredictions(p); setGroups(g); setMatches(m);
      setStats(s); setGoalscorers(gs); setGroupMatches(gm); setGroupStandings(gst);
      setQatar(q); setBracket(br);
      setLoading(false);
    });
  }, []);

  const S = SHELL[lang];
  const tabNavBg = "rgba(16,22,36,0.96)";
  const mainBg   = "var(--color-arena-void)";
  const footerBg = "var(--color-arena-deep)";

  return (
    /* Context provider: toda la app recibe el idioma activo */
    <LangContext.Provider value={lang}>
      <div style={{ background: mainBg, minHeight: "100dvh", transition: "background 0.25s" }}>

        {/* ══ ¡CAMPEONES! — efecto de apertura, solo si los datos reales
             confirman un partido de FINAL ya jugado ══════════════════ */}
        {championInfo && teams && (
          <ChampionCelebration final={championInfo} liveMatches={liveMatches} teams={teams} lang={lang} />
        )}

        {/* ══ NAVBAR ══════════════════════════════════════════ */}
        <nav className="navbar-wc">
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            width: "100%", maxWidth: "80rem", margin: "0 auto",
          }}>
            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.3rem" }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: "clamp(0.78rem, 2.5vw, 1rem)", letterSpacing: "0.1em", color: "#fff", whiteSpace: "nowrap" }}>
                  FIFA WC
                </span>
                <span style={{ fontFamily: "var(--font-display)", fontSize: "clamp(0.78rem, 2.5vw, 1rem)", letterSpacing: "0.1em", color: "var(--color-wc-red)" }}>
                  2026
                </span>
              </div>
              <div className="hidden sm:block" style={{ width: 1, height: 16, background: "rgba(255,255,255,0.14)" }} />
              <span className="hidden sm:block" style={{ fontFamily: "var(--font-mono)", fontSize: "0.55rem", letterSpacing: "0.15em", color: "var(--color-wc-gold)", textTransform: "uppercase" }}>
                {S.navLabel}
              </span>
            </div>

            {/* Controles derechos */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {/* Idioma */}
              <div style={{ display: "flex", gap: "2px" }}>
                {(["es", "en", "pt"] as Lang[]).map((l) => (
                  <button key={l} onClick={() => setLang(l)} style={{
                    fontFamily: "var(--font-mono)", fontSize: "0.6rem", letterSpacing: "0.08em",
                    textTransform: "uppercase", padding: "0.28rem 0.5rem",
                    border: "none", borderRadius: "3px", cursor: "pointer",
                    minHeight: "32px",
                    background: lang === l ? "var(--color-wc-red)" : "transparent",
                    color: lang === l ? "#fff" : "rgba(255,255,255,0.4)",
                    transition: "background 0.14s, color 0.14s",
                  }}>
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
              {/* WE ARE 26 */}
              <div className="hidden md:flex" style={{ alignItems: "center", gap: "0.4rem" }}>
                <span style={{ fontSize: "0.85rem" }}>🇨🇦🇲🇽🇺🇸</span>
                <span style={{ fontFamily: "var(--font-display)", fontSize: "0.75rem", letterSpacing: "0.18em", color: "rgba(255,255,255,0.45)" }}>
                  {S.weAre26}
                </span>
              </div>
              {/* Novedades / registro de cambios — último control para que el
                  panel (right:0) nunca se desborde en móvil */}
              <Changelog lang={lang} />
            </div>
          </div>
        </nav>

        {/* ══ HERO — editorial compacto ════════════════════════ */}
        <header className="hero-brand">
          <div style={{
            maxWidth: "80rem", margin: "0 auto",
            padding: "clamp(1.75rem, 4vw, 2.75rem) 1.5rem clamp(1.5rem, 3vw, 2.25rem)",
          }}>
            {/* Eyebrow + estado del torneo */}
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
              style={{ display: "flex", alignItems: "center", gap: "0.55rem", marginBottom: "0.9rem", flexWrap: "wrap" }}>
              <div style={{ width: 22, height: 3, background: "var(--color-wc-red)", flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", letterSpacing: "0.2em", color: "var(--color-ink-secondary)", textTransform: "uppercase" }}>
                {S.eyebrow}
              </span>
              <TournamentStatus
                S={S} stats={liveStats} record={record} teams={teams}
                championInfo={championInfo} playedRange={playedRange}
              />
            </motion.div>

            {/* H1 */}
            <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
              style={{ margin: 0, lineHeight: 0.95, letterSpacing: "0.01em" }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2.6rem, 7vw, 4.25rem)", color: "var(--color-ink-primary)" }}>MUNDIAL 2026</span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2.6rem, 7vw, 4.25rem)", color: "var(--color-wc-red)" }}> · PREDICTOR</span>
            </motion.h1>

            {/* Subtítulo legible */}
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.15 }}
              style={{ fontFamily: "var(--font-body)", fontSize: "clamp(0.9rem, 1.6vw, 1.02rem)", lineHeight: 1.55, color: "var(--color-ink-secondary)", margin: "0.85rem 0 0", maxWidth: "46rem" }}>
              {S.subtitle}
            </motion.p>
          </div>

          <div className="accent-bar" />
        </header>

        {/* ══ TABS ════════════════════════════════════════════ */}
        <div className="tab-nav-bar" style={{
          position: "sticky", top: 56, zIndex: 40,
          background: tabNavBg, backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)", transition: "background 0.25s",
        }}>
          <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 1.5rem", display: "flex", overflowX: "auto" }} className="scrollbar-hide">
            {S.tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id as TabId)}
                className={`tab-btn ${tab === t.id ? "active" : ""}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ══ CONTENIDO ═══════════════════════════════════════ */}
        <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "clamp(1.25rem, 4vw, 2.5rem) clamp(0.75rem, 4vw, 1.5rem) 5rem" }}>
          {loading ? (
            <LoadingState label={S.loading} />
          ) : (
            <AnimatePresence mode="wait">
              {tab === "envivo" && teams && predictions && groups && (
                <TabPane key="envivo">
                  <LiveTournament
                    teams={teams} predictions={predictions} groups={groups}
                    liveMatches={liveMatches} stats={liveStats} verdicts={verdicts}
                    bracket={bracket} timezone={geoTz} apiStandings={apiStandings}
                  />
                </TabPane>
              )}
              {tab === "predictor" && teams && predictions && (
                <TabPane key="predictor">
                  <Predictor teams={teams} predictions={predictions} matches={matches} liveMatches={liveMatches} />
                </TabPane>
              )}
              {tab === "grupos" && groupMatches && groupStandings && (
                <TabPane key="grupos">
                  <Groups groupMatches={groupMatches} groupStandings={groupStandings} liveScores={liveScores} />
                </TabPane>
              )}
              {tab === "proyecciones" && teams && predictions && groups && (
                <TabPane key="proyecciones">
                  <Projections
                    teams={teams} predictions={predictions} groups={groups}
                    fixedResults={fixedResults} liveScores={liveScores} bracket={bracket}
                    liveMatches={liveMatches}
                    byRoundLabel={S.projByRound} pathLabel={S.projPath} trendLabel={S.projTrend} simLabel={S.projSim}
                  />
                </TabPane>
              )}
              {tab === "curiosidades" && stats && (
                <TabPane key="curiosidades">
                  <FunFacts stats={stats} goalscorers={goalscorers} qatar={qatar} teams={teams ?? undefined} liveMatches={liveMatches} />
                </TabPane>
              )}
              {tab === "glosario" && (
                <TabPane key="glosario">
                  <Glossary verdicts={verdicts} />
                </TabPane>
              )}
            </AnimatePresence>
          )}
        </main>

        {/* ══ FOOTER ══════════════════════════════════════════ */}
        <footer>
          <div className="accent-bar" />
          <div style={{ background: footerBg, padding: "1.5rem", transition: "background 0.25s" }}>
            <div style={{
              maxWidth: "80rem", margin: "0 auto",
              display: "flex", alignItems: "center",
              justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem",
            }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: "0.85rem", letterSpacing: "0.12em", color: "var(--color-ink-muted)" }}>FIFA WORLD CUP</span>
                <span style={{ fontFamily: "var(--font-display)", fontSize: "0.85rem", letterSpacing: "0.12em", color: "var(--color-wc-red)" }}>2026</span>
                <span style={{ fontFamily: "var(--font-display)", fontSize: "0.85rem", letterSpacing: "0.12em", color: "var(--color-ink-muted)", opacity: 0.5 }}>PREDICTOR</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.58rem", letterSpacing: "0.1em", color: "var(--color-ink-muted)", textTransform: "uppercase" }}>
                  {S.footerBy}
                </span>
                <a href="https://luismiguelro.com" target="_blank" rel="noopener noreferrer" style={{
                  fontFamily: "var(--font-mono)", fontSize: "0.58rem", letterSpacing: "0.1em",
                  color: "var(--color-wc-gold)", textTransform: "uppercase",
                  textDecoration: "none", borderBottom: "1px solid rgba(212,168,67,0.35)",
                  paddingBottom: "1px", transition: "color 0.14s",
                }}>
                  luismiguelro.com
                </a>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.55rem", letterSpacing: "0.07em", color: "var(--color-ink-muted)", opacity: 0.5 }}>
                  · {S.footerNote}
                </span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </LangContext.Provider>
  );
}

/* ── Estado del torneo: countdown antes del kickoff, stats en vivo después ── */
const KICKOFF_UTC = Date.parse("2026-06-11T19:00:00Z"); // México vs Sudáfrica · Estadio Azteca · 13:00 CDMX

type ShellStrings = (typeof SHELL)[Lang];

function TournamentStatus({ S, stats, record, teams, championInfo, playedRange }: {
  S: ShellStrings;
  stats: LiveStats;
  record: { played: number; hits: number };
  teams: Record<string, TeamInfo> | null;
  /** null hasta que la FINAL real se juega — nunca se asume un campeón */
  championInfo: FinalSummary | null;
  /** primera/última fecha con partidos realmente jugados (no hardcodeado) */
  playedRange: { first: string; last: string } | null;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const T = useLang();
  const nextWc = useCountdown(WC2030_START_UTC);

  if (now === null) return null; // evita mismatch SSR/cliente

  const diff = KICKOFF_UTC - now;

  if (diff > 0) {
    const d = Math.floor(diff / 86_400_000);
    const h = Math.floor((diff % 86_400_000) / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const s = Math.floor((diff % 60_000) / 1_000);
    return (
      <span className="status-chip">
        {S.kickoffIn}
        <strong>{d}{S.daysSuffix} {pad2(h)}:{pad2(m)}:{pad2(s)}</strong>
      </span>
    );
  }

  /* Torneo en curso/terminado: chips con data real (openfootball/football-data,
     se actualiza al cerrar cada partido). El campeón solo aparece cuando el
     partido de la FINAL ya tiene marcador oficial. */
  const flag = (name: string) => teams?.[name]?.flag ?? "";
  const { last } = stats;
  const pct = record.played ? Math.round((record.hits / record.played) * 100) : 0;

  const fmtDay = (d: string) =>
    new Date(d + "T12:00:00Z").toLocaleDateString(T.locale, { day: "numeric", month: "short" });
  const rangeLabel = playedRange
    ? playedRange.first === playedRange.last
      ? fmtDay(playedRange.first)
      : `${fmtDay(playedRange.first)} – ${fmtDay(playedRange.last)}`
    : "";

  return (
    <>
      {championInfo ? (
        <span className="status-chip status-chip--gold badge-gold">
          🏆 {S.championChip}: <strong>{flag(championInfo.champion)} {championInfo.champion}</strong>
        </span>
      ) : (
        <span className="status-chip status-chip--live">
          <span className="live-dot" />
          {S.liveNow}
        </span>
      )}
      {championInfo && rangeLabel && (
        <span className="status-chip">
          {S.tournamentOver} · {rangeLabel}
        </span>
      )}
      {stats.played > 0 && (
        <span className="status-chip">
          <strong>{stats.played}</strong> {S.played} · <strong>{stats.goals}</strong> {S.goalsLabel} · <strong>{stats.avg.toFixed(1)}</strong>{S.perMatch}
        </span>
      )}
      {record.played > 0 && (
        <span className="status-chip status-chip--gold">
          {S.modelTag} <strong>{record.hits}/{record.played}</strong> {S.hitsLabel} ({pct}%)
        </span>
      )}
      {!championInfo && last && last.score1 !== null && last.score2 !== null && (
        <span className="status-chip">
          {S.lastLabel}: <strong>{flag(last.team1)} {last.team1} {last.score1}–{last.score2} {last.team2} {flag(last.team2)}</strong>
          {last.penalties && (
            <span style={{ color: "var(--wc-gold)", marginLeft: 4 }}>
              ({S.pens} {last.penalties.home}–{last.penalties.away})
            </span>
          )}
        </span>
      )}
      {championInfo && nextWc && (
        <span className="status-chip">
          {S.nextWcChip} <strong>{nextWc.days}{S.daysSuffix} {pad2(nextWc.hours)}:{pad2(nextWc.minutes)}:{pad2(nextWc.seconds)}</strong>
        </span>
      )}
    </>
  );
}

/* ── Proyecciones: Monte Carlo por ronda + evolución + simulador en una pestaña ── */
function Projections({ teams, predictions, groups, fixedResults, liveScores, bracket, liveMatches, byRoundLabel, pathLabel, trendLabel, simLabel }: {
  teams: Record<string, TeamInfo>;
  predictions: Record<string, Prediction>;
  groups: Record<string, string[]>;
  fixedResults: FixedResults;
  liveScores: ScoreMap;
  bracket: Bracket | null;
  liveMatches: LiveMatch[];
  byRoundLabel: string;
  pathLabel: string;
  trendLabel: string;
  simLabel: string;
}) {
  const [view, setView] = useState<"rondas" | "camino" | "evolucion" | "sim">("rondas");
  return (
    <div className="space-y-5">
      <div className="flex gap-1 bg-[var(--surface-2)] rounded-lg p-1 w-fit mx-auto flex-wrap justify-center">
        {([
          { key: "rondas"    as const, label: byRoundLabel },
          { key: "camino"    as const, label: pathLabel },
          { key: "evolucion" as const, label: trendLabel },
          { key: "sim"       as const, label: simLabel },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
              view === key ? "bg-[var(--wc-red)] text-white" : "text-[var(--text-muted)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {view === "rondas" ? (
        <Knockout teams={teams} predictions={predictions} groups={groups} bracket={bracket} fixedResults={fixedResults} liveScores={liveScores} liveMatches={liveMatches} />
      ) : view === "camino" ? (
        <ChampionPath teams={teams} predictions={predictions} groups={groups} bracket={bracket} fixedResults={fixedResults} liveScores={liveScores} liveMatches={liveMatches} />
      ) : view === "evolucion" ? (
        <ChampionTrend teams={teams} predictions={predictions} groups={groups} bracket={bracket} liveMatches={liveMatches} />
      ) : (
        <SimulatorTab teams={teams} predictions={predictions} groups={groups} fixedResults={fixedResults} liveScores={liveScores} bracket={bracket} />
      )}
    </div>
  );
}

/* ── Wrappers ─────────────────────────────────────────────── */
function TabPane({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", paddingTop: "5rem", paddingBottom: "5rem", gap: "1.25rem",
    }}>
      <div style={{ position: "relative", width: 40, height: 40 }}>
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
          style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            border: "2px solid transparent", borderTopColor: "var(--color-wc-red)",
            borderRightColor: "rgba(207,10,44,0.15)",
          }} />
        <div style={{ position: "absolute", inset: "6px", borderRadius: "50%", background: "var(--color-arena-card)" }} />
      </div>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--color-ink-muted)" }}>
        {label}
      </p>
      <div style={{ width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {[78, 58, 70, 48].map((w, i) => (
          <div key={i} className="shimmer-skeleton" style={{ height: 10, borderRadius: 3, width: `${w}%` }} />
        ))}
      </div>
    </motion.div>
  );
}
