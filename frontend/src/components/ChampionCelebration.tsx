"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { LiveMatch, TeamInfo } from "@/types";
import type { Lang } from "@/lib/i18n";
import { CHAMPION_FACTS, type FinalSummary } from "@/lib/championData";
import ChampionSpotlight from "@/components/ChampionSpotlight";

interface Props {
  final: FinalSummary;
  liveMatches: LiveMatch[];
  teams: Record<string, TeamInfo>;
  lang: Lang;
}

const COPY: Record<Lang, { title: string; extra: string; pens: string; scroll: string; close: string }> = {
  es: { title: "¡CAMPEONES DEL MUNDO!", extra: "prórroga", pens: "penales", scroll: "Desliza para ver el camino al título ↓", close: "Cerrar" },
  en: { title: "WORLD CHAMPIONS!",       extra: "extra time", pens: "penalties", scroll: "Scroll to see the road to the title ↓", close: "Close" },
  pt: { title: "CAMPEÕES DO MUNDO!",     extra: "prorrogação", pens: "pênaltis", scroll: "Deslize para ver o caminho até o título ↓", close: "Fechar" },
};

/* ── Efecto de apertura: se muestra apenas carga la página cuando los datos
   reales confirman un campeón (partido FINAL ya jugado). No asume ningún
   equipo — lee el ganador de championData.findFinal/summarizeFinal, igual
   que el resto del sitio lee el torneo en vivo. Queda abierto (no se
   autocierra) para que se pueda leer el camino al título debajo; se cierra
   con la ✕, clic fuera de la tarjeta o Escape. ── */
export default function ChampionCelebration({ final, liveMatches, teams, lang }: Props) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const confetti = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        duration: 3.2 + Math.random() * 2.2,
        drift: (Math.random() - 0.5) * 70,
        size: 5 + Math.random() * 7,
        gold: i % 2 === 0,
        rotate: 180 + Math.random() * 360,
      })),
    []
  );

  const flag = teams[final.champion]?.flag ?? "🏆";
  const t = COPY[lang];
  const fact = CHAMPION_FACTS[final.champion]?.[0]?.text[lang];

  const decidedNote =
    final.decidedBy === "EXTRA_TIME" ? ` · ${t.extra}`
    : final.decidedBy === "PENALTY_SHOOTOUT" ? ` · ${t.pens} ${final.penalties?.champion ?? ""}–${final.penalties?.runnerUp ?? ""}`
    : "";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={t.title}
          onClick={() => setOpen(false)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          style={{
            position: "fixed", inset: 0, zIndex: 300,
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            overflowY: "auto",
            background: "radial-gradient(circle at 50% 0%, rgba(139,0,25,0.94) 0%, rgba(16,22,36,0.98) 62%)",
            backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
            padding: "clamp(1rem, 4vw, 3rem) 1rem",
          }}
        >
          {/* confeti — decorativo, detrás de la tarjeta */}
          <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
            {confetti.map((c) => (
              <motion.span
                key={c.id}
                initial={{ y: "-12vh", x: 0, opacity: 0, rotate: 0 }}
                animate={{ y: "112vh", x: c.drift, opacity: [0, 1, 1, 0], rotate: c.rotate }}
                transition={{ delay: c.delay, duration: c.duration, ease: "linear", repeat: Infinity }}
                style={{
                  position: "absolute", top: 0, left: `${c.left}%`,
                  width: c.size, height: c.size * 0.4, borderRadius: 2,
                  background: c.gold ? "var(--color-wc-gold-bright)" : "var(--color-wc-red)",
                }}
              />
            ))}
          </div>

          {/* tarjeta: clic dentro NO cierra el modal */}
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.9, opacity: 0, y: 22 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "relative", width: "100%", maxWidth: 560,
              background: "var(--color-arena-void)",
              border: "1px solid rgba(212,168,67,0.3)",
              borderRadius: 16,
              boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
              padding: "clamp(1.5rem, 4vw, 2.25rem)",
            }}
          >
            {/* cerrar */}
            <button
              onClick={() => setOpen(false)}
              aria-label={t.close}
              style={{
                position: "absolute", top: 14, right: 14, width: 32, height: 32,
                borderRadius: "50%", border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)",
                fontSize: "1rem", lineHeight: 1, cursor: "pointer",
              }}
            >
              ✕
            </button>

            {/* ── cabecera de celebración ── */}
            <div style={{ textAlign: "center" }}>
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
                style={{
                  fontSize: "1.4rem", letterSpacing: "0.4em", marginBottom: "0.5rem",
                  color: "var(--color-wc-gold-bright)", textShadow: "0 0 18px rgba(245,204,106,0.7)",
                }}
              >
                ★ ★
              </motion.div>

              <motion.div
                animate={{
                  boxShadow: [
                    "0 0 22px rgba(212,168,67,0.35)",
                    "0 0 46px rgba(212,168,67,0.65)",
                    "0 0 22px rgba(212,168,67,0.35)",
                  ],
                }}
                transition={{ duration: 2.2, repeat: Infinity }}
                style={{
                  width: 96, height: 96, margin: "0 auto 1rem",
                  borderRadius: "22% 22% 46% 46% / 18% 18% 42% 42%",
                  background: "linear-gradient(160deg, var(--color-arena-elevated), var(--color-arena-card))",
                  border: "2px solid var(--color-wc-gold)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "2.6rem",
                }}
              >
                {flag}
              </motion.div>

              <h2
                className="text-gradient-gold"
                style={{
                  fontFamily: "var(--font-display)", fontSize: "clamp(2.1rem, 8vw, 3.2rem)",
                  letterSpacing: "0.03em", lineHeight: 1, margin: 0,
                }}
              >
                {t.title}
              </h2>

              <p style={{
                fontFamily: "var(--font-mono)", fontSize: "0.9rem", letterSpacing: "0.06em",
                color: "#fff", marginTop: "0.85rem",
              }}>
                {final.champion}{" "}
                <strong style={{ color: "var(--color-wc-gold-bright)", fontSize: "1.1rem" }}>
                  {final.score1}–{final.score2}
                </strong>{" "}
                {final.runnerUp}
                <span style={{ color: "rgba(255,255,255,0.55)" }}>{decidedNote}</span>
              </p>

              {fact && (
                <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.75)", marginTop: "0.6rem", lineHeight: 1.5 }}>
                  {fact}
                </p>
              )}

              <p style={{
                marginTop: "1.1rem", fontFamily: "var(--font-mono)", fontSize: "0.56rem",
                letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)",
              }}>
                {t.scroll}
              </p>
            </div>

            <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(212,168,67,0.35), transparent)", margin: "1.5rem 0" }} />

            {/* ── camino al título, premios, datos curiosos y cuenta regresiva ── */}
            <ChampionSpotlight liveMatches={liveMatches} teams={teams} hideHero />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
