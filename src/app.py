"""App Streamlit: predictor de partido + simulador de torneo Mundial 2026."""
import logging
from pathlib import Path

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from src.model import FEATURE_COLS, LABEL_MAP, load_model

ROOT = Path(__file__).parent.parent
DATA_PROCESSED = ROOT / "data" / "processed"
MODELS_DIR = ROOT / "models"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

LABEL_NAMES = {v: k for k, v in LABEL_MAP.items()}

st.set_page_config(
    page_title="Mundial 2026 Predictor",
    page_icon="⚽",
    layout="wide",
)


@st.cache_resource
def get_model():
    return load_model(MODELS_DIR / "xgb_calibrated.pkl")


@st.cache_data
def get_features():
    return pd.read_parquet(DATA_PROCESSED / "features.parquet")


def donut_chart(probs: dict) -> go.Figure:
    labels = ["Local gana", "Empate", "Visitante gana"]
    values = [probs["home_win"], probs["draw"], probs["away_win"]]
    colors = ["#C8102E", "#AAAAAA", "#003087"]
    fig = go.Figure(go.Pie(
        labels=labels,
        values=values,
        hole=0.55,
        marker_colors=colors,
        textinfo="label+percent",
    ))
    fig.update_layout(
        showlegend=False,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        margin=dict(t=20, b=20, l=20, r=20),
    )
    return fig


def tab_predictor(model, df_features: pd.DataFrame) -> None:
    st.header("Predictor de partido")
    teams = sorted(set(df_features["home_team"].tolist() + df_features["away_team"].tolist()))

    col1, col2 = st.columns(2)
    with col1:
        home = st.selectbox("Equipo local", teams, index=teams.index("Colombia") if "Colombia" in teams else 0)
    with col2:
        away_default = teams.index("Argentina") if "Argentina" in teams else 1
        away = st.selectbox("Equipo visitante", teams, index=away_default)

    neutral = st.checkbox("Sede neutral", value=True)

    if st.button("Predecir"):
        # Tomar últimos ELO conocidos
        last_home = df_features[
            (df_features["home_team"] == home) | (df_features["away_team"] == home)
        ].sort_values("date").iloc[-1]
        last_away = df_features[
            (df_features["home_team"] == away) | (df_features["away_team"] == away)
        ].sort_values("date").iloc[-1]

        elo_home = last_home["elo_home"] if last_home["home_team"] == home else last_home["elo_away"]
        elo_away = last_away["elo_away"] if last_away["away_team"] == away else last_away["elo_home"]

        row = pd.DataFrame([{
            "elo_diff": elo_home - elo_away,
            "elo_home": elo_home,
            "elo_away": elo_away,
            "h2h_home_win_pct": 0.5,
            "is_neutral": int(neutral),
            "wc_experience_diff": 0,
        }])

        proba = model.predict_proba(row[FEATURE_COLS])[0]
        probs = {"home_win": proba[0], "draw": proba[1], "away_win": proba[2]}

        st.plotly_chart(donut_chart(probs), use_container_width=True)
        c1, c2, c3 = st.columns(3)
        c1.metric(f"{home} gana", f"{probs['home_win']:.1%}")
        c2.metric("Empate", f"{probs['draw']:.1%}")
        c3.metric(f"{away} gana", f"{probs['away_win']:.1%}")


def tab_simulator(model, df_features: pd.DataFrame) -> None:
    st.header("Simulador de torneo — Mundial 2026")
    st.info("Simulador completo disponible en Día 10 del roadmap.")


def main() -> None:
    st.title("⚽ Mundial 2026 Predictor")

    try:
        model = get_model()
        df_features = get_features()
    except Exception as e:
        st.error(f"No se encontró el modelo entrenado. Ejecuta el pipeline primero.\n\n{e}")
        return

    tab1, tab2 = st.tabs(["Predictor de partido", "Simulador de torneo"])
    with tab1:
        tab_predictor(model, df_features)
    with tab2:
        tab_simulator(model, df_features)


if __name__ == "__main__":
    main()
