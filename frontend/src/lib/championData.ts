import type { LiveMatch } from "@/types";
import type { Lang } from "@/lib/i18n";

/* ─────────────────────────────────────────────────────────────
   MUNDIAL 2026 — CAMPEÓN
   El campeón NUNCA se hardcodea: se lee del partido de la FINAL en los
   datos reales (football-data / openfootball), igual que el resto del
   torneo en vivo. Solo el contenido editorial (datos curiosos, premios)
   es texto fijo, porque no viene en el feed — se activa por equipo.
───────────────────────────────────────────────────────────── */

export interface FinalSummary {
  champion: string;
  runnerUp: string;
  score1: number; // orientado a champion
  score2: number; // orientado a runnerUp
  decidedBy: string | null; // REGULAR | EXTRA_TIME | PENALTY_SHOOTOUT
  penalties?: { champion: number; runnerUp: number } | null;
  date?: string;
}

/** Partido de la FINAL ya jugado, o null si el torneo no ha terminado. */
export function findFinal(liveMatches: LiveMatch[]): LiveMatch | null {
  return (
    liveMatches.find(
      (m) => m.round === "FINAL" && m.score1 !== null && m.score2 !== null
    ) ?? null
  );
}

export function summarizeFinal(final: LiveMatch): FinalSummary {
  const s1 = final.score1 as number;
  const s2 = final.score2 as number;
  const winnerIsTeam1 = final.winner ? final.winner === final.team1 : s1 >= s2;
  const champion = winnerIsTeam1 ? final.team1 : final.team2;
  const runnerUp = winnerIsTeam1 ? final.team2 : final.team1;
  const penalties = final.penalties
    ? {
        champion: winnerIsTeam1 ? final.penalties.home : final.penalties.away,
        runnerUp: winnerIsTeam1 ? final.penalties.away : final.penalties.home,
      }
    : null;
  return {
    champion,
    runnerUp,
    score1: winnerIsTeam1 ? s1 : s2,
    score2: winnerIsTeam1 ? s2 : s1,
    decidedBy: final.decidedBy ?? null,
    penalties,
    date: final.date,
  };
}

/** Rango de fechas del torneo, leído de los partidos realmente jugados
    (no hardcodeado): primera y última fecha con marcador oficial. */
export function tournamentDateRange(liveMatches: LiveMatch[]): { first: string; last: string } | null {
  const dates = liveMatches
    .filter((m) => m.score1 !== null && m.score2 !== null && m.date)
    .map((m) => m.date as string)
    .sort();
  if (dates.length === 0) return null;
  return { first: dates[0], last: dates[dates.length - 1] };
}

/* ── Camino de un equipo hacia el título ── */

export type RoadOutcome = "W" | "D" | "L";

export interface RoadStop {
  group?: string;   // "Group H" tal cual viene del feed
  round?: string;   // LAST_32 | LAST_16 | QUARTER_FINALS | SEMI_FINALS | THIRD_PLACE | FINAL
  opponent: string;
  myScore: number;
  theirScore: number;
  penalties?: { mine: number; theirs: number };
  date?: string;
  outcome: RoadOutcome;
}

/** Partidos reales de un equipo, en orden cronológico (grupos + eliminatoria). */
export function buildRoad(liveMatches: LiveMatch[], team: string): RoadStop[] {
  return liveMatches
    .filter((m) => (m.team1 === team || m.team2 === team) && m.score1 !== null && m.score2 !== null)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
    .map((m) => {
      const mine = m.team1 === team;
      const myScore = (mine ? m.score1 : m.score2) as number;
      const theirScore = (mine ? m.score2 : m.score1) as number;
      const opponent = mine ? m.team2 : m.team1;
      let outcome: RoadOutcome =
        myScore > theirScore ? "W" : myScore < theirScore ? "L" : "D";
      // en eliminatoria un empate se resuelve por penales/prórroga: manda m.winner
      if (m.winner) outcome = m.winner === team ? "W" : "L";
      const penalties = m.penalties
        ? { mine: mine ? m.penalties.home : m.penalties.away, theirs: mine ? m.penalties.away : m.penalties.home }
        : undefined;
      return { group: m.group, round: m.round, opponent, myScore, theirScore, penalties, date: m.date, outcome };
    });
}

/* ── Premios individuales del Mundial 2026 ──
   No están en el feed de resultados (football-data no expone galardones),
   así que se listan como contenido editorial fijo, verificado tras la final. */
export interface AwardWinner {
  icon: string;
  award: Record<Lang, string>;
  player: string;
  team: string; // nombre del dataset, para la bandera
  detail: Record<Lang, string>;
}

export const TOURNAMENT_AWARDS: AwardWinner[] = [
  {
    icon: "🎖️",
    award: { es: "Balón de Oro", en: "Golden Ball", pt: "Bola de Ouro" },
    player: "Rodri",
    team: "Spain",
    detail: {
      es: "Mejor jugador del torneo · +650 pases completados",
      en: "Tournament's best player · 650+ completed passes",
      pt: "Melhor jogador do torneio · +650 passes completos",
    },
  },
  {
    icon: "⚽",
    award: { es: "Bota de Oro", en: "Golden Boot", pt: "Chuteira de Ouro" },
    player: "Kylian Mbappé",
    team: "France",
    detail: {
      es: "10 goles · máximo goleador histórico del Mundial (22 en total)",
      en: "10 goals · World Cup's all-time top scorer (22 total)",
      pt: "10 gols · maior artilheiro histórico da Copa (22 no total)",
    },
  },
  {
    icon: "🧤",
    award: { es: "Guante de Oro", en: "Golden Glove", pt: "Luva de Ouro" },
    player: "Unai Simón",
    team: "Spain",
    detail: {
      es: "7 vallas invictas en el camino al título",
      en: "7 clean sheets on the road to the title",
      pt: "7 jogos sem sofrer gol no caminho para o título",
    },
  },
  {
    icon: "🌟",
    award: { es: "Mejor Jugador Joven", en: "Best Young Player", pt: "Melhor Jovem Jogador" },
    player: "Pau Cubarsí",
    team: "Spain",
    detail: { es: "19 años", en: "19 years old", pt: "19 anos" },
  },
];

/* ── Datos curiosos por campeón ── */
export interface ChampionFact {
  icon: string;
  text: Record<Lang, string>;
}

export const CHAMPION_FACTS: Record<string, ChampionFact[]> = {
  Spain: [
    {
      icon: "⭐⭐",
      text: {
        es: "Segunda estrella: España es bicampeona del mundo — 2010 y 2026.",
        en: "Second star: Spain are two-time world champions — 2010 and 2026.",
        pt: "Segunda estrela: a Espanha é bicampeã mundial — 2010 e 2026.",
      },
    },
    {
      icon: "🥅",
      text: {
        es: "Defensa histórica: un solo gol encajado en todo el torneo, récord para una campeona del mundo.",
        en: "Historic defence: only one goal conceded in the whole tournament — a record for a World Cup winner.",
        pt: "Defesa histórica: apenas um gol sofrido em todo o torneio, recorde para uma campeã mundial.",
      },
    },
    {
      icon: "⏱️",
      text: {
        es: "El título llegó en la prórroga: gol de Ferran Torres en el minuto 105 para el 1–0 ante Argentina.",
        en: "The title arrived in extra time: Ferran Torres scored in the 105th minute for the 1–0 win over Argentina.",
        pt: "O título veio na prorrogação: gol de Ferran Torres aos 105 minutos para o 1–0 sobre a Argentina.",
      },
    },
    {
      icon: "🏟️",
      text: {
        es: "Balance perfecto: 7 partidos, 6 victorias y 1 empate — invicta hasta el título.",
        en: "A flawless run: 7 matches, 6 wins and 1 draw — unbeaten all the way to the title.",
        pt: "Um percurso perfeito: 7 jogos, 6 vitórias e 1 empate — invicta até o título.",
      },
    },
    {
      icon: "🇫🇷",
      text: {
        es: "En semifinales dejó en el camino a Francia con un contundente 2–0.",
        en: "In the semi-final, Spain saw off France with a commanding 2–0.",
        pt: "Na semifinal, deixou a França pelo caminho com um contundente 2–0.",
      },
    },
    {
      icon: "🇵🇹",
      text: {
        es: "En octavos eliminó a Portugal con un solo gol, de Mikel Merino.",
        en: "In the round of 16, Spain eliminated Portugal with a single Mikel Merino goal.",
        pt: "Nas oitavas, eliminou Portugal com um único gol, de Mikel Merino.",
      },
    },
  ],
};

/* ── Próximo Mundial: 2030 (España · Portugal · Marruecos) ──
   Partido inaugural del centenario en Montevideo (8 jun 2030); las sedes
   principales abren el 13-14 de junio; final el 21 de julio de 2030. */
export const WC2030_START_UTC = Date.parse("2030-06-08T00:00:00Z");
export const WC2030_HOSTS = ["🇪🇸", "🇵🇹", "🇲🇦"];
export const WC2030_CENTENARY_HOSTS = ["🇺🇾", "🇦🇷", "🇵🇾"];
