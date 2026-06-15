"""Tests del modelo Dixon-Coles: invariantes de probabilidad y coherencia."""
import numpy as np
import pandas as pd
import pytest

from src.dixon_coles import DixonColesModel


@pytest.fixture
def model() -> DixonColesModel:
    """Modelo determinista con parámetros conocidos (sin entrenar)."""
    return DixonColesModel.from_dict({
        "attack": {"Strong": 0.6, "Weak": -0.6, "Mid": 0.0},
        "defense": {"Strong": -0.5, "Weak": 0.5, "Mid": 0.0},
        "base": 0.1,
        "home_adv": 0.25,
        "rho": -0.05,
        "default_attack": 0.0,
        "default_defense": 0.0,
    })


def test_1x2_suma_uno(model):
    p = model.predict_1x2("Strong", "Weak", neutral=True)
    assert abs(p["home_win"] + p["draw"] + p["away_win"] - 1.0) < 1e-9


def test_score_matrix_normalizada(model):
    mat = model.score_matrix("Mid", "Mid", neutral=True)
    assert abs(mat.sum() - 1.0) < 1e-9


def test_favorito_mayor_probabilidad(model):
    p = model.predict_1x2("Strong", "Weak", neutral=True)
    assert p["home_win"] > p["away_win"]
    assert p["home_win"] > p["draw"]


def test_simetria_al_invertir(model):
    """Invertir local/visitante en sede neutral debe reflejar las probabilidades."""
    p = model.predict_1x2("Strong", "Weak", neutral=True)
    q = model.predict_1x2("Weak", "Strong", neutral=True)
    assert abs(p["home_win"] - q["away_win"]) < 1e-9
    assert abs(p["draw"] - q["draw"]) < 1e-9


def test_partido_parejo_empate_destacado(model):
    """Entre iguales en sede neutral, el empate es la opción individual más fuerte."""
    p = model.predict_1x2("Mid", "Mid", neutral=True)
    assert abs(p["home_win"] - p["away_win"]) < 1e-9
    sh, sa = model.most_likely_score("Mid", "Mid", neutral=True)
    assert sh == sa  # marcador más probable es un empate


def test_ventaja_local_aumenta_lambda(model):
    lh_n, _ = model.expected_goals("Mid", "Mid", neutral=True)
    lh_h, _ = model.expected_goals("Mid", "Mid", neutral=False)
    assert lh_h > lh_n


def test_serializacion_ida_y_vuelta(model):
    d = model.to_dict()
    m2 = DixonColesModel.from_dict(d)
    p1 = model.predict_1x2("Strong", "Mid", neutral=True)
    p2 = m2.predict_1x2("Strong", "Mid", neutral=True)
    assert p1 == p2


def test_fit_basico():
    """El ajuste corre y produce parámetros usables sobre datos sintéticos."""
    rng = np.random.default_rng(0)
    teams = ["A", "B", "C", "D"]
    rows = []
    base = pd.Timestamp("2020-01-01")
    for i in range(400):
        h, a = rng.choice(teams, 2, replace=False)
        rows.append({
            "date": base + pd.Timedelta(days=i),
            "home_team": h, "away_team": a,
            "home_score": int(rng.poisson(1.4)),
            "away_score": int(rng.poisson(1.1)),
            "neutral": False,
        })
    df = pd.DataFrame(rows)
    m = DixonColesModel(half_life_days=730).fit(df, min_matches=5)
    assert set(m.attack) == set(teams)
    p = m.predict_1x2("A", "B", neutral=True)
    assert abs(sum(p.values()) - 1.0) < 1e-9
