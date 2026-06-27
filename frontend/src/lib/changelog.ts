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
    id: "2026-06-26-modelo-goles",
    date: "2026-06-26",
    tag: "improve",
    title: {
      es: "¿Por qué un «grande» puede tener menos probabilidad?",
      en: "Why a “big team” can have lower odds",
      pt: "Por que um «gigante» pode ter menos probabilidade?",
    },
    items: {
      es: [
        "Nueva entrada en el Glosario que aclara una duda frecuente: las probabilidades de campeón salen del modelo de GOLES (Dixon-Coles), no del ranking ELO —que es solo informativo y no decide ningún partido.",
        "Por eso una selección en racha goleadora (p. ej. Colombia) puede igualar a un gigante con más ELO que gana por la mínima (p. ej. Francia): el modelo mide forma reciente en goles, no prestigio histórico.",
      ],
      en: [
        "New Glossary entry clearing up a common question: the title odds come from the GOALS model (Dixon-Coles), not the ELO ranking —which is informational only and decides no match.",
        "That's why a team on a scoring run (e.g. Colombia) can match a higher-ELO giant that wins narrowly (e.g. France): the model measures recent goal form, not historical prestige.",
      ],
      pt: [
        "Nova entrada no Glossário que esclarece uma dúvida comum: as probabilidades de campeão vêm do modelo de GOLS (Dixon-Coles), não do ranking ELO —que é apenas informativo e não decide nenhum jogo.",
        "Por isso uma seleção em fase goleadora (ex. Colômbia) pode igualar um gigante com mais ELO que vence no detalhe (ex. França): o modelo mede a forma recente em gols, não o prestígio histórico.",
      ],
    },
  },
  {
    id: "2026-06-26-eliminatorias",
    date: "2026-06-26",
    tag: "new",
    title: {
      es: "Eliminatorias con probabilidades",
      en: "Knockouts with probabilities",
      pt: "Mata-mata com probabilidades",
    },
    items: {
      es: [
        "El cuadro de «En Vivo» ahora muestra la probabilidad de cada selección de ganar su cruce (incluye los penales según el historial) en cuanto se conocen los dos rivales y antes de que se juegue.",
        "Las «Proyecciones · Por ronda» ya se condicionan a los resultados reales de la fase de grupos: conforme se cierran los grupos, las probabilidades de llegar a octavos, cuartos, semis, final y título reflejan el camino real de cada equipo, no un promedio de sorteos.",
        "Los aciertos del modelo en eliminatorias ahora se miden por quién AVANZA (con penales incluidos), no por el marcador de 90': un empate que se define en los penales ya no cuenta como «empate» sino como acierto/fallo según el equipo que pasó.",
        "La calibración del modelo (en el Glosario) ahora se puede filtrar por fase —Todo · Grupos · Eliminatoria— para ver por separado qué tan afinado va el modelo en cada régimen.",
        "Toca cualquier cruce del cuadro «En Vivo» para abrir su detalle: probabilidad de avanzar, marcador esperado, opción de prórroga/penales y los marcadores más probables (y el resultado real si ya se jugó).",
      ],
      en: [
        "The “Live” bracket now shows each team's probability of winning its tie (penalties included, weighted by history) as soon as both opponents are known and before the match is played.",
        "“Projections · By round” are now conditioned on the real group-stage results: as groups finish, the odds of reaching the round of 16, quarters, semis, final and title reflect each team's actual path, not an average of draws.",
        "The model's hit rate in the knockouts is now scored by who ADVANCES (penalties included), not by the 90' result: a tie settled on penalties no longer counts as a “draw” but as a hit/miss based on the team that went through.",
        "Model calibration (in the Glossary) can now be filtered by phase —All · Groups · Knockouts— to see separately how sharp the model is in each regime.",
        "Tap any tie in the “Live” bracket to open its detail: chance to advance, expected score, extra-time/penalties likelihood and the most likely scorelines (plus the actual result once it's played).",
      ],
      pt: [
        "O chaveamento de “Ao Vivo” agora mostra a probabilidade de cada seleção vencer seu confronto (com pênaltis ponderados pelo histórico) assim que os dois adversários são conhecidos e antes do jogo.",
        "As “Projeções · Por fase” passam a ser condicionadas aos resultados reais da fase de grupos: conforme os grupos terminam, as probabilidades de chegar às oitavas, quartas, semis, final e título refletem o caminho real de cada time, não uma média de sorteios.",
        "Os acertos do modelo no mata-mata agora são medidos por quem AVANÇA (com pênaltis incluídos), não pelo placar dos 90': um empate decidido nos pênaltis deixa de contar como “empate” e passa a ser acerto/erro conforme o time que se classificou.",
        "A calibração do modelo (no Glossário) agora pode ser filtrada por fase —Tudo · Grupos · Mata-mata— para ver separadamente o quão afinado o modelo está em cada regime.",
        "Toque em qualquer confronto do chaveamento “Ao Vivo” para abrir o detalhe: chance de avançar, placar esperado, probabilidade de prorrogação/pênaltis e os placares mais prováveis (e o resultado real quando já jogado).",
      ],
    },
  },
  {
    id: "2026-06-22-evolucion",
    date: "2026-06-22",
    tag: "new",
    title: {
      es: "Evolución del favorito",
      en: "Title-race trend",
      pt: "Evolução do favorito",
    },
    items: {
      es: [
        "Nueva vista en «Proyecciones»: un gráfico de cómo se mueve la probabilidad de ser campeón de cada selección jornada a jornada — quién sube y quién baja con los resultados reales.",
        "Cada punto vuelve a correr el Monte Carlo condicionado a los partidos ya jugados hasta esa fecha; destaca la mayor subida y la mayor caída en puntos porcentuales.",
      ],
      en: [
        "New view in “Projections”: a chart of how each team's chance of winning the cup moves matchday by matchday — who climbs and who drops as real results come in.",
        "Each point re-runs the Monte Carlo conditioned on the matches played up to that date; it highlights the biggest riser and faller in percentage points.",
      ],
      pt: [
        "Nova visão em “Projeções”: um gráfico de como a probabilidade de ser campeão de cada seleção se move a cada rodada — quem sobe e quem cai com os resultados reais.",
        "Cada ponto recalcula o Monte Carlo condicionado aos jogos disputados até aquela data; destaca a maior alta e a maior queda em pontos percentuais.",
      ],
    },
  },
  {
    id: "2026-06-22-calibracion",
    date: "2026-06-22",
    tag: "new",
    title: {
      es: "Calibración del modelo (en el Glosario)",
      en: "Model calibration (in the Glossary)",
      pt: "Calibração do modelo (no Glossário)",
    },
    items: {
      es: [
        "Nueva tarjeta en el Glosario: un diagrama de confiabilidad en vivo que muestra si la confianza del modelo coincide con la realidad — cuando dice «60 %», ¿pasa el 60 % de las veces?",
        "Incluye el ECE (error de calibración) y las métricas Brier y RPS comparadas contra el azar, recalculadas con cada partido que termina.",
      ],
      en: [
        "New card in the Glossary: a live reliability diagram showing whether the model's confidence matches reality — when it says “60%”, does it happen 60% of the time?",
        "Includes the ECE (calibration error) plus Brier and RPS metrics versus random, recomputed as each match ends.",
      ],
      pt: [
        "Novo cartão no Glossário: um diagrama de confiabilidade ao vivo que mostra se a confiança do modelo coincide com a realidade — quando diz “60%”, acontece 60% das vezes?",
        "Inclui o ECE (erro de calibração) e as métricas Brier e RPS comparadas ao acaso, recalculadas a cada jogo que termina.",
      ],
    },
  },
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
