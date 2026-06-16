"""Tests del modelo Dixon-Coles: invariantes de probabilidad y coherencia."""
import numpy as np
import pandas as pd
import pytest

from src.dixon_coles import DixonColesModel, tournament_importance


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


def test_tournament_importance():
    """Amistosos pesan menos que competiciones; el Mundial es el máximo."""
    assert tournament_importance("FIFA World Cup") == 1.0
    assert tournament_importance("Friendly") == 0.5
    assert tournament_importance("FIFA World Cup qualification") == 0.85
    assert tournament_importance("Friendly") < tournament_importance("Copa América")
    assert tournament_importance("Friendly") < tournament_importance("UEFA Euro")


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


def test_shrinkage_encoge_equipos_con_pocos_datos():
    """Un equipo goleador con pocos partidos queda más cerca de la media que
    el mismo perfil con muchos partidos (encogimiento empírico-bayesiano)."""
    rng = np.random.default_rng(1)
    base = pd.Timestamp("2021-01-01")
    rows = []
    # 'Big' juega mucho y golea; 'Small' golea igual pero con pocos partidos.
    pool = ["R1", "R2", "R3", "R4"]
    for i in range(300):
        opp = pool[i % len(pool)]
        rows.append({"date": base + pd.Timedelta(days=i), "home_team": "Big", "away_team": opp,
                     "home_score": 4, "away_score": 0, "neutral": True})
    for i in range(6):
        rows.append({"date": base + pd.Timedelta(days=i), "home_team": "Small", "away_team": pool[i % len(pool)],
                     "home_score": 4, "away_score": 0, "neutral": True})
    # relleno entre los rivales para que tengan historial
    for i in range(200):
        a, b = rng.choice(pool, 2, replace=False)
        rows.append({"date": base + pd.Timedelta(days=i), "home_team": a, "away_team": b,
                     "home_score": 1, "away_score": 1, "neutral": True})
    df = pd.DataFrame(rows)
    m = DixonColesModel(half_life_days=3650).fit(df, min_matches=5, shrinkage_k=20)
    # Ambos golean 4-0, pero 'Small' tiene muchos menos datos → más encogido a la media (0)
    assert m.attack["Small"] < m.attack["Big"]
