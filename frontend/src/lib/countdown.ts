"use client";

import { useEffect, useState } from "react";

export interface CountdownParts {
  /** ms restantes; negativo si el objetivo ya pasó */
  total: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** Cuenta regresiva reactiva a un timestamp UTC (ms), tick cada segundo.
    Devuelve null en el primer render para evitar mismatch SSR/cliente. */
export function useCountdown(targetUtc: number): CountdownParts | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (now === null) return null;
  const total = targetUtc - now;
  const abs = Math.abs(total);
  return {
    total,
    days: Math.floor(abs / 86_400_000),
    hours: Math.floor((abs % 86_400_000) / 3_600_000),
    minutes: Math.floor((abs % 3_600_000) / 60_000),
    seconds: Math.floor((abs % 60_000) / 1_000),
  };
}

export const pad2 = (x: number) => String(x).padStart(2, "0");
