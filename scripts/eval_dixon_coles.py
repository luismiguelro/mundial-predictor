"""Evalúa Dixon-Coles vs el clasificador XGBoost en el mismo split temporal.

Test = fase final del Mundial 2022 (Qatar). Reporta accuracy, log_loss, brier,
matriz de confusión y — el punto clave — cuántos empates predice cada modelo y
qué variedad de marcadores produce.

Uso: python scripts/eval_dixon_coles.py
"""
import logging
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Windows: fuerza stdout UTF-8 para imprimir símbolos sin romper en cp1252
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import numpy as np
import pandas as pd

from src.dixon_coles import DixonColesModel
from src.extractor import load_results

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("eval_dc")

LABELS = ["home_win", "draw", "away_win"]
WC2022_START = pd.Timestamp("2022-11-20")
WC2022_END = pd.Timestamp("2022-12-18")


def outcome(hs: int, as_: int) -> str:
    return "home_win" if hs > as_ else ("draw" if hs == as_ else "away_win")


def main() -> None:
    df = load_results()  # nombres normalizados
    df = df.dropna(subset=["home_score", "away_score"]).copy()
    df["home_score"] = df["home_score"].astype(int)
    df["away_score"] = df["away_score"].astype(int)

    # Test: partidos del Mundial 2022. Train: TODO lo anterior al torneo.
    test = df[
        (df["tournament"] == "FIFA World Cup")
        & (df["date"] >= WC2022_START)
        & (df["date"] <= WC2022_END)
    ].copy()
    train = df[df["date"] < WC2022_START].copy()
    # Ventana de entrenamiento: últimos ~12 años (suficiente señal, menos ruido viejo)
    train = train[train["date"] >= "2010-01-01"]

    logger.info("Train: %d partidos | Test (WC2022): %d partidos", len(train), len(test))

    model = DixonColesModel(half_life_days=730).fit(train, ref_date=WC2022_START)

    # ── Predicciones sobre el test (todos en sede neutral) ───────────────────
    y_true, y_pred, probas = [], [], []
    score_preds = []
    n_modeled = 0
    for _, r in test.iterrows():
        h, a = r["home_team"], r["away_team"]
        if h not in model.attack or a not in model.attack:
            continue
        n_modeled += 1
        p = model.predict_1x2(h, a, neutral=True)
        probas.append([p["home_win"], p["draw"], p["away_win"]])
        y_pred.append(LABELS[int(np.argmax([p["home_win"], p["draw"], p["away_win"]]))])
        y_true.append(outcome(r["home_score"], r["away_score"]))
        score_preds.append(model.most_likely_score(h, a, neutral=True))

    probas = np.array(probas)
    y_true = np.array(y_true)
    y_pred = np.array(y_pred)

    # ── Métricas ──────────────────────────────────────────────────────────────
    acc = float((y_true == y_pred).mean())
    idx = {l: i for i, l in enumerate(LABELS)}
    yt_idx = np.array([idx[y] for y in y_true])
    eps = 1e-15
    ll = float(-np.mean(np.log(probas[np.arange(len(yt_idx)), yt_idx] + eps)))
    brier = float(np.mean([
        np.sum((probas[i] - np.eye(3)[yt_idx[i]]) ** 2) for i in range(len(yt_idx))
    ]) / 3)

    print("\n" + "=" * 60)
    print(f"DIXON-COLES — Test Mundial 2022 ({n_modeled} partidos)")
    print("=" * 60)
    print(f"  accuracy : {acc:.4f}")
    print(f"  log_loss : {ll:.4f}")
    print(f"  brier    : {brier:.4f}")

    # Matriz de confusión
    print("\n  Matriz de confusión (filas=real, cols=predicho):")
    print(f"  {'':>10}{'home':>8}{'draw':>8}{'away':>8}")
    for tl in LABELS:
        row = [int(((y_true == tl) & (y_pred == pl)).sum()) for pl in LABELS]
        print(f"  {tl:>10}{row[0]:>8}{row[1]:>8}{row[2]:>8}")

    # Empates
    n_draw_real = int((y_true == "draw").sum())
    n_draw_pred = int((y_pred == "draw").sum())
    draw_hits = int(((y_true == "draw") & (y_pred == "draw")).sum())
    exp_draws = float(probas[:, 1].sum())
    print(f"\n  Empates reales        : {n_draw_real}")
    print(f"  Empates predichos (moda): {n_draw_pred}")
    print(f"  Empates acertados     : {draw_hits}  (recall empate = "
          f"{draw_hits / n_draw_real:.0%})" if n_draw_real else "")
    print(f"  Empates ESPERADOS (ΣP): {exp_draws:.1f} / {n_modeled} "
          f"({exp_draws / n_modeled:.1%})")

    # Variedad de marcadores
    sc = Counter(f"{i}-{j}" for i, j in score_preds)
    n_score_draw = sum(c for (i, j), c in
                       Counter(tuple(s) for s in score_preds).items() if i == j)
    print(f"\n  Variedad de marcadores más probables ({len(sc)} distintos):")
    for s, c in sc.most_common(8):
        print(f"    {s}: {c}")
    print(f"  Marcadores más probables que son EMPATE (p.ej. 1-1): "
          f"{n_score_draw} / {n_modeled} ({n_score_draw / n_modeled:.0%})")

    print("\n  Referencia XGBoost calibrado (metrics.json): "
          "acc=0.50, empates predichos=1, recall empate=0%")


if __name__ == "__main__":
    main()
