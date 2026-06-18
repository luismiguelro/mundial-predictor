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
    id: "2026-06-17-parejo",
    date: "2026-06-17",
    tag: "new",
    title: {
      es: "Aviso de partido parejo",
      en: "Tight-match flag",
      pt: "Aviso de jogo equilibrado",
    },
    items: {
      es: [
        "Cuando ninguna selección es favorita clara, el predictor marca el partido como parejo y avisa que el empate es casi tan probable como una victoria.",
      ],
      en: [
        "When there's no clear favourite, the predictor flags the match as tight and warns that a draw is almost as likely as a win.",
      ],
      pt: [
        "Quando não há favorito claro, o preditor marca o jogo como equilibrado e avisa que o empate é quase tão provável quanto uma vitória.",
      ],
    },
  },
  {
    id: "2026-06-17-goleadores",
    date: "2026-06-17",
    tag: "new",
    title: {
      es: "Estadísticas y goleadores en vivo",
      en: "Live stats and scorers",
      pt: "Estatísticas e artilheiros ao vivo",
    },
    items: {
      es: [
        "Las estadísticas y los goleadores ahora se actualizan con el Mundial 2026 en marcha.",
        "Mejoras visuales en las tablas.",
      ],
      en: [
        "Stats and top scorers now update as the 2026 World Cup unfolds.",
        "Visual improvements across the tables.",
      ],
      pt: [
        "As estatísticas e os artilheiros agora se atualizam com a Copa 2026 em andamento.",
        "Melhorias visuais nas tabelas.",
      ],
    },
  },
  {
    id: "2026-06-16",
    date: "2026-06-16",
    tag: "new",
    title: {
      es: "Novedades y fase de grupos más clara",
      en: "What's new and a clearer group stage",
      pt: "Novidades e fase de grupos mais clara",
    },
    items: {
      es: [
        "Nueva sección de novedades en la cabecera.",
        "La fase de grupos es más fácil de seguir y muestra los aciertos del modelo.",
      ],
      en: [
        "New what's-new section in the header.",
        "The group stage is easier to follow and shows the model's hits.",
      ],
      pt: [
        "Nova seção de novidades no cabeçalho.",
        "A fase de grupos ficou mais fácil de acompanhar e mostra os acertos do modelo.",
      ],
    },
  },
  {
    id: "2026-06-15",
    date: "2026-06-15",
    tag: "improve",
    title: {
      es: "Predicciones y simulador mejorados",
      en: "Better predictions and simulator",
      pt: "Previsões e simulador melhorados",
    },
    items: {
      es: [
        "Resultados más realistas y más detalle en el predictor.",
      ],
      en: [
        "More realistic results and extra detail in the predictor.",
      ],
      pt: [
        "Resultados mais realistas e mais detalhe no preditor.",
      ],
    },
  },
  {
    id: "2026-06-13",
    date: "2026-06-13",
    tag: "new",
    title: {
      es: "Resultados en vivo y hora local",
      en: "Live results and local time",
      pt: "Resultados ao vivo e horário local",
    },
    items: {
      es: [
        "Sigue los partidos en directo, con los horarios en tu zona.",
      ],
      en: [
        "Follow matches live, with kickoff times in your zone.",
      ],
      pt: [
        "Acompanhe os jogos ao vivo, com os horários no seu fuso.",
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
