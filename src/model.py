"""Entrenamiento, evaluación y serialización del modelo XGBoost calibrado."""
import json
import logging
from pathlib import Path
from typing import Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import accuracy_score, log_loss
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

ROOT = Path(__file__).parent.parent
DATA_PROCESSED = ROOT / "data" / "processed"
MODELS_DIR = ROOT / "models"

logger = logging.getLogger(__name__)

LABEL_MAP = {"home_win": 0, "draw": 1, "away_win": 2}
FEATURE_COLS = [
    "elo_diff", "elo_home", "elo_away",
    "h2h_home_win_pct", "is_neutral", "wc_experience_diff",
]


def temporal_split(df: pd.DataFrame, test_year: int = 2022) -> Tuple[pd.DataFrame, pd.DataFrame]:
    train = df[df["year"] < test_year].copy()
    test = df[df["year"] == test_year].copy()
    logger.info("Train: %d filas | Test (%d): %d filas", len(train), test_year, len(test))
    return train, test


def build_pipeline() -> Pipeline:
    xgb = XGBClassifier(
        objective="multi:softprob",
        num_class=3,
        n_estimators=200,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        eval_metric="mlogloss",
    )
    return Pipeline([("scaler", StandardScaler()), ("xgb", xgb)])


def train(
    df_train: pd.DataFrame,
    calibrate: bool = True,
) -> CalibratedClassifierCV | Pipeline:
    X = df_train[FEATURE_COLS]
    y = df_train["outcome"].map(LABEL_MAP)

    pipeline = build_pipeline()

    if calibrate:
        model = CalibratedClassifierCV(pipeline, cv=5, method="isotonic")
    else:
        model = pipeline

    model.fit(X, y)
    logger.info("Modelo entrenado (%s calibración)", "con" if calibrate else "sin")
    return model


def evaluate(model, df_test: pd.DataFrame) -> dict:
    X = df_test[FEATURE_COLS]
    y_true = df_test["outcome"].map(LABEL_MAP)
    y_pred = model.predict(X)
    y_proba = model.predict_proba(X)

    metrics = {
        "accuracy": round(accuracy_score(y_true, y_pred), 4),
        "log_loss": round(log_loss(y_true, y_proba), 4),
        "n_test": len(df_test),
    }
    logger.info("Métricas: %s", metrics)
    return metrics


def save_model(model, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, path)
    logger.info("Modelo guardado en %s", path)


def save_metrics(metrics: dict, path: Path = DATA_PROCESSED / "metrics.json") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = {}
    if path.exists():
        with open(path) as f:
            existing = json.load(f)
    existing.update(metrics)
    with open(path, "w") as f:
        json.dump(existing, f, indent=2)
    logger.info("Métricas guardadas en %s", path)


def load_model(path: Path = MODELS_DIR / "xgb_calibrated.pkl"):
    return joblib.load(path)
