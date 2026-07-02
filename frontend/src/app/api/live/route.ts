import { NextResponse } from "next/server";
import { fetchWorldCupMatches } from "@/lib/fdApi";

/**
 * Proxy a football-data.org (Mundial 2026) con caché de 60 segundos.
 * El token vive en el servidor (FOOTBALL_DATA_TOKEN) — nunca llega al navegador.
 * Sin token o con error upstream responde 5xx y el cliente cae al
 * fallback de openfootball (ver src/lib/live.ts).
 *
 * Consumo upstream: 1 llamada/min sin importar el tráfico (la caché sirve al
 * resto). El plan gratuito permite 10/min, así que queda holgado.
 * El mapeo del feed vive en src/lib/fdApi.ts (compartido con la imagen OG).
 */

export async function GET() {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "FOOTBALL_DATA_TOKEN not set" }, { status: 503 });
  }

  let matches;
  try {
    matches = await fetchWorldCupMatches(token, 60);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "upstream error" },
      { status: 502 }
    );
  }

  return NextResponse.json(
    { source: "football-data.org", matches },
    { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" } }
  );
}
