import { NextRequest, NextResponse } from "next/server";

/**
 * Zona horaria del visitante según su IP (geolocalización de Vercel).
 * Vercel inyecta `x-vercel-ip-timezone` (ej. "America/Bogota") en el edge,
 * sin API key ni servicio externo. Sigue la IP, así que respeta la VPN.
 *
 * En local (sin ese header) devuelve timezone: null → el cliente cae a la
 * zona horaria del sistema operativo.
 *
 * No se cachea: depende de cada visitante.
 */
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const timezone = req.headers.get("x-vercel-ip-timezone");
  const country = req.headers.get("x-vercel-ip-country");
  return NextResponse.json(
    { timezone, country },
    { headers: { "Cache-Control": "no-store" } }
  );
}
