import type { Lang } from "@/lib/i18n";

/* ─────────────────────────────────────────────────────────────
   REGISTRO DE CAMBIOS — alimenta la campanita de NOVEDADES.
   Mantener el más reciente primero. El `id` debe ser único y
   ordenable (usamos la fecha); se guarda en localStorage para
   saber qué ya vio el visitante y mostrar el punto rojo.
───────────────────────────────────────────────────────────── */

export type ChangeTag = "new" | "improve" | "fix";

export interface ChangeEntry {
  id: string;   // único y ordenable (fecha ISO)
  date: string; // ISO, se formatea según el idioma
  tag: ChangeTag;
  title: Record<Lang, string>;
  items: Record<Lang, string[]>;
}

export const CHANGELOG: ChangeEntry[] = [
  {
    id: "2026-06-16",
    date: "2026-06-16",
    tag: "new",
    title: {
      es: "Novedades, vista por jornadas y aciertos de posición",
      en: "What's new, matchday view and position hits",
      pt: "Novidades, visão por rodada e acertos de posição",
    },
    items: {
      es: [
        "Añadimos esta campanita de NOVEDADES con el registro de cambios.",
        "La fase de grupos ahora se divide por jornadas para que sea más fácil de leer.",
        "Cuando un grupo queda definido, mostramos cuántas posiciones acertó el modelo.",
      ],
      en: [
        "Added this NEWS bell with the changelog.",
        "The group stage is now split by matchday for easier reading.",
        "When a group is decided, we show how many positions the model got right.",
      ],
      pt: [
        "Adicionamos este sino de NOVIDADES com o registro de alterações.",
        "A fase de grupos agora é dividida por rodadas para facilitar a leitura.",
        "Quando um grupo é definido, mostramos quantas posições o modelo acertou.",
      ],
    },
  },
  {
    id: "2026-06-15",
    date: "2026-06-15",
    tag: "improve",
    title: {
      es: "Simulador más realista y xG en la interfaz",
      en: "More realistic simulator and xG in the UI",
      pt: "Simulador mais realista e xG na interface",
    },
    items: {
      es: [
        "Simulador de torneo recalibrado para resultados más creíbles.",
        "Goles esperados (xG) y marcador más probable visibles en el predictor.",
        "Indicador de la calidad del modelo.",
      ],
      en: [
        "Tournament simulator recalibrated for more believable results.",
        "Expected goals (xG) and most likely score shown in the predictor.",
        "Model quality indicator.",
      ],
      pt: [
        "Simulador de torneio recalibrado para resultados mais críveis.",
        "Gols esperados (xG) e placar mais provável no preditor.",
        "Indicador da qualidade do modelo.",
      ],
    },
  },
  {
    id: "2026-06-14",
    date: "2026-06-14",
    tag: "improve",
    title: {
      es: "Nuevo modelo Dixon-Coles",
      en: "New Dixon-Coles model",
      pt: "Novo modelo Dixon-Coles",
    },
    items: {
      es: [
        "Empates realistas y marcadores coherentes con las probabilidades 1X2.",
        "Se acabó el eterno 1-0: los marcadores ahora reflejan el partido real.",
      ],
      en: [
        "Realistic draws and scores consistent with the 1X2 probabilities.",
        "No more endless 1-0: scorelines now reflect the real match.",
      ],
      pt: [
        "Empates realistas e placares coerentes com as probabilidades 1X2.",
        "Fim do eterno 1-0: os placares agora refletem o jogo real.",
      ],
    },
  },
  {
    id: "2026-06-13",
    date: "2026-06-13",
    tag: "new",
    title: {
      es: "Marcador en vivo y hora local",
      en: "Live score and local time",
      pt: "Placar ao vivo e horário local",
    },
    items: {
      es: [
        "Marcador en directo y estado «En juego» durante los partidos.",
        "Los próximos partidos se muestran en tu hora local.",
      ],
      en: [
        "Live score and «In play» status during matches.",
        "Upcoming matches now shown in your local time.",
      ],
      pt: [
        "Placar ao vivo e status «Em andamento» durante os jogos.",
        "Os próximos jogos aparecem no seu horário local.",
      ],
    },
  },
];

/** id de la entrada más reciente — referencia para el punto de «no leído». */
export const CHANGELOG_LATEST = CHANGELOG[0]?.id ?? "";

export const CHANGELOG_STR = {
  es: {
    bell:    "Novedades",
    title:   "Registro de cambios",
    subtitle: "Lo último que cambió en el predictor",
    tags:    { new: "Nuevo", improve: "Mejora", fix: "Arreglo" } as Record<ChangeTag, string>,
  },
  en: {
    bell:    "What's new",
    title:   "Changelog",
    subtitle: "The latest updates to the predictor",
    tags:    { new: "New", improve: "Improved", fix: "Fix" } as Record<ChangeTag, string>,
  },
  pt: {
    bell:    "Novidades",
    title:   "Registro de alterações",
    subtitle: "As últimas mudanças no preditor",
    tags:    { new: "Novo", improve: "Melhoria", fix: "Correção" } as Record<ChangeTag, string>,
  },
} as const;
