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
    id: "2026-06-21-fix-marcador",
    date: "2026-06-21",
    tag: "fix",
    title: {
      es: "Corrección del marcador España–Arabia Saudí",
      en: "Spain–Saudi Arabia score fix",
      pt: "Correção do placar Espanha–Arábia Saudita",
    },
    items: {
      es: [
        "La fuente oficial publicó España 5–0 por error; el resultado real fue 4–0. Se corrige a mano mientras la API se actualiza.",
      ],
      en: [
        "The official feed mistakenly showed Spain 5–0; the real result was 4–0. Patched by hand until the API updates.",
      ],
      pt: [
        "A fonte oficial mostrou Espanha 5–0 por engano; o resultado real foi 4–0. Corrigido manualmente até a API atualizar.",
      ],
    },
  },
  {
    id: "2026-06-21-sugerir-mejora",
    date: "2026-06-21",
    tag: "new",
    title: {
      es: "Sugiere mejoras desde la campanita",
      en: "Suggest improvements from the bell",
      pt: "Sugira melhorias pelo sininho",
    },
    items: {
      es: [
        "Nuevo apartado «¿Tienes una idea?» al pie del panel de novedades: escribe tu sugerencia o reporta un error y se envía al instante, sin salir de la app.",
      ],
      en: [
        "New “Got an idea?” box at the bottom of the what's-new panel: type your suggestion or report a bug and it's sent instantly, without leaving the app.",
      ],
      pt: [
        "Nova seção “Tem uma ideia?” no rodapé do painel de novidades: escreva sua sugestão ou relate um erro e é enviado na hora, sem sair do app.",
      ],
    },
  },
  {
    id: "2026-06-19-parejo-empate",
    date: "2026-06-19",
    tag: "improve",
    title: {
      es: "Partidos muy parejos se pronostican como empate",
      en: "Very even matches are predicted as a draw",
      pt: "Jogos muito equilibrados são previstos como empate",
    },
    items: {
      es: [
        "Cuando las probabilidades están casi a la par (ej. 36% / 35% / 36%), el pronóstico ya no elige un favorito por un pelo: se da por empate, que es lo más sensato. Aplica en el predictor, en grupos y en Modelo vs Realidad.",
        "Si pronosticamos empate y el partido no termina empatado, igual cuenta como acierto si gana el equipo con más probabilidad: solo fallamos si gana el menos probable (un batacazo).",
      ],
      en: [
        "When the odds are almost level (e.g. 36% / 35% / 36%), the prediction no longer picks a favourite by a hair — it's called a draw, which is the sensible read. Applies in the predictor, groups and Model vs Reality.",
        "If we predict a draw and it doesn't end level, it still counts as correct when the more likely team wins — we only miss if the underdog pulls off an upset.",
      ],
      pt: [
        "Quando as probabilidades estão quase niveladas (ex. 36% / 35% / 36%), a previsão não escolhe mais um favorito por um triz — é dada como empate, o mais sensato. Vale no preditor, nos grupos e em Modelo vs Realidade.",
        "Se prevemos empate e o jogo não termina igual, ainda conta como acerto quando vence o time mais provável — só erramos se o azarão dá a zebra.",
      ],
    },
  },
  {
    id: "2026-06-19-bracket-vivo",
    date: "2026-06-19",
    tag: "new",
    title: {
      es: "Cuadro de eliminatorias en vivo + nueva vista En Vivo",
      en: "Live knockout bracket + revamped Live view",
      pt: "Chaveamento ao vivo + nova aba Ao Vivo",
    },
    items: {
      es: [
        "Nuevo cuadro completo (Dieciseisavos → Final) con líneas tipo llave: ubica cada equipo según su puesto en la tabla y avanza a los ganadores con cada resultado real.",
        "Las posiciones de grupo ahora salen de la tabla oficial (desempates reales: diferencia de goles, fair play, etc.), no de un cálculo aproximado.",
        "La pestaña En Vivo se reorganizó (Modelo vs Realidad y Próximos arriba; dos botones Tabla / Eliminatorias abajo) y el cuadro se ve bien en móvil.",
      ],
      en: [
        "New full bracket (Round of 32 → Final) with bracket lines: slots each team by its standing and advances winners with every real result.",
        "Group positions now come from the official standings (real tiebreakers: goal difference, fair play, etc.), not an approximation.",
        "The Live tab was reorganised (Model vs Reality and Upcoming on top; two buttons Standings / Knockout below) and the bracket works well on mobile.",
      ],
      pt: [
        "Novo chaveamento completo (16 avos → Final) com linhas de chave: posiciona cada time pela classificação e avança os vencedores a cada resultado real.",
        "As posições de grupo agora vêm da classificação oficial (critérios reais: saldo de gols, fair play, etc.), não de um cálculo aproximado.",
        "A aba Ao Vivo foi reorganizada (Modelo vs Realidade e Próximos no topo; dois botões Classificação / Mata-mata abaixo) e o chaveamento fica bom no celular.",
      ],
    },
  },
  {
    id: "2026-06-17-parejo",
    date: "2026-06-17",
    tag: "new",
    title: {
      es: "Calidad del pronóstico y partidos parejos",
      en: "Forecast quality and tight matches",
      pt: "Qualidade do prognóstico e jogos equilibrados",
    },
    items: {
      es: [
        "Cuando ninguna selección es favorita clara, marcamos el partido como parejo y avisamos que el empate es casi tan probable como una victoria — en el predictor y en los partidos en vivo.",
        "Nueva sección «Calidad del pronóstico» en vivo: medimos qué tan buenas son las probabilidades (Brier y RPS), no solo si acertamos, y lo comparamos contra el azar.",
      ],
      en: [
        "When there's no clear favourite, we flag the match as tight and warn that a draw is almost as likely as a win — in the predictor and in live matches.",
        "New live «Forecast quality» section: we measure how good the probabilities are (Brier and RPS), not just whether we got it right, compared against random.",
      ],
      pt: [
        "Quando não há favorito claro, marcamos o jogo como equilibrado e avisamos que o empate é quase tão provável quanto uma vitória — no preditor e nos jogos ao vivo.",
        "Nova seção «Qualidade do prognóstico» ao vivo: medimos quão boas são as probabilidades (Brier e RPS), não só se acertamos, comparado com o acaso.",
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

/* Formulario web para que los visitantes sugieran mejoras o reporten errores.
   Pega aquí tu URL (Google Forms / Tally / Formspree). Si queda vacío, el
   pie de "Sugerir una mejora" no se muestra. */
export const FEEDBACK_URL = "https://formspree.io/f/mojjqwaa";

export const CHANGELOG_STR = {
  es: {
    bell:    "Novedades",
    title:   "Registro de cambios",
    subtitle: "Lo último que cambió en el predictor",
    tags:    { new: "Nuevo", improve: "Mejora", fix: "Arreglo" } as Record<ChangeTag, string>,
    suggestTitle:       "¿Tienes una idea?",
    suggestPlaceholder: "Cuéntame tu sugerencia o reporta un error…",
    suggestSend:        "Enviar sugerencia",
    suggestSending:     "Enviando…",
    suggestThanks:      "¡Gracias! Recibí tu sugerencia.",
    suggestError:       "No se pudo enviar. Inténtalo de nuevo.",
  },
  en: {
    bell:    "What's new",
    title:   "Changelog",
    subtitle: "The latest updates to the predictor",
    tags:    { new: "New", improve: "Improved", fix: "Fix" } as Record<ChangeTag, string>,
    suggestTitle:       "Got an idea?",
    suggestPlaceholder: "Tell me your suggestion or report a bug…",
    suggestSend:        "Send suggestion",
    suggestSending:     "Sending…",
    suggestThanks:      "Thanks! Got your suggestion.",
    suggestError:       "Couldn't send. Please try again.",
  },
  pt: {
    bell:    "Novidades",
    title:   "Registro de alterações",
    subtitle: "As últimas mudanças no preditor",
    tags:    { new: "Novo", improve: "Melhoria", fix: "Correção" } as Record<ChangeTag, string>,
    suggestTitle:       "Tem uma ideia?",
    suggestPlaceholder: "Conte sua sugestão ou relate um erro…",
    suggestSend:        "Enviar sugestão",
    suggestSending:     "Enviando…",
    suggestThanks:      "Obrigado! Recebi sua sugestão.",
    suggestError:       "Não foi possível enviar. Tente de novo.",
  },
} as const;
