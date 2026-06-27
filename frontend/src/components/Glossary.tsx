"use client";

import { useLang } from "@/lib/i18n";
import type { MatchVerdict } from "@/lib/live";
import Calibration from "@/components/Calibration";

interface Term {
  term: string;
  icon: string;
  definition: string;
  detail?: string;
}

const TERMS: Term[] = [
  {
    term: "Rating ELO",
    icon: "📈",
    definition:
      "Sistema de puntuación que mide la fuerza relativa de los equipos basándose únicamente en resultados. Inventado por Arpad Elo para el ajedrez, adaptado al fútbol.",
    detail:
      "Rating inicial: 1 500 puntos. K-factor: 32 (estándar FIFA). Calculado cronológicamente sobre 49 000+ partidos internacionales desde 1872. Fórmula: E = 1 / (1 + 10^((rival − propio) / 400)). Nuevo rating = viejo + 32 × (resultado − esperado).",
  },
  {
    term: "Modelo Dixon-Coles",
    icon: "🤖",
    definition:
      "El modelo de predicción. En lugar de clasificar el resultado (local/empate/visitante), estima las fuerzas de ataque y defensa de cada equipo y modela los goles con una distribución de Poisson. De esa misma matriz de marcadores salen, coherentes, las probabilidades 1X2 y el marcador más probable.",
    detail:
      "Entrenado con 12 000+ partidos internacionales recientes (no solo Mundiales) con decaimiento temporal (los partidos recientes pesan más) y la corrección de Dixon-Coles para marcadores bajos. Backtest honesto en Qatar 2022: accuracy 53%, log-loss 1.036, Brier 0.201 — mejor que el clasificador anterior en las tres métricas.",
  },
  {
    term: "¿Por qué un \"grande\" puede tener menos probabilidad?",
    icon: "⚖️",
    definition:
      "Las probabilidades de campeón salen del modelo de GOLES (Dixon-Coles), no del ranking ELO. El ELO se muestra como referencia, pero no decide ni un solo partido. Por eso una selección en buena racha goleadora puede igualar o superar a un gigante con más ELO que gana sus partidos por la mínima.",
    detail:
      "Ejemplo real de este Mundial: Francia (ELO 2022, 3.ª) y Colombia (ELO 1933, 8.ª) salen casi empatadas como campeón (~5.8% cada una). El modelo les da fuerzas de ataque/defensa casi idénticas porque, en goles recientes, lo son: Colombia llega de una racha goleadora fuerte y Francia tiende a ganar cerrado. Por ELO puro Francia le ganaría a Colombia ~62%, pero el modelo de goles da ~53%. No es un error: es un modelo de forma reciente medida en goles, no de prestigio histórico. El camino en el cuadro (rivales que tocan) también pesa.",
  },
  {
    term: "Monte Carlo",
    icon: "🎲",
    definition:
      "Técnica de simulación que repite el torneo completo miles de veces con resultados aleatorios ponderados por las probabilidades del modelo para estimar la probabilidad de cada resultado posible.",
    detail:
      "Cada simulación: simula los 72 partidos de grupos, clasifica top-2 + 8 mejores terceros, luego simula R32 → R16 → QF → SF → Final. Con 5 000 simulaciones, el error estándar es < 0.7% por equipo.",
  },
  {
    term: "Log-loss",
    icon: "📉",
    definition:
      "Métrica principal de evaluación del modelo. Mide qué tan seguros y correctos son los pronósticos. Menor es mejor. Un modelo perfecto tiene log-loss = 0.",
    detail:
      "Dixon-Coles en Qatar 2022: log-loss = 1.036, mejor que el clasificador XGBoost anterior (1.088) y que la regresión logística (1.101). Para referencia, adivinar siempre 1/3 daría log-loss = 1.099.",
  },
  {
    term: "Brier Score",
    icon: "🎯",
    definition:
      "Error cuadrático medio de las probabilidades. Mide qué tan cerca están las probabilidades predichas de los resultados reales (0 = perfecto, 1 = terrible).",
    detail:
      "Nuestro modelo Dixon-Coles: Brier = 0.201 (mejor que el 0.216 del clasificador anterior). Equivale a un error promedio de ±20 puntos porcentuales por predicción.",
  },
  {
    term: "Fuerza de ataque y defensa",
    icon: "⚔️",
    definition:
      "Los dos parámetros que Dixon-Coles estima para cada selección: cuántos goles tiende a marcar (ataque) y cuántos a conceder (defensa). De su combinación salen los goles esperados de cada equipo en un partido.",
    detail:
      "Goles esperados del local = exp(base + ataque_local + defensa_rival + ventaja_local). En sede neutral (como el Mundial) la ventaja de local se anula. Estos parámetros se ajustan por máxima verosimilitud sobre miles de partidos.",
  },
  {
    term: "Goles esperados (xG del modelo)",
    icon: "⚡",
    definition:
      "El número medio de goles (λ) que el modelo asigna a cada equipo en un partido concreto. No es un marcador, es una tasa: de ahí se construye la distribución de marcadores posibles.",
    detail:
      "Brasil vs Panamá → ~2.9 vs ~0.6 goles esperados (marcador más probable 2-0). Un partido parejo como Egipto vs Irán → ~0.9 vs ~1.0 (marcador más probable 0-0 o 1-1). Por eso los marcadores ya no son siempre 1-0.",
  },
  {
    term: "Decaimiento temporal",
    icon: "🏆",
    definition:
      "Los partidos recientes pesan más que los antiguos al estimar las fuerzas de cada equipo. Un resultado de hace 6 meses dice más del nivel actual que uno de hace 8 años.",
    detail:
      "Peso = 0.5^(días_de_antigüedad / vida_media), con una vida media de ~2 años. Así el modelo refleja el estado de forma actual sin descartar del todo la información histórica.",
  },
  {
    term: "Formato Mundial 2026",
    icon: "📋",
    definition:
      "48 equipos en 12 grupos de 4. Los 2 primeros de cada grupo + los 8 mejores terceros clasifican a la Ronda de 32 (R32). Luego knockout puro hasta la final.",
    detail:
      "Total: 72 partidos de grupos + 32 de R32 + 16 de octavos (R16) + 8 de cuartos (QF) + 4 de semis (SF) + 2 de tercer lugar + 1 final = 104 partidos totales en 3 países.",
  },
  {
    term: "Split temporal",
    icon: "📅",
    definition:
      "Técnica anti-leakage para series temporales: el modelo se entrena solo con datos previos al torneo y se evalúa en el futuro (Qatar 2022). Nunca usamos datos del futuro para entrenar.",
    detail:
      "En datos ordenados por tiempo, un k-fold aleatorio contaminaría el modelo (usaría información del futuro para predecir el pasado). El split temporal garantiza que las métricas son realistas.",
  },
  {
    term: "Corrección de Dixon-Coles",
    icon: "🔧",
    definition:
      "Un Poisson simple subestima los marcadores bajos (0-0, 1-0, 0-1, 1-1), justo donde se concentran los empates. Dixon-Coles añade un ajuste (rho) que corrige esas cuatro casillas para que los empates aparezcan con su frecuencia real.",
    detail:
      "Gracias a ello el modelo asigna ~25% de probabilidad de empate por partido (coherente con el histórico) y el marcador más probable es un empate (1-1, 0-0) en cerca de un tercio de los partidos de grupos.",
  },
];

export default function Glossary({ verdicts = [] }: { verdicts?: MatchVerdict[] }) {
  const T = useLang();
  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-black mb-2">{T.glossaryTitle}</h2>
        <p className="text-[var(--text-muted)] text-sm">{T.glossarySubtitle}</p>
      </div>

      {/* Calibración del modelo: tarjeta interactiva (diagrama en vivo + métricas).
          Va primera porque es contenido en vivo del Mundial 2026 en curso. */}
      <details className="stat-card group cursor-pointer text-left" style={{ borderColor: "rgba(212,168,67,0.35)" }}>
        <summary className="flex items-center gap-3 list-none cursor-pointer select-none">
          <span className="text-2xl">🎯</span>
          <span className="font-bold text-base flex-1">
            {T.lt_calibTitle}
            <span
              className="ml-2 align-middle text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full"
              style={{ fontFamily: "var(--font-mono)", background: "rgba(207,10,44,0.14)", color: "var(--wc-red)" }}
            >
              ● {T.lt_live}
            </span>
          </span>
          <span className="text-[var(--text-muted)] text-sm transition-transform group-open:rotate-180">▼</span>
        </summary>
        <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] space-y-3">
          <p className="text-sm text-[var(--text)]">{T.lt_calibNote} {T.lt_calibReading}</p>
          <Calibration verdicts={verdicts} embedded />
        </div>
      </details>

      {TERMS.map(({ term, icon, definition, detail }) => (
        <details key={term} className="stat-card group cursor-pointer text-left">
          <summary className="flex items-center gap-3 list-none cursor-pointer select-none">
            <span className="text-2xl">{icon}</span>
            <span className="font-bold text-base flex-1">{term}</span>
            <span className="text-[var(--text-muted)] text-sm transition-transform group-open:rotate-180">▼</span>
          </summary>
          <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] space-y-2">
            <p className="text-sm text-[var(--text)]">{definition}</p>
            {detail && (
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">{detail}</p>
            )}
          </div>
        </details>
      ))}

      <div className="stat-card text-center text-xs text-[var(--text-muted)] mt-6">
        <p>{T.glossaryFooter}</p>
      </div>
    </div>
  );
}
