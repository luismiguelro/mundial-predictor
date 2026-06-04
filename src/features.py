"""Cálculo de features: ELO, forma reciente, H2H, experiencia en Mundiales."""
import logging
from pathlib import Path
from typing import Dict, Tuple

import numpy as np
import pandas as pd

ROOT = Path(__file__).parent.parent
DATA_PROCESSED = ROOT / "data" / "processed"

logger = logging.getLogger(__name__)

INITIAL_ELO = 1500.0
K_FACTOR = 32.0


def expected_score(rating_a: float, rating_b: float) -> float:
    return 1 / (1 + 10 ** ((rating_b - rating_a) / 400))


def update_elo(rating: float, expected: float, actual: float, k: float = K_FACTOR) -> float:
    return rating + k * (actual - expected)


def compute_elo_ratings(df_all: pd.DataFrame) -> pd.DataFrame:
    """Calcula ELO pre-match sobre todos los partidos internacionales en orden cronológico."""
    df = df_all.sort_values("date").reset_index(drop=True)
    ratings: Dict[str, float] = {}

    elo_home_pre, elo_away_pre = [], []

    for _, row in df.iterrows():
        home, away = row["home_team"], row["away_team"]
        r_home = ratings.get(home, INITIAL_ELO)
        r_away = ratings.get(away, INITIAL_ELO)

        elo_home_pre.append(r_home)
        elo_away_pre.append(r_away)

        exp_home = expected_score(r_home, r_away)
        exp_away = 1 - exp_home

        hs, as_ = row["home_score"], row["away_score"]
        if hs > as_:
            actual_home, actual_away = 1.0, 0.0
        elif hs == as_:
            actual_home = actual_away = 0.5
        else:
            actual_home, actual_away = 0.0, 1.0

        ratings[home] = update_elo(r_home, exp_home, actual_home)
        ratings[away] = update_elo(r_away, exp_away, actual_away)

    df = df.copy()
    df["elo_home"] = elo_home_pre
    df["elo_away"] = elo_away_pre
    df["elo_diff"] = df["elo_home"] - df["elo_away"]
    return df


def rolling_goals(df: pd.DataFrame, team_col: str, scored_col: str, conceded_col: str, n: int = 5) -> pd.DataFrame:
    """Promedio de goles anotados/recibidos en los últimos n partidos de cada equipo."""
    df = df.sort_values("date").copy()
    records = []

    for team in df[team_col].unique():
        mask = df[team_col] == team
        team_df = df[mask].copy()
        team_df[f"{team_col}_scored_avg{n}"] = team_df[scored_col].shift(1).rolling(n, min_periods=1).mean()
        team_df[f"{team_col}_conceded_avg{n}"] = team_df[conceded_col].shift(1).rolling(n, min_periods=1).mean()
        records.append(team_df)

    return pd.concat(records).sort_values("date").reset_index(drop=True)


def compute_h2h(df_wc: pd.DataFrame) -> pd.DataFrame:
    """Agrega % de victorias del local en el H2H histórico."""
    df = df_wc.sort_values("date").copy()
    h2h_records = []

    for idx, row in df.iterrows():
        home, away = row["home_team"], row["away_team"]
        past = df[(df["date"] < row["date"]) &
                  (((df["home_team"] == home) & (df["away_team"] == away)) |
                   ((df["home_team"] == away) & (df["away_team"] == home)))]
        total = len(past)
        if total == 0:
            h2h_records.append(0.5)
        else:
            home_wins = len(past[(past["home_team"] == home) & (past["outcome"] == "home_win")]) + \
                        len(past[(past["away_team"] == home) & (past["outcome"] == "away_win")])
            h2h_records.append(home_wins / total)

    df["h2h_home_win_pct"] = h2h_records
    return df


def compute_wc_experience(df_wc: pd.DataFrame) -> pd.DataFrame:
    """Diferencia de partidos de Mundial jugados previamente por cada equipo."""
    df = df_wc.sort_values("date").copy()
    exp_diff = []

    for idx, row in df.iterrows():
        past = df[df["date"] < row["date"]]
        home_exp = len(past[(past["home_team"] == row["home_team"]) | (past["away_team"] == row["home_team"])])
        away_exp = len(past[(past["home_team"] == row["away_team"]) | (past["away_team"] == row["away_team"])])
        exp_diff.append(home_exp - away_exp)

    df["wc_experience_diff"] = exp_diff
    return df


def build_feature_matrix(df_all: pd.DataFrame, df_wc: pd.DataFrame) -> pd.DataFrame:
    """Pipeline completo: ensambla todas las features para los partidos de Mundial."""
    logger.info("Calculando ELO sobre %d partidos históricos...", len(df_all))
    df_elo = compute_elo_ratings(df_all)

    # Tomar ELOs en los partidos de Mundial
    wc_with_elo = df_wc.merge(
        df_elo[["date", "home_team", "away_team", "elo_home", "elo_away", "elo_diff"]],
        on=["date", "home_team", "away_team"],
        how="left",
    )

    logger.info("Calculando H2H...")
    wc_with_elo = compute_h2h(wc_with_elo)

    logger.info("Calculando experiencia en Mundiales...")
    wc_with_elo = compute_wc_experience(wc_with_elo)

    wc_with_elo["is_neutral"] = wc_with_elo["neutral"].astype(int)
    wc_with_elo["year"] = wc_with_elo["date"].dt.year

    feature_cols = [
        "date", "year", "home_team", "away_team", "outcome",
        "elo_diff", "elo_home", "elo_away",
        "h2h_home_win_pct", "is_neutral", "wc_experience_diff",
    ]
    df_features = wc_with_elo[[c for c in feature_cols if c in wc_with_elo.columns]]
    logger.info("Feature matrix lista: %d filas, %d columnas", *df_features.shape)
    return df_features


def save_features(df: pd.DataFrame, path: Path = DATA_PROCESSED / "features.parquet") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(path, index=False)
    logger.info("features.parquet guardado en %s", path)
