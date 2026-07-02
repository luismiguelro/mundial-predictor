# Auditoría integral — mundial-predictor (2026-07-01)

> Auditoría de código, arquitectura, modelo y portafolio realizada al cierre de la
> fase de grupos del Mundial 2026. Los números "en vivo" se calcularon contra la
> API oficial (football-data.org) con la **misma lógica de acierto de la web**
> (regla de "partido parejo" ±0.06 incluida), así que coinciden con lo que muestra
> la app.

## Contexto real del proyecto

El brief original describía "XGBoost + Streamlit"; el estado actual es otro:

- **Modelo de producción: Dixon-Coles** (regresión de Poisson ponderada con
  corrección ρ, decaimiento temporal y encogimiento bayesiano). XGBoost y la
  regresión logística quedan en el pipeline solo como comparación.
- **Producto desplegado: frontend Next.js 15 en Vercel** con Monte Carlo
  client-side, resultados oficiales en vivo y proyecciones condicionales.
- La app Streamlit quedó como demo local desactualizada (movida a `legacy/`).

Volumen: ~3.000 líneas de Python activo, ~9.200 de TypeScript, 45 tests de
Python (todos pasan), CI con pytest + type-check + lint + build.

---

## Métricas del modelo

### Backtest Qatar 2022 (64 partidos, split temporal, cero leakage)

| Modelo | Accuracy | Log-loss | Brier |
|---|---|---|---|
| **Dixon-Coles** | **0.531** | **1.029** | **0.201** |
| XGBoost calibrado | 0.500 | 1.088 | 0.216 |
| Regresión logística (baseline) | 0.516 | 1.101 | 0.211 |

Dixon-Coles gana en las tres métricas. Referencias: azar = 0.33; casas de
apuestas ≈ 0.55–0.58.

### Mundial 2026 en vivo (al 2026-07-01: 72 de grupos + 9 de R32 jugados)

- **Fase de grupos: 49/72 aciertos (68.1%)**
- **Dieciseisavos: 7/9** aciertos de quién avanza (penales incluidos)
- **Ganadores de grupo: 11/12** — único fallo: predijo Portugal 1.º del K,
  lo ganó Colombia
- **Posiciones exactas: 26/48** · **Clasificados top-2 previstos: 19/24**
- Grupos perfectos (6/6): C e I · Peores (3/6): E, G, H, K

**Dónde falla:** empates. El modelo predijo 4 empates y hubo 20; **16 de los
23 fallos de grupos fueron empates no cantados** (peor caso: España 0-0 Cabo
Verde con 81% de confianza). Es una propiedad del argmax sobre 1X2 (el empate
rara vez supera el 30%), mitigada en la UI con el umbral de partido parejo.
En eliminatorias desaparece (siempre avanza alguien). Los 2 fallos de R32:
Alemania (68%) eliminada por Paraguay en penales, y Ecuador (55%) ante México.

Nota de humildad estadística: el 68% en vivo frente al 53% del backtest es en
parte varianza de una muestra de 72 partidos (y la regla de partido parejo,
que el backtest no usa).

---

## Top 5 hallazgos

1. **Empates estructuralmente subpredichos** (ver arriba). No es bug; está
   documentado y mitigado. Irrelevante para lo que queda de torneo (solo KO).
2. **Reproducibilidad frágil** — `requirements.txt` sin pinnear y CI en Python
   3.12 vs README 3.11 vs `.venv` real 3.14. ✅ *Corregido en esta auditoría.*
3. **`src/app.py` (1.786 líneas) peso muerto** — Streamlit desactualizado que
   usa el pipeline XGBoost viejo. ✅ *Movido a `legacy/`.*
4. **Cero tests del frontend**, donde vive la lógica más compleja del producto
   (`simulator.ts` 846 líneas, `live.ts` ~690). ⏳ Pendiente (ver mejoras).
5. **Lógica de simulación duplicada Python/TS** — `src/simulator.py` (Monte
   Carlo legacy, bracket aleatorio) vs `simulator.ts` (bracket oficial). El
   Python ya divergió. ⏳ Pendiente decidir: recortar simulator.py a lo que usa
   `export_frontend_data.py` o marcarlo como comparativo.

## Quick wins aplicados (2026-07-01)

| # | Cambio | Archivo(s) |
|---|---|---|
| 1 | Retirado el override España 4-0 (la API ya se autocorrigió; verificado) | `frontend/src/lib/overrides.ts` |
| 2 | Dependencias pinneadas al entorno validado (Python 3.14); retirados `streamlit`, `plotly`, `openpyxl`, `kagglehub`, `python-dotenv` (no usados por pipeline/tests) | `requirements.txt` |
| 3 | `src/app.py` → `legacy/app.py` (sigue funcionando: resuelve ROOT por `parent.parent`) | `legacy/` |
| 4 | Eliminados `buildForm`/`TeamForm` (exportados, nunca usados) | `frontend/src/lib/live.ts` |
| 5 | ESLint 9 flat config (`next/core-web-vitals` + `next/typescript`) + paso de lint en CI. Resultado inicial: 0 errores, 4 warnings | `frontend/eslint.config.mjs`, `package.json`, `.github/workflows/ci.yml` |
| 6 | CI Python 3.12 → 3.14; README actualizado (badge, estructura, kagglehub) | `ci.yml`, `README.md` |

Warnings de lint pendientes (no bloquean): fuente custom en `layout.tsx`
(`no-page-custom-font`) y 3 avisos de `useMemo` en `Groups.tsx`
(`react-hooks/exhaustive-deps`).

## Mejoras recomendadas (priorizadas)

1. ✅ **Ajuste por forma del torneo para el KO** — *implementado 2026-07-01*:
   `buildFormFactors`/`getProbsWithForm` en `simulator.ts` reponderan los λ
   por el saldo V−D real (±3 %/punto, tope ±12 %), solo en cruces futuros;
   la validación ✓/✗ conserva la predicción original.
2. ✅ **Tarjeta social (OG image) con el récord en vivo** — *implementado
   2026-07-01*: `app/opengraph-image.tsx` calcula los veredictos en el
   servidor (misma lógica que la web) y renderiza el stat con la marca del
   sitio; fallback al backtest si no hay token.
3. ✅ **Credibilidad, en lenguaje llano** — *implementado 2026-07-01*: nota de
   «juego limpio» en «En Vivo» (cada pronóstico se publica antes del partido y
   no se modifica después). Se descartó enlazar a GitHub: demasiado técnico
   para la audiencia de la web; el historial de commits queda como respaldo
   citable en el post/portafolio.
4. **Tests frontend con vitest** — `matchThirds` (backtracking),
   `computeGroupStandings` (head-to-head FIFA), `evaluatePrediction`,
   `applyKnockoutReality` y ahora `getProbsWithForm`. Funciones puras, 1-2 h.
5. **Web Worker para `runMonteCarlo`** — hoy corre en el hilo principal
   (Knockout.tsx, Simulator.tsx); con n=1000-2000 congela ~1-2 s en móviles.
6. **Backtest 2026 completo post-torneo** (104 partidos) como segunda
   validación honesta para README y post final.
7. **Resolver los 4 warnings de lint** y considerar `--max-warnings 0` en CI.
8. **Decidir el destino de `src/simulator.py`** (ver hallazgo 5).
9. **Documentar en el Glosario** la decisión ELO-solo-display (ya tomada).
10. **Snapshot diario de la API** (los JSON de football-data) para poder
    reconstruir métricas históricas sin depender del upstream.

## Checklist de portafolio

| Criterio | Estado |
|---|---|
| README con decisiones técnicas justificadas | ✅ Tabla de trade-offs, backtest honesto |
| Métricas contra baseline | ✅ Tres modelos comparados |
| Producto vivo y verificable | ✅ Web en Vercel con datos reales |
| Reproducibilidad | ✅ Deps pinneadas, Python alineado (esta auditoría) |
| Lint/CI frontend | ✅ ESLint en CI (esta auditoría) |
| Tests donde vive la lógica | ⚠️ Python sí; TypeScript pendiente |
| Sin código muerto visible | ✅ app.py a legacy/, buildForm eliminado |

**Pitch:** el activo diferencial no es el modelo, es el *build-in-public
confrontado con la realidad*: predicciones publicadas antes de cada partido y
validadas en vivo (✓/✗ a la vista), con proyecciones condicionales a lo ya
jugado. Eso es lo que ningún notebook de Kaggle puede mostrar.
