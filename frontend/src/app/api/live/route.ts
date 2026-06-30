import { NextResponse } from "next/server";

/**
 * Proxy a football-data.org (Mundial 2026) con caché de 60 segundos.
 * El token vive en el servidor (FOOTBALL_DATA_TOKEN) — nunca llega al navegador.
 * Sin token o con error upstream responde 5xx y el cliente cae al
 * fallback de openfootball (ver src/lib/live.ts).
 *
 * Consumo upstream: 1 llamada/min sin importar el tráfico (la caché sirve al
 * resto). El plan gratuito permite 10/min, así que queda holgado.
 */

const UPSTREAM = "https://api.football-data.org/v4/competitions/WC/matches";

interface FdTeam {
  name: string | null;
}

interface FdScoreLine { home: number | null; away: number | null }
interface FdMatch {
  id: number;     // nº de partido oficial (orden ascendente = fixture FIFA)
  status: string; // SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED | ...
  stage: string | null; // GROUP_STAGE | LAST_32 | LAST_16 | ...
  group: string | null; // "GROUP_A"
  utcDate: string | null;
  homeTeam: FdTeam | null;
  awayTeam: FdTeam | null;
  score: {
    /** REGULAR | EXTRA_TIME | PENALTY_SHOOTOUT */
    duration?: string | null;
    fullTime: FdScoreLine;
    /** desglose de un cruce que pasó de los 90': marcador reglamentario,
        prórroga y tanda de penales (solo en eliminatoria) */
    regularTime?: FdScoreLine | null;
    extraTime?: FdScoreLine | null;
    penalties?: FdScoreLine | null;
    /** HOME_TEAM | AWAY_TEAM | DRAW — refleja al ganador real, incluso por penales */
    winner?: string | null;
  } | null;
}

/** number|null seguro desde una línea de marcador que puede no venir. */
function line(s: FdScoreLine | null | undefined): { home: number | null; away: number | null } {
  return { home: s?.home ?? null, away: s?.away ?? null };
}

/** "GROUP_A" → "Group A" (formato que ya usa el resto de la app) */
function formatGroup(group: string | null): string | undefined {
  if (!group) return undefined;
  return group.startsWith("GROUP_") ? `Group ${group.slice(6)}` : group;
}

export async function GET() {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "FOOTBALL_DATA_TOKEN not set" }, { status: 503 });
  }

  const res = await fetch(UPSTREAM, {
    headers: { "X-Auth-Token": token },
    next: { revalidate: 60 }, // 1 llamada upstream cada 60 s, sin importar el tráfico
  });
  if (!res.ok) {
    return NextResponse.json({ error: `upstream ${res.status}` }, { status: 502 });
  }

  const data = await res.json();
  const matches = ((data?.matches ?? []) as FdMatch[]).map((m) => {
    // Solo se fijan marcadores FINALES de partidos TERMINADOS: la app trata
    // un score no-nulo como resultado final (veredictos, simulador).
    const finished = m.status === "FINISHED";
    const inPlay = m.status === "IN_PLAY" || m.status === "PAUSED";
    const home = m.homeTeam?.name ?? "";
    const away = m.awayTeam?.name ?? "";

    const sc = m.score;
    const duration = sc?.duration ?? null;
    const shootout = duration === "PENALTY_SHOOTOUT";
    const full = line(sc?.fullTime);
    const reg = line(sc?.regularTime);
    const extra = line(sc?.extraTime);
    const pen = line(sc?.penalties);

    // Marcador del JUEGO (90' + prórroga), SIN la tanda de penales: así las
    // estadísticas de goles y los veredictos no se contaminan con los penales.
    // Si fue a penales usamos reglamentario + prórroga; si no, el fullTime
    // (que en partidos sin tanda ya es el marcador real, prórroga incluida).
    const gameHome = shootout && reg.home !== null ? (reg.home ?? 0) + (extra.home ?? 0) : full.home;
    const gameAway = shootout && reg.away !== null ? (reg.away ?? 0) + (extra.away ?? 0) : full.away;

    // Marcador de la TANDA de penales. El campo `penalties` del feed a veces es
    // poco fiable (p. ej. 5–5), así que el marcador real lo derivamos del total
    // menos el juego: fullTime − (reglamentario + prórroga). Si esa resta no da
    // un marcador válido, caemos al campo `penalties` como respaldo.
    let penHome: number | null = null;
    let penAway: number | null = null;
    if (shootout) {
      if (full.home !== null && full.away !== null) {
        const dh = full.home - (gameHome ?? 0);
        const da = full.away - (gameAway ?? 0);
        if (dh >= 0 && da >= 0 && (dh > 0 || da > 0)) { penHome = dh; penAway = da; }
      }
      if ((penHome === null || penAway === null) && pen.home !== null && pen.away !== null) {
        penHome = pen.home; penAway = pen.away;
      }
    }
    const penalties = penHome !== null && penAway !== null ? { home: penHome, away: penAway } : null;

    // Ganador real del cruce (incluye penales). La API a veces lo deja null en
    // tandas; lo derivamos del marcador de la tanda y, si falta, del fullTime.
    const w = sc?.winner;
    let winner: string | null = null;
    if (finished) {
      if (w === "HOME_TEAM") winner = home;
      else if (w === "AWAY_TEAM") winner = away;
      else if (shootout) {
        if (penHome !== null && penAway !== null && penHome !== penAway) {
          winner = penHome > penAway ? home : away;
        } else if (full.home !== null && full.away !== null && full.home !== full.away) {
          winner = full.home > full.away ? home : away;
        }
      }
    }

    return {
      id: m.id,
      team1: home,
      team2: away,
      score1: finished ? gameHome : null,
      score2: finished ? gameAway : null,
      // marcador en curso, aparte: solo para la tarjeta "En juego"
      liveScore1: inPlay ? full.home : null,
      liveScore2: inPlay ? full.away : null,
      group: formatGroup(m.group),
      round: m.stage ?? undefined,
      utcDate: m.utcDate ?? null,
      status: m.status,
      winner,
      // desempate por penales (orientado team1=home / team2=away)
      penalties,
      decidedBy: finished ? duration : null,
    };
  });

  return NextResponse.json(
    { source: "football-data.org", matches },
    { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" } }
  );
}
