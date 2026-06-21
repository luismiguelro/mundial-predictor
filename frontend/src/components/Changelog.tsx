"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Lang } from "@/lib/i18n";
import {
  CHANGELOG, CHANGELOG_LATEST, CHANGELOG_STR, FEEDBACK_URL, type ChangeTag,
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

  /* Sugerencias: mini-formulario que envía a Formspree vía fetch (AJAX). */
  const [msg, setMsg] = useState("");
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function sendSuggestion(e: React.FormEvent) {
    e.preventDefault();
    const text = msg.trim();
    if (!text || sendState === "sending") return;
    setSendState("sending");
    try {
      const res = await fetch(FEEDBACK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setMsg("");
      setSendState("sent");
    } catch {
      setSendState("error");
    }
  }

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

            {/* pie: sugerir una mejora (solo si hay formulario configurado) */}
            {FEEDBACK_URL && (
              <div style={{
                position: "sticky", bottom: 0,
                padding: "0.75rem 1rem 0.85rem",
                background: "var(--color-arena-card)",
                borderTop: "1px solid var(--color-arena-elevated)",
              }}>
                <p style={{
                  margin: "0 0 0.5rem", display: "flex", alignItems: "center", gap: "0.4rem",
                  fontFamily: "var(--font-mono)", fontSize: "0.58rem",
                  letterSpacing: "0.08em", color: "var(--color-ink-muted)", textTransform: "uppercase",
                }}>
                  {/* ícono de bombilla */}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18h6" />
                    <path d="M10 22h4" />
                    <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
                  </svg>
                  {S.suggestTitle}
                </p>

                {sendState === "sent" ? (
                  <p style={{
                    margin: 0, padding: "0.55rem 0.7rem", borderRadius: 7,
                    fontFamily: "var(--font-body)", fontSize: "0.8rem", fontWeight: 700,
                    color: "var(--color-wc-gold)",
                    background: "rgba(212,168,67,0.10)",
                    border: "1px solid rgba(212,168,67,0.4)",
                  }}>
                    ✓ {S.suggestThanks}
                  </p>
                ) : (
                  <form onSubmit={sendSuggestion}>
                    <textarea
                      value={msg}
                      onChange={(e) => { setMsg(e.target.value); if (sendState === "error") setSendState("idle"); }}
                      placeholder={S.suggestPlaceholder}
                      rows={3}
                      style={{
                        width: "100%", resize: "vertical", boxSizing: "border-box",
                        padding: "0.5rem 0.6rem", marginBottom: "0.5rem", borderRadius: 7,
                        fontFamily: "var(--font-body)", fontSize: "0.8rem", lineHeight: 1.4,
                        color: "var(--color-ink-primary)",
                        background: "var(--color-arena-elevated)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        outline: "none",
                      }}
                    />
                    {sendState === "error" && (
                      <p style={{
                        margin: "0 0 0.5rem", fontFamily: "var(--font-body)", fontSize: "0.72rem",
                        color: "var(--color-wc-red)",
                      }}>
                        {S.suggestError}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={!msg.trim() || sendState === "sending"}
                      style={{
                        width: "100%", padding: "0.6rem 0.8rem", borderRadius: 7,
                        fontFamily: "var(--font-body)", fontSize: "0.82rem", fontWeight: 700,
                        color: "var(--color-wc-gold)",
                        background: "rgba(212,168,67,0.10)",
                        border: "1px solid rgba(212,168,67,0.4)",
                        cursor: !msg.trim() || sendState === "sending" ? "default" : "pointer",
                        opacity: !msg.trim() || sendState === "sending" ? 0.5 : 1,
                        transition: "opacity 0.14s, background 0.14s",
                      }}
                    >
                      {sendState === "sending" ? S.suggestSending : S.suggestSend}
                    </button>
                  </form>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
