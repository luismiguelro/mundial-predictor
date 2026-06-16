"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Lang } from "@/lib/i18n";
import {
  CHANGELOG, CHANGELOG_LATEST, CHANGELOG_STR, type ChangeTag,
} from "@/lib/changelog";

const SEEN_KEY = "wc-changelog-seen";

const TAG_COLOR: Record<ChangeTag, { fg: string; bg: string; bd: string }> = {
  new:     { fg: "var(--color-wc-gold)",  bg: "rgba(212,168,67,0.10)", bd: "rgba(212,168,67,0.4)" },
  improve: { fg: "var(--color-wc-cyan)",  bg: "rgba(0,229,255,0.08)",  bd: "rgba(0,229,255,0.35)" },
  fix:     { fg: "var(--color-wc-red)",   bg: "rgba(207,10,44,0.08)",  bd: "rgba(207,10,44,0.4)" },
};

export default function Changelog({ lang }: { lang: Lang }) {
  const S = CHANGELOG_STR[lang];
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  /* ¿hay novedades sin ver? Comparamos el id más reciente con lo guardado. */
  useEffect(() => {
    const seen = localStorage.getItem(SEEN_KEY);
    setUnseen(seen !== CHANGELOG_LATEST);
  }, []);

  /* Al abrir, marcamos como visto y apagamos el punto. */
  function toggle() {
    setOpen((o) => {
      const next = !o;
      if (next && unseen) {
        localStorage.setItem(SEEN_KEY, CHANGELOG_LATEST);
        setUnseen(false);
      }
      return next;
    });
  }

  /* Cerrar al hacer clic fuera o con Escape. */
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const fmtDate = (iso: string) =>
    new Date(iso + "T12:00:00").toLocaleDateString(
      lang === "es" ? "es-CO" : lang === "pt" ? "pt-BR" : "en-US",
      { day: "numeric", month: "short" }
    );

  return (
    <div ref={ref} style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        onClick={toggle}
        aria-label={S.bell}
        title={S.bell}
        style={{
          position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
          width: 34, height: 34, borderRadius: 6, cursor: "pointer",
          border: "1px solid rgba(255,255,255,0.12)",
          background: open ? "var(--color-arena-elevated)" : "transparent",
          color: open ? "#fff" : "rgba(255,255,255,0.7)",
          transition: "background 0.14s, color 0.14s",
        }}
      >
        {/* campanita */}
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {/* punto de no leído */}
        {unseen && (
          <motion.span
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            style={{
              position: "absolute", top: 5, right: 6, width: 8, height: 8,
              borderRadius: "50%", background: "var(--color-wc-red)",
              boxShadow: "0 0 0 2px rgba(13,18,32,0.95)",
            }}
          />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "absolute", top: "calc(100% + 10px)", right: 0,
              width: "min(92vw, 23rem)", maxHeight: "min(70vh, 32rem)", overflowY: "auto",
              background: "var(--color-arena-card)",
              border: "1px solid rgba(207,10,44,0.25)", borderRadius: 10,
              boxShadow: "0 18px 50px rgba(0,0,0,0.5)", zIndex: 200,
            }}
            className="scrollbar-hide"
          >
            {/* cabecera del panel */}
            <div style={{
              position: "sticky", top: 0, zIndex: 1,
              padding: "0.85rem 1rem 0.7rem",
              background: "var(--color-arena-card)",
              borderBottom: "1px solid var(--color-arena-elevated)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ width: 18, height: 3, background: "var(--color-wc-red)", flexShrink: 0 }} />
                <span style={{
                  fontFamily: "var(--font-display)", fontSize: "1rem", letterSpacing: "0.06em",
                  color: "var(--color-ink-primary)", textTransform: "uppercase",
                }}>
                  {S.title}
                </span>
              </div>
              <p style={{
                margin: "0.3rem 0 0", fontFamily: "var(--font-mono)", fontSize: "0.58rem",
                letterSpacing: "0.08em", color: "var(--color-ink-muted)", textTransform: "uppercase",
              }}>
                {S.subtitle}
              </p>
            </div>

            {/* entradas */}
            <div style={{ padding: "0.5rem 1rem 1rem" }}>
              {CHANGELOG.map((entry, i) => {
                const c = TAG_COLOR[entry.tag];
                return (
                  <div key={entry.id} style={{
                    paddingTop: i === 0 ? "0.6rem" : "0.9rem",
                    paddingBottom: "0.3rem",
                    borderTop: i === 0 ? "none" : "1px solid var(--color-arena-elevated)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.45rem", flexWrap: "wrap" }}>
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: "0.5rem", fontWeight: 700,
                        letterSpacing: "0.1em", textTransform: "uppercase",
                        padding: "0.15rem 0.4rem", borderRadius: 3,
                        color: c.fg, background: c.bg, border: `1px solid ${c.bd}`,
                      }}>
                        {S.tags[entry.tag]}
                      </span>
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: "0.55rem", letterSpacing: "0.08em",
                        color: "var(--color-ink-muted)", textTransform: "uppercase",
                      }}>
                        {fmtDate(entry.date)}
                      </span>
                    </div>
                    <p style={{
                      margin: "0 0 0.5rem", fontFamily: "var(--font-body)", fontSize: "0.85rem",
                      fontWeight: 700, color: "var(--color-ink-primary)", lineHeight: 1.3,
                    }}>
                      {entry.title[lang]}
                    </p>
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      {entry.items[lang].map((it, k) => (
                        <li key={k} style={{
                          display: "flex", gap: "0.45rem",
                          fontFamily: "var(--font-body)", fontSize: "0.78rem",
                          lineHeight: 1.45, color: "var(--color-ink-secondary)",
                        }}>
                          <span style={{ color: c.fg, flexShrink: 0 }}>›</span>
                          <span>{it}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
