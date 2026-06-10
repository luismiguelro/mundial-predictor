"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  TeamInfo, Prediction, HistoricalMatch, SiteStats,
  Goalscorer, GroupMatch, GroupStandingEntry, LiveMatch,
} from "@/types";
import { LangContext, type Lang } from "@/lib/i18n";
import { buildFixedResults, buildScoreMap, fetchLiveMatches } from "@/lib/live";
import Predictor    from "@/components/Predictor";
import SimulatorTab from "@/components/Simulator";
import FunFacts     from "@/components/FunFacts";
import Groups       from "@/components/Groups";
import Knockout     from "@/components/Knockout";
import Glossary     from "@/components/Glossary";

/* ─────────────────────────────────────────────────────────────
   UI DEL SHELL (hero, navbar, tabs, footer)
───────────────────────────────────────────────────────────── */
const SHELL = {
  es: {
    navLabel:   "Predictor ML",
    weAre26:    "WE ARE 26",
    eyebrow:    "Análisis con Machine Learning",
    subtitle:   "Predictor de resultados · XGBoost calibrado · ELO · Monte Carlo",
    chips:      [
      { icon: "🤖", label: "964 partidos de WC" },
      { icon: "📊", label: "48 selecciones" },
      { icon: "🏟", label: "12 grupos · 104 partidos" },
      { icon: "⭐", label: "ELO + H2H + Forma" },
    ],
    tabs:       [
      { id: "predictor",     label: "Predictor"     },
      { id: "grupos",        label: "Grupos"         },
      { id: "eliminatorias", label: "Eliminatorias"  },
      { id: "simulator",     label: "Simulador"      },
      { id: "curiosidades",  label: "Stats"          },
      { id: "glosario",      label: "Glosario"       },
    ],
    loading:    "Cargando datos del modelo…",
    footerBy:   "por",
    footerNote: "Modelo entrenado hasta Qatar 2022 · No afiliado a FIFA",
    themeLight: "☀ Claro",
    themeDark:  "◐ Oscuro",
    kickoffIn:  "El torneo arranca en",
    liveNow:    "Torneo en vivo",
    played:     "partidos jugados",
    daysSuffix: "d",
  },
  en: {
    navLabel:   "ML Predictor",
    weAre26:    "WE ARE 26",
    eyebrow:    "Machine Learning Analysis",
    subtitle:   "Match predictor · Calibrated XGBoost · ELO ratings · Monte Carlo",
    chips:      [
      { icon: "🤖", label: "964 WC matches" },
      { icon: "📊", label: "48 national teams" },
      { icon: "🏟", label: "12 groups · 104 matches" },
      { icon: "⭐", label: "ELO + H2H + Form" },
    ],
    tabs:       [
      { id: "predictor",     label: "Predictor"    },
      { id: "grupos",        label: "Groups"        },
      { id: "eliminatorias", label: "Knockout"      },
      { id: "simulator",     label: "Simulator"     },
      { id: "curiosidades",  label: "Stats"         },
      { id: "glosario",      label: "Glossary"      },
    ],
    loading:    "Loading model data…",
    footerBy:   "by",
    footerNote: "Model trained up to Qatar 2022 · Not affiliated with FIFA",
    themeLight: "☀ Light",
    themeDark:  "◐ Dark",
    kickoffIn:  "Tournament kicks off in",
    liveNow:    "Tournament live",
    played:     "matches played",
    daysSuffix: "d",
  },
  pt: {
    navLabel:   "Preditor ML",
    weAre26:    "WE ARE 26",
    eyebrow:    "Análise com Machine Learning",
    subtitle:   "Preditor de resultados · XGBoost calibrado · ELO · Monte Carlo",
    chips:      [
      { icon: "🤖", label: "964 jogos da Copa" },
      { icon: "📊", label: "48 seleções" },
      { icon: "🏟", label: "12 grupos · 104 jogos" },
      { icon: "⭐", label: "ELO + H2H + Forma" },
    ],
    tabs:       [
      { id: "predictor",     label: "Preditor"       },
      { id: "grupos",        label: "Grupos"          },
      { id: "eliminatorias", label: "Eliminatórias"   },
      { id: "simulator",     label: "Simulador"       },
      { id: "curiosidades",  label: "Stats"           },
      { id: "glosario",      label: "Glossário"       },
    ],
    loading:    "Carregando dados do modelo…",
    footerBy:   "por",
    footerNote: "Modelo treinado até o Qatar 2022 · Não afiliado à FIFA",
    themeLight: "☀ Claro",
    themeDark:  "◐ Escuro",
    kickoffIn:  "O torneio começa em",
    liveNow:    "Torneio ao vivo",
    played:     "jogos disputados",
    daysSuffix: "d",
  },
} as const;

/* ─────────────────────────────────────────────────────────────
   POOL GRANDE DE DATOS CURIOSOS — se mezclan aleatoriamente
───────────────────────────────────────────────────────────── */
const TICKER_POOL: Record<Lang, string[]> = {
  es: [
    "⚽  964 PARTIDOS MUNDIALISTAS ANALIZADOS  —  1930 A 2022",
    "📊  2.720 GOLES EN TOTAL  ·  PROMEDIO DE 2.82 GOLES POR PARTIDO",
    "🏆  22 EDICIONES DEL MUNDIAL ANALIZADAS",
    "🔥  PARTIDO CON MÁS GOLES: SUIZA 5-7 AUSTRIA  ·  1954  ·  12 GOLES",
    "💥  MAYOR SORPRESA: ARGENTINA 1-2 ARABIA SAUDÍ  ·  2022  ·  FAVORITO POR 342 ELO",
    "⚡  MAYOR GOLEADA: HUNGRÍA 9-0 COREA DEL SUR  ·  1954",
    "🌍  BRASIL  ·  114 PARTIDOS MUNDIALISTAS  ·  EL EQUIPO MÁS EXPERIMENTADO",
    "📈  ESPAÑA  ·  ELO 2064  ·  EL MÁS ALTO DEL TORNEO 2026",
    "🤖  XGBOOST CALIBRADO  ·  50% DE ACCURACY EN QATAR 2022  ·  BASELINE: 40%",
    "🏟  FIFA WORLD CUP 2026  ·  CANADÁ · MÉXICO · USA  ·  11 JUN — 19 JUL",
    "📉  LOS GOLES POR PARTIDO BAJARON DE 5.38 EN 1954 A 2.69 EN QATAR 2022",
    "🇩🇪  ALEMANIA + ALEMANIA OCCIDENTAL: 4 TÍTULOS MUNDIALES",
    "🇧🇷  BRASIL: ÚNICO PAÍS EN DISPUTAR LAS 22 EDICIONES DEL MUNDIAL",
    "🥅  PROMEDIO EN 1954: 5.38 GOLES/PARTIDO — EL RÉCORD HISTÓRICO",
    "💡  EL 47% DE LOS PARTIDOS DE MUNDIAL LOS GANA EL EQUIPO 'LOCAL' EN EL FIXTURE",
    "🎯  LOG-LOSS DEL MODELO EN QATAR 2022: 1.077  ·  MODELO BASE: 1.098",
    "🏅  TOP ELO PARA 2026: ESPAÑA 2064  ·  ARGENTINA 2051  ·  FRANCIA 2018",
    "📐  LA DIFERENCIA DE ELO ES LA FEATURE MÁS PREDICTIVA  ·  27% DE IMPORTANCIA",
    "🌎  2026: EL PRIMER MUNDIAL DE LA HISTORIA CON 48 EQUIPOS",
    "🔢  PRIMERA VEZ: 3 PAÍSES COORGANIZAN UNA COPA DEL MUNDO",
    "🎲  CON 5.000 SIMULACIONES MONTE CARLO  ·  ERROR < 0.7% POR EQUIPO",
    "📅  PRIMERA COPA CON PARTIDOS EN 3 PAÍSES SIMULTÁNEAMENTE",
    "🔬  EL MODELO USA 10 FEATURES: ELO  ·  H2H  ·  FORMA  ·  EXPERIENCIA WC",
    "🏴  ALEMANIA OCCIDENTAL GANA EL PRIMER MUNDIAL UNIFICADO: 1990  ·  ITALIA",
  ],
  en: [
    "⚽  964 WORLD CUP MATCHES ANALYZED  —  1930 TO 2022",
    "📊  2,720 TOTAL GOALS  ·  AVERAGE 2.82 GOALS PER MATCH",
    "🏆  22 WORLD CUP EDITIONS ANALYZED",
    "🔥  HIGHEST-SCORING MATCH: SWITZERLAND 5-7 AUSTRIA  ·  1954  ·  12 GOALS",
    "💥  BIGGEST UPSET: ARGENTINA 1-2 SAUDI ARABIA  ·  2022  ·  FAVORED BY 342 ELO",
    "⚡  BIGGEST VICTORY: HUNGARY 9-0 SOUTH KOREA  ·  1954",
    "🌍  BRAZIL  ·  114 WC MATCHES  ·  THE MOST EXPERIENCED TEAM",
    "📈  SPAIN  ·  ELO 2064  ·  HIGHEST IN THE 2026 TOURNAMENT",
    "🤖  CALIBRATED XGBOOST  ·  50% ACCURACY AT QATAR 2022  ·  BASELINE: 40%",
    "🏟  FIFA WORLD CUP 2026  ·  CANADA · MEXICO · USA  ·  JUN 11 — JUL 19",
    "📉  GOALS PER MATCH DROPPED FROM 5.38 IN 1954 TO 2.69 IN QATAR 2022",
    "🇩🇪  GERMANY + WEST GERMANY: 4 WORLD CUP TITLES",
    "🇧🇷  BRAZIL: THE ONLY NATION TO PLAY IN ALL 22 WORLD CUP EDITIONS",
    "🥅  1954 AVERAGE: 5.38 GOALS/MATCH — THE ALL-TIME RECORD",
    "💡  47% OF WC MATCHES ARE WON BY THE 'HOME' SIDE IN THE FIXTURE",
    "🎯  MODEL LOG-LOSS AT QATAR 2022: 1.077  ·  BASELINE: 1.098",
    "🏅  TOP ELO FOR 2026: SPAIN 2064  ·  ARGENTINA 2051  ·  FRANCE 2018",
    "📐  ELO DIFFERENCE IS THE MOST PREDICTIVE FEATURE  ·  27% IMPORTANCE",
    "🌎  2026: THE FIRST EVER 48-TEAM WORLD CUP IN HISTORY",
    "🔢  FIRST TIME EVER: 3 COUNTRIES CO-HOST THE WORLD CUP",
    "🎲  WITH 5,000 MONTE CARLO SIMULATIONS  ·  ERROR < 0.7% PER TEAM",
    "📅  FIRST CUP WITH MATCHES ACROSS 3 COUNTRIES SIMULTANEOUSLY",
    "🔬  THE MODEL USES 10 FEATURES: ELO  ·  H2H  ·  FORM  ·  WC EXPERIENCE",
    "🏴  WEST GERMANY WINS THE FIRST REUNIFIED WORLD CUP: 1990  ·  ITALY",
  ],
  pt: [
    "⚽  964 JOGOS MUNDIALISTAS ANALISADOS  —  1930 A 2022",
    "📊  2.720 GOLS NO TOTAL  ·  MÉDIA DE 2,82 GOLS POR JOGO",
    "🏆  22 EDIÇÕES DA COPA ANALISADAS",
    "🔥  JOGO MAIS GOLEADOR: SUÍÇA 5-7 ÁUSTRIA  ·  1954  ·  12 GOLS",
    "💥  MAIOR SURPRESA: ARGENTINA 1-2 ARÁBIA SAUDITA  ·  2022  ·  FAVORITO POR 342 ELO",
    "⚡  MAIOR GOLEADA: HUNGRIA 9-0 COREIA DO SUL  ·  1954",
    "🌍  BRASIL  ·  114 JOGOS MUNDIALISTAS  ·  O TIME MAIS EXPERIENTE",
    "📈  ESPANHA  ·  ELO 2064  ·  O MAIS ALTO DO TORNEIO 2026",
    "🤖  XGBOOST CALIBRADO  ·  50% DE ACERTO NO QATAR 2022  ·  BASELINE: 40%",
    "🏟  FIFA WORLD CUP 2026  ·  CANADÁ · MÉXICO · EUA  ·  11 JUN — 19 JUL",
    "📉  A MÉDIA DE GOLS CAIU DE 5,38 EM 1954 PARA 2,69 NO QATAR 2022",
    "🇩🇪  ALEMANHA + ALEMANHA OCIDENTAL: 4 TÍTULOS DE COPA DO MUNDO",
    "🇧🇷  BRASIL: ÚNICO PAÍS A DISPUTAR TODAS AS 22 EDIÇÕES DA COPA",
    "🥅  MÉDIA EM 1954: 5,38 GOLS/JOGO — O RECORDE HISTÓRICO",
    "💡  47% DOS JOGOS DA COPA SÃO VENCIDOS PELO TIME 'MANDANTE' NO CHAVEAMENTO",
    "🎯  LOG-LOSS DO MODELO NO QATAR 2022: 1,077  ·  BASELINE: 1,098",
    "🏅  TOP ELO PARA 2026: ESPANHA 2064  ·  ARGENTINA 2051  ·  FRANÇA 2018",
    "📐  DIFERENÇA DE ELO É O FATOR MAIS PREDITIVO  ·  27% DE IMPORTÂNCIA",
    "🌎  2026: A PRIMEIRA COPA DO MUNDO COM 48 TIMES NA HISTÓRIA",
    "🔢  PRIMEIRA VEZ: 3 PAÍSES CO-SEDIAM A COPA DO MUNDO",
    "🎲  COM 5.000 SIMULAÇÕES MONTE CARLO  ·  ERRO < 0,7% POR SELEÇÃO",
    "📅  PRIMEIRA COPA COM JOGOS EM 3 PAÍSES SIMULTANEAMENTE",
    "🔬  O MODELO USA 10 FATORES: ELO  ·  H2H  ·  FORMA  ·  EXPERIÊNCIA NA COPA",
    "🏴  ALEMANHA OCIDENTAL VENCE A PRIMEIRA COPA REUNIFICADA: 1990  ·  ITÁLIA",
  ],
};

/* Fisher-Yates shuffle */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Theme = "dark" | "light";
type TabId = "predictor" | "grupos" | "eliminatorias" | "simulator" | "curiosidades" | "glosario";

/* ─────────────────────────────────────────────────────────────
   PAGE
───────────────────────────────────────────────────────────── */
export default function Home() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [lang,  setLang]  = useState<Lang>("es");
  const [tab,   setTab]   = useState<TabId>("predictor");

  const [teams,          setTeams]          = useState<Record<string, TeamInfo> | null>(null);
  const [predictions,    setPredictions]    = useState<Record<string, Prediction> | null>(null);
  const [groups,         setGroups]         = useState<Record<string, string[]> | null>(null);
  const [matches,        setMatches]        = useState<HistoricalMatch[]>([]);
  const [stats,          setStats]          = useState<SiteStats | null>(null);
  const [goalscorers,    setGoalscorers]    = useState<Goalscorer[]>([]);
  const [groupMatches,   setGroupMatches]   = useState<Record<string, GroupMatch[]> | null>(null);
  const [groupStandings, setGroupStandings] = useState<Record<string, GroupStandingEntry[]> | null>(null);
  const [liveMatches,    setLiveMatches]    = useState<LiveMatch[]>([]);
  const [loading,        setLoading]        = useState(true);

  /* Resultados reales del torneo (openfootball) — no bloquea la carga inicial */
  useEffect(() => {
    fetchLiveMatches().then(setLiveMatches);
  }, []);

  const fixedResults = useMemo(() => buildFixedResults(liveMatches), [liveMatches]);
  const liveScores   = useMemo(() => buildScoreMap(liveMatches), [liveMatches]);

  /* Ticker: pool mezclado, se renueva al cambiar idioma */
  const [ticker, setTicker] = useState<string[]>([]);
  useEffect(() => {
    const picked = shuffle(TICKER_POOL[lang]).slice(0, 12);
    setTicker([...picked, ...picked]); /* duplicar para loop infinito */
  }, [lang]);

  /* Persistencia */
  useEffect(() => {
    const t = localStorage.getItem("wc-theme") as Theme | null;
    const l = localStorage.getItem("wc-lang")  as Lang  | null;
    if (t === "light" || t === "dark") setTheme(t);
    if (l === "es" || l === "en" || l === "pt") setLang(l);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("wc-theme", theme);
  }, [theme]);
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
    ]).then(([t, p, g, m, s, gs, gm, gst]) => {
      setTeams(t); setPredictions(p); setGroups(g); setMatches(m);
      setStats(s); setGoalscorers(gs); setGroupMatches(gm); setGroupStandings(gst);
      setLoading(false);
    });
  }, []);

  const S = SHELL[lang];
  const isLight  = theme === "light";
  const tabNavBg = isLight ? "rgba(245,245,243,0.96)" : "rgba(7,7,15,0.96)";
  const mainBg   = isLight ? "#F5F5F3" : "var(--color-arena-void)";
  const footerBg = isLight ? "#EBEBEA" : "var(--color-arena-deep)";

  return (
    /* Context provider: toda la app recibe el idioma activo */
    <LangContext.Provider value={lang}>
      <div style={{ background: mainBg, minHeight: "100dvh", transition: "background 0.25s" }}>

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
              {/* Tema — solo el ícono en móvil */}
              <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} style={{
                fontFamily: "var(--font-mono)", fontSize: "0.58rem", letterSpacing: "0.08em",
                padding: "0.28rem 0.5rem", border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: "3px", background: "transparent", color: "rgba(255,255,255,0.55)",
                cursor: "pointer", whiteSpace: "nowrap", minHeight: "32px",
              }}>
                <span className="hidden sm:inline">{theme === "dark" ? S.themeLight : S.themeDark}</span>
                <span className="sm:hidden">{theme === "dark" ? "☀" : "◐"}</span>
              </button>
              {/* WE ARE 26 */}
              <div className="hidden md:flex" style={{ alignItems: "center", gap: "0.4rem" }}>
                <span style={{ fontSize: "0.85rem" }}>🇨🇦🇲🇽🇺🇸</span>
                <span style={{ fontFamily: "var(--font-display)", fontSize: "0.75rem", letterSpacing: "0.18em", color: "rgba(255,255,255,0.45)" }}>
                  {S.weAre26}
                </span>
              </div>
            </div>
          </div>
        </nav>

        {/* ══ HERO ════════════════════════════════════════════ */}
        <header className="hero-brand">
          <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
            <div style={{
              position: "absolute", bottom: "-0.12em", right: "-0.04em",
              fontFamily: "var(--font-display)", fontSize: "clamp(9rem, 26vw, 20rem)",
              color: "rgba(207,10,44,0.042)", lineHeight: 1, userSelect: "none",
              whiteSpace: "nowrap", letterSpacing: "-0.02em",
            }}>2026</div>
            <div style={{
              position: "absolute", right: 0, top: 0, bottom: 0, width: "35%",
              background: "linear-gradient(100deg, transparent 0%, rgba(28,63,148,0.04) 100%)",
            }} />
          </div>

          <div style={{
            position: "relative", maxWidth: "80rem", margin: "0 auto",
            padding: "clamp(2.5rem, 5vw, 4rem) 1.5rem clamp(2rem, 4vw, 3rem)",
          }}>
            {/* Eyebrow + estado del torneo */}
            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45 }}
              style={{ display: "flex", alignItems: "center", gap: "0.55rem", marginBottom: "1.1rem", flexWrap: "wrap" }}>
              <div style={{ width: 24, height: 3, background: "var(--color-wc-red)", flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", letterSpacing: "0.22em", color: "var(--color-wc-gold)", textTransform: "uppercase" }}>
                {S.eyebrow}
              </span>
              <TournamentStatus
                kickoffIn={S.kickoffIn} liveNow={S.liveNow}
                played={S.played} daysSuffix={S.daysSuffix}
                playedCount={fixedResults.size}
              />
            </motion.div>

            {/* H1 */}
            <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.07, ease: [0.22, 1, 0.36, 1] }}
              style={{ margin: 0, lineHeight: 0.88, letterSpacing: "-0.015em" }}>
              <span style={{ display: "block", fontFamily: "var(--font-display)", fontSize: "clamp(3.8rem, 11vw, 8.5rem)", color: "#FFFFFF" }}>MUNDIAL</span>
              <span style={{ display: "block", fontFamily: "var(--font-display)", fontSize: "clamp(3.8rem, 11vw, 8.5rem)", color: "var(--color-wc-red)" }}>2026</span>
            </motion.h1>

            {/* Subtítulo */}
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.45, delay: 0.2 }}
              style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: "clamp(0.85rem, 1.8vw, 1.1rem)", letterSpacing: "0.05em", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", margin: "1rem 0 0" }}>
              {S.subtitle}
            </motion.p>

            {/* Chips */}
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }}
              className="hero-chips">
              {S.chips.map(({ icon, label }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span style={{ fontSize: "0.78rem" }}>{icon}</span>
                  <span className="hero-chip-text">{label}</span>
                </div>
              ))}
            </motion.div>
          </div>

          <div className="accent-bar" />
        </header>

        {/* ══ TICKER — pool aleatorio ══════════════════════════ */}
        <div style={{ background: "var(--color-wc-red)", overflow: "hidden", height: "32px", display: "flex", alignItems: "center" }}>
          {ticker.length > 0 && (
            <div className="ticker-track">
              {ticker.map((item, i) => (
                <span key={i} style={{
                  fontFamily: "var(--font-mono)", fontSize: "0.6rem", letterSpacing: "0.12em",
                  color: "rgba(255,255,255,0.9)", textTransform: "uppercase",
                  whiteSpace: "nowrap", padding: "0 3rem",
                }}>
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>

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
              {tab === "predictor" && teams && predictions && (
                <TabPane key="predictor">
                  <Predictor teams={teams} predictions={predictions} matches={matches} />
                </TabPane>
              )}
              {tab === "grupos" && groupMatches && groupStandings && (
                <TabPane key="grupos">
                  <Groups groupMatches={groupMatches} groupStandings={groupStandings} liveScores={liveScores} />
                </TabPane>
              )}
              {tab === "eliminatorias" && teams && predictions && groups && (
                <TabPane key="eliminatorias">
                  <Knockout teams={teams} predictions={predictions} groups={groups} />
                </TabPane>
              )}
              {tab === "simulator" && teams && predictions && groups && (
                <TabPane key="simulator">
                  <SimulatorTab teams={teams} predictions={predictions} groups={groups} fixedResults={fixedResults} />
                </TabPane>
              )}
              {tab === "curiosidades" && stats && (
                <TabPane key="curiosidades">
                  <FunFacts stats={stats} goalscorers={goalscorers} />
                </TabPane>
              )}
              {tab === "glosario" && (
                <TabPane key="glosario">
                  <Glossary />
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

/* ── Estado del torneo: countdown antes del 11/06, badge EN VIVO después ── */
const KICKOFF_UTC = Date.parse("2026-06-12T01:00:00Z"); // México vs ? · Estadio Azteca · 19:00 CDMX

function TournamentStatus({ kickoffIn, liveNow, played, daysSuffix, playedCount }: {
  kickoffIn: string; liveNow: string; played: string; daysSuffix: string; playedCount: number;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (now === null) return null; // evita mismatch SSR/cliente

  const diff = KICKOFF_UTC - now;
  const isLive = diff <= 0;

  const chipStyle: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: "0.45rem",
    padding: "0.3rem 0.7rem", borderRadius: "3px",
    fontFamily: "var(--font-mono)", fontSize: "0.6rem",
    letterSpacing: "0.14em", textTransform: "uppercase",
  };

  if (isLive) {
    return (
      <span style={{ ...chipStyle, background: "rgba(207,10,44,0.12)", border: "1px solid rgba(207,10,44,0.45)", color: "#FF6B82" }}>
        <span className="live-dot" />
        {liveNow}{playedCount > 0 ? ` · ${playedCount} ${played}` : ""}
      </span>
    );
  }

  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  const pad = (x: number) => String(x).padStart(2, "0");

  return (
    <span style={{ ...chipStyle, background: "rgba(212,168,67,0.08)", border: "1px solid rgba(212,168,67,0.35)", color: "var(--color-wc-gold-bright)" }}>
      ⏳ {kickoffIn}
      <span style={{ fontWeight: 700, color: "#fff", letterSpacing: "0.08em" }}>
        {d}{daysSuffix} {pad(h)}:{pad(m)}:{pad(s)}
      </span>
    </span>
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
