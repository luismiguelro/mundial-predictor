import { ImageResponse } from "next/og";
import type { GroupMatch, LiveMatch, Prediction, TeamInfo } from "@/types";
import { buildGroupProbIndex, buildVerdicts, normalizeName } from "@/lib/live";
import { applyScoreOverrides } from "@/lib/overrides";
import { buildPenRates } from "@/lib/simulator";
import { fetchWorldCupMatches } from "@/lib/fdApi";
import predictionsJson from "../../public/data/predictions.json";
import groupMatchesJson from "../../public/data/group_matches.json";
import teamsJson from "../../public/data/teams.json";

/**
 * Tarjeta social (Open Graph) con el récord EN VIVO del modelo: se genera en
 * el servidor con los mismos veredictos que muestra la web (lib/live.ts).
 * Sin token o con el upstream caído cae al backtest de Qatar 2022, así el
 * preview nunca queda vacío.
 */

export const dynamic = "force-dynamic";
export const alt = "Mundial Predictor 2026 — récord del modelo en vivo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Paleta del sitio (globals.css) — Satori no lee variables CSS
const BG = "#101624";        // arena-void
const CARD = "#1A2238";      // arena-card
const INK = "#EDF1FA";       // ink-primary
const INK2 = "#9DA8C4";      // ink-secondary
const GOLD = "#F5CC6A";      // wc-gold-bright
const GOLD_DIM = "#D4A843";  // wc-gold
const RED = "#CF0A2C";       // wc-red

interface Headline {
  hits: number;
  total: number;
  live: boolean;
}

async function computeRecord(): Promise<Headline> {
  const fallback: Headline = { hits: 34, total: 64, live: false }; // backtest Qatar 2022
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) return fallback;
  try {
    // revalidate 0 (no-store): el récord debe estar al día; los scrapers
    // sociales piden esta imagen con poca frecuencia, no compromete el rate.
    const raw = await fetchWorldCupMatches(token, 0);
    const matches: LiveMatch[] = applyScoreOverrides(
      raw.map((m) => ({
        team1: normalizeName(m.team1),
        team2: normalizeName(m.team2),
        score1: m.score1,
        score2: m.score2,
        group: m.group,
        round: m.round,
        date: m.utcDate ? new Date(m.utcDate).toLocaleDateString("en-CA") : undefined,
        utc: m.utcDate ?? undefined,
        status: m.status,
        winner: m.winner ? normalizeName(m.winner) : null,
        penalties: m.penalties,
        decidedBy: m.decidedBy,
      }))
    );
    const predictions = predictionsJson as unknown as Record<string, Prediction>;
    const groupMatches = groupMatchesJson as unknown as Record<string, GroupMatch[]>;
    const teams = teamsJson as unknown as Record<string, TeamInfo>;
    const verdicts = buildVerdicts(
      matches, predictions, buildGroupProbIndex(groupMatches), buildPenRates(teams)
    );
    if (verdicts.length === 0) return fallback;
    return {
      hits: verdicts.filter((v) => v.hit).length,
      total: verdicts.length,
      live: true,
    };
  } catch {
    return fallback;
  }
}

export default async function OgImage() {
  const { hits, total, live } = await computeRecord();
  const pct = Math.round((hits / total) * 100);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: BG,
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        {/* cabecera: marca + estado */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 44, fontWeight: 800, color: INK, letterSpacing: 2 }}>
              ⚽ MUNDIAL PREDICTOR 2026
            </div>
            <div style={{ display: "flex", fontSize: 24, color: INK2, marginTop: 6 }}>
              Dixon-Coles · ELO propio · Monte Carlo
            </div>
          </div>
          {live && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: CARD,
                border: `2px solid ${RED}`,
                borderRadius: 14,
                padding: "10px 22px",
              }}
            >
              <div style={{ display: "flex", width: 14, height: 14, borderRadius: 999, background: RED }} />
              <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color: INK, letterSpacing: 3 }}>
                EN VIVO
              </div>
            </div>
          )}
        </div>

        {/* hero: el récord del modelo */}
        <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 48 }}>
          <div style={{ display: "flex", width: 10, height: 260, background: GOLD_DIM, borderRadius: 5 }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: INK2, letterSpacing: 5 }}>
              {live ? "ACIERTOS DEL MODELO · MUNDIAL 2026" : "BACKTEST QATAR 2022 · 64 PARTIDOS"}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 28 }}>
              <div style={{ display: "flex", fontSize: 190, fontWeight: 800, color: GOLD, lineHeight: 1.1 }}>
                {pct}%
              </div>
              <div style={{ display: "flex", fontSize: 44, fontWeight: 700, color: INK }}>
                {hits}/{total}
              </div>
            </div>
            <div style={{ display: "flex", fontSize: 26, color: INK2 }}>
              {live
                ? "resultado más probable vs resultado real — grupos y eliminatorias"
                : "partidos nunca vistos por el modelo — validación temporal honesta"}
            </div>
          </div>
        </div>

        {/* pie: juego limpio + dominio de la web */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 22, color: INK2 }}>
            Pronósticos publicados antes del Mundial — el análisis avanza con cada partido
          </div>
          <div style={{ display: "flex", fontSize: 22, fontWeight: 700, color: GOLD_DIM }}>
            {process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "mundial-predictor"}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
