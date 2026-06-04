"""Carga y limpieza del dataset raw de resultados internacionales."""
import logging
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).parent.parent
DATA_RAW = ROOT / "data" / "raw"
DATA_PROCESSED = ROOT / "data" / "processed"

logger = logging.getLogger(__name__)


def load_results(path: Path = DATA_RAW / "results.csv") -> pd.DataFrame:
    """Carga results.csv y parsea la columna date."""
    df = pd.read_csv(path, parse_dates=["date"])
    logger.info("results.csv cargado: %d filas", len(df))
    return df


def load_shootouts(path: Path = DATA_RAW / "shootouts.csv") -> pd.DataFrame:
    """Carga shootouts.csv."""
    df = pd.read_csv(path, parse_dates=["date"])
    logger.info("shootouts.csv cargado: %d filas", len(df))
    return df


def filter_world_cups(df: pd.DataFrame) -> pd.DataFrame:
    """Filtra solo partidos de fase final del Mundial (excluye calificatorias)."""
    mask = df["tournament"] == "FIFA World Cup"
    df_wc = df[mask].copy()
    logger.info("Partidos de Mundial filtrados: %d", len(df_wc))
    return df_wc


def add_outcome(df: pd.DataFrame) -> pd.DataFrame:
    """Agrega columna outcome desde perspectiva del equipo local."""
    import numpy as np

    conditions = [
        df["home_score"] > df["away_score"],
        df["home_score"] == df["away_score"],
        df["home_score"] < df["away_score"],
    ]
    choices = ["home_win", "draw", "away_win"]
    df = df.copy()
    df["outcome"] = np.select(conditions, choices)
    return df


def save_wc_clean(df: pd.DataFrame, path: Path = DATA_PROCESSED / "wc_clean.csv") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)
    logger.info("wc_clean.csv guardado en %s", path)
