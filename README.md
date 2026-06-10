# ⚽ Mundial Predictor 2026

Predictor de resultados del **Mundial FIFA 2026** con Machine Learning: XGBoost calibrado, sistema ELO propio y simulación Monte Carlo del torneo completo — con resultados reales integrados en vivo durante la copa.

![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![XGBoost](https://img.shields.io/badge/XGBoost-2.0-EB5E28)
![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white)
![Tests](https://img.shields.io/badge/tests-35%20passed-2ea44f)

> 🇨🇦🇺🇸🇲🇽 El torneo arranca el **11 de junio de 2026**. La web fija los resultados reales a medida que se juegan: las probabilidades del simulador son condicionales a lo que ya pasó.

---

## ¿Qué hace?

- **Predictor de partido** — probabilidades victoria/empate/derrota para cualquier cruce entre las 48 selecciones clasificadas
- **Fase de grupos** — predicción de los 72 partidos y de las posiciones finales de cada grupo (5.000 simulaciones)
- **Simulador Monte Carlo** — N torneos completos: probabilidad de cada selección de llegar a cada ronda y de ser campeona
- **Resultados en vivo** — fetch client-side de [openfootball](https://github.com/openfootball/worldcup.json) (sin API key): los partidos jugados se fijan en la simulación
- **Penales con historia** — los empates de knockout se resuelven ponderando el historial real de tandas (Argentina gana 15/23, Inglaterra 4/12 🙃)
- **Multilenguaje** — Español · English · Português

## ¿Cómo funciona el modelo?

```
results.csv (49.378 partidos, 1872–2026)
   └─► normalización de nombres históricos (Zaïre→DR Congo, Czechoslovakia→Czech Republic…)
        └─► ELO propio (K=32, cronológico, pre-match)
             └─► feature matrix: ELO + forma reciente + H2H + experiencia mundialista
                  └─► XGBoost multi:softprob + CalibratedClassifierCV (isotónica)
                       └─► JSONs estáticos → frontend Next.js + Monte Carlo en el navegador
```

| Decisión | Por qué |
|---|---|
| ELO propio en vez de ranking FIFA | calculado solo sobre resultados, sin sesgos de puntos por confederación |
| Split temporal (test = Qatar 2022) | nada de KFold aleatorio en series temporales — cero leakage |
| Calibración isotónica | las probabilidades importan más que el accuracy en un simulador |
| Monte Carlo en el navegador | la simulación corre client-side sobre 1.128 pares pre-calculados |

**Métricas en Qatar 2022 (64 partidos, nunca vistos por el modelo):** accuracy 0.50–0.52 · log-loss 1.08 · calibración con error < 0.02 por clase. Un modelo aleatorio da 0.33 de accuracy; las casas de apuestas rondan 0.55-0.58.

## Correr en local

```bash
# 1. Pipeline de datos + modelos (Python 3.11)
python -m venv .venv && .venv/Scripts/activate
pip install -r requirements.txt
python scripts/run_pipeline.py          # raw → ELO → features → modelos → métricas
python scripts/export_frontend_data.py  # genera los JSON del frontend

# 2. Frontend (Next.js 15)
cd frontend
npm install
npm run dev                             # http://localhost:3000

# Tests
pytest          # 35 tests
```

> El dataset histórico se descarga de Kaggle ([martj42/international-football-results](https://www.kaggle.com/datasets/martj42/international-football-results-from-1872-to-2017)) vía `kagglehub` — los CSV no se versionan.

## Estructura

```
├── src/                # Python: extractor, ELO/features, modelo, simulador, app Streamlit (demo local)
├── scripts/            # run_pipeline.py · export_frontend_data.py
├── frontend/           # Next.js 15 + React 19 + Tailwind + Recharts (target de deploy)
│   └── src/lib/        # simulator.ts (Monte Carlo client-side) · live.ts (resultados reales)
├── tests/              # pytest — 35 tests
├── notebooks/          # EDA y análisis de features
└── data/               # raw (gitignored) · processed (regenerable) · external (fixture 2026)
```

## Fuentes de datos

- [International football results 1872–2026](https://www.kaggle.com/datasets/martj42/international-football-results-from-1872-to-2017) (Kaggle, martj42) — partidos, penales, goleadores, nombres históricos
- [openfootball/worldcup.json](https://github.com/openfootball/worldcup.json) — fixture y resultados del Mundial 2026, sin API key

## Autor

**Luis Miguel Rodríguez** — Data & Analytics Engineering
[luismiguelro.com](https://luismiguelro.com)

*Proyecto de portafolio. No afiliado a la FIFA.*
