"""Modelo Dixon-Coles: predicción de goles unificada (marcador + 1X2).

A diferencia del clasificador 1X2 (que predice directamente local/empate/visitante
y rara vez elige "empate"), este modelo estima las *fuerzas de ataque y defensa* de
cada equipo y deriva una distribución de marcadores. De esa única matriz salen, de
forma coherente:

  - P(victoria local), P(empate), P(victoria visitante)   ← suma por zonas de la matriz
  - marcador más probable                                  ← argmax de la matriz

Referencia: Dixon & Coles (1997), "Modelling Association Football Scores and
Inefficiencies in the Football Betting Market". Incluye:
  - corrección ``rho`` para marcadores bajos (0-0, 1-0, 0-1, 1-1), donde el Poisson
    independiente subestima sistemáticamente los empates;
  - decaimiento temporal exponencial: los partidos recientes pesan más.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from scipy.optimize import minimize_scalar
from scipy.sparse import coo_matrix
from scipy.stats import poisson
from sklearn.linear_model import PoissonRegressor

ROOT = Path(__file__).resolve().parent.parent
DATA_PROCESSED = ROOT / "data" / "processed"
MODELS_DIR = ROOT / "models"

logger = logging.getLogger(__name__)

MAX_GOALS = 10  # truncamiento de la matriz de marcadores (P(>10 goles) ≈ 0)


def tournament_importance(name: str) -> float:
    """Peso por importancia del partido (similar al K-factor de FIFA/Elo).

    Un amistoso informa menos del nivel real que una eliminatoria o un Mundial,
    así que pesa menos al estimar las fuerzas de cada equipo.
    """
    t = str(name).lower()
    if "world cup" in t and "qualif" not in t:
        return 1.0                                  # fase final del Mundial
    if "qualif" in t:
        return 0.85                                 # eliminatorias
    if "nations league" in t:
        return 0.85
    if any(k in t for k in (
        "euro", "copa am", "cup of nations", "asian cup", "gold cup",
        "confederations", "finalissima",
    )):
        return 0.90                                 # fases finales continentales
    if "friendly" in t:
        return 0.50                                 # amistosos
    return 0.70                                     # otras competiciones


# ─── Corrección de dependencia de Dixon-Coles ────────────────────────────────

def _tau(h: np.ndarray, a: np.ndarray, lh: np.ndarray, la: np.ndarray, rho: float) -> np.ndarray:
    """Factor de corrección τ para los cuatro marcadores bajos.

    Ajusta la probabilidad conjunta de (0-0, 1-0, 0-1, 1-1) que el Poisson
    independiente modela mal — justamente los marcadores donde se concentran
    los empates y los partidos cerrados.
    """
    out = np.ones_like(lh, dtype=float)
    m00 = (h == 0) & (a == 0)
    m10 = (h == 1) & (a == 0)
    m01 = (h == 0) & (a == 1)
    m11 = (h == 1) & (a == 1)
    out[m00] = 1.0 - lh[m00] * la[m00] * rho
    out[m10] = 1.0 + la[m10] * rho
    out[m01] = 1.0 + lh[m01] * rho
    out[m11] = 1.0 - rho
    return out


class DixonColesModel:
    """Modelo de fuerzas de equipo entrenado por máxima verosimilitud.

    Parámetros del modelo:
      attack[t], defense[t] — fuerza ofensiva/defensiva de cada equipo
      home_adv (γ)          — ventaja de jugar en casa (0 en sede neutral)
      rho (ρ)               — corrección de dependencia para marcadores bajos
    """

    def __init__(self, half_life_days: float = 730.0, max_goals: int = MAX_GOALS):
        self.half_life_days = half_life_days
        self.max_goals = max_goals
        self.teams: List[str] = []
        self.team_idx: Dict[str, int] = {}
        self.attack: Dict[str, float] = {}
        self.defense: Dict[str, float] = {}   # tendencia a CONCEDER (alto = peor defensa)
        self.base: float = 0.0                # intercepto (log de la tasa base de goles)
        self.home_adv: float = 0.25
        self.rho: float = -0.05
        # fuerzas medias (fallback para equipos sin/poco historial)
        self._default_attack: float = 0.0
        self._default_defense: float = 0.0

    # ── Entrenamiento ────────────────────────────────────────────────────────

    def fit(
        self,
        df: pd.DataFrame,
        ref_date: Optional[pd.Timestamp] = None,
        min_matches: int = 5,
        alpha: float = 1e-4,
        shrinkage_k: float = 15.0,
    ) -> "DixonColesModel":
        """Ajusta el modelo sobre partidos con marcador.

        df debe tener columnas: date, home_team, away_team, home_score,
        away_score, neutral. ref_date es la fecha respecto a la cual se calcula
        el decaimiento temporal (por defecto, la más reciente del df).

        Estrategia (rápida y siempre convergente):
          1. Las fuerzas (ataque/defensa/ventaja local) se estiman con una
             regresión de Poisson ponderada — el modelo base de Dixon-Coles es
             un GLM, así que esto se resuelve por IRLS en segundos.
          2. Encogimiento empírico-bayesiano: las fuerzas se acercan a la media
             según cuántos partidos tiene cada equipo, w = n/(n+shrinkage_k).
             Un equipo con pocos datos (p.ej. Curazao) se trata casi como
             promedio; uno con muchos conserva su fuerza estimada.
          3. La corrección ``rho`` (4 marcadores bajos) se estima después con
             una optimización 1-D, manteniendo las fuerzas fijas.
        """
        df = df.dropna(subset=["home_score", "away_score"]).copy()
        df["home_score"] = df["home_score"].astype(int)
        df["away_score"] = df["away_score"].astype(int)

        if ref_date is None:
            ref_date = df["date"].max()

        # Equipos con suficientes partidos en la ventana; el resto comparte
        # un perfil "promedio" para no inflar la dimensionalidad con ruido.
        counts: Dict[str, int] = {}
        for t in pd.concat([df["home_team"], df["away_team"]]):
            counts[t] = counts.get(t, 0) + 1
        self.teams = sorted(t for t, c in counts.items() if c >= min_matches)
        self.team_idx = {t: i for i, t in enumerate(self.teams)}
        n = len(self.teams)

        # Filtra a partidos entre equipos modelados
        mask = df["home_team"].isin(self.team_idx) & df["away_team"].isin(self.team_idx)
        df = df[mask]
        logger.info("Dixon-Coles: %d equipos (>= %d partidos) sobre %d partidos",
                    n, min_matches, len(df))

        hi = df["home_team"].map(self.team_idx).to_numpy()
        ai = df["away_team"].map(self.team_idx).to_numpy()
        hg = df["home_score"].to_numpy()
        ag = df["away_score"].to_numpy()
        neutral = df["neutral"].astype(bool).to_numpy() if "neutral" in df else np.zeros(len(df), bool)
        m = len(df)

        # Pesos por decaimiento temporal exponencial: w = 0.5 ** (Δdías / half_life)
        age_days = (ref_date - df["date"]).dt.days.to_numpy().astype(float)
        xi = np.log(2.0) / self.half_life_days
        weights = np.exp(-xi * age_days)

        # × peso por importancia del partido (amistosos < competiciones)
        if "tournament" in df.columns:
            weights = weights * df["tournament"].map(tournament_importance).fillna(0.70).to_numpy()

        # ── 1. GLM de Poisson ponderado ──────────────────────────────────────
        # Dos observaciones por partido (goles del local / del visitante).
        # Columnas: [attack_0..n-1, defense_0..n-1, home_adv]
        #   goles del local      = base + attack[local] + defense[visit] + home_adv·(no neutral)
        #   goles del visitante  = base + attack[visit] + defense[local]
        n_cols = 2 * n + 1
        rows, cols, vals = [], [], []

        def _add(obs, atk_idx, def_idx, home_val):
            rows.extend([obs, obs]); cols.extend([atk_idx, n + def_idx]); vals.extend([1.0, 1.0])
            if home_val:
                rows.append(obs); cols.append(2 * n); vals.append(1.0)

        for r in range(m):
            _add(r, hi[r], ai[r], not neutral[r])      # goles del local
            _add(m + r, ai[r], hi[r], False)           # goles del visitante

        X = coo_matrix((vals, (rows, cols)), shape=(2 * m, n_cols)).tocsr()
        y = np.concatenate([hg, ag])
        sw = np.concatenate([weights, weights])

        glm = PoissonRegressor(alpha=alpha, fit_intercept=True, max_iter=2000, tol=1e-8)
        glm.fit(X, y, sample_weight=sw)

        coef = glm.coef_
        attack = coef[:n]
        defense = coef[n:2 * n]
        # Identificabilidad: ataque centrado; el desplazamiento va al intercepto.
        atk_mean = attack.mean()
        attack = attack - atk_mean
        self.base = float(glm.intercept_ + atk_mean)

        # Encogimiento hacia la media según nº de partidos: w = n/(n+k).
        # El ataque está centrado en 0 → encoge hacia 0; la defensa hacia su media.
        n_matches = np.bincount(hi, minlength=n) + np.bincount(ai, minlength=n)
        w = n_matches / (n_matches + shrinkage_k)
        def_mean = float(defense.mean())
        attack = attack * w
        defense = def_mean + w * (defense - def_mean)

        self.attack = {t: float(attack[i]) for t, i in self.team_idx.items()}
        self.defense = {t: float(defense[i]) for t, i in self.team_idx.items()}
        self.home_adv = float(coef[2 * n])
        self._default_attack = 0.0
        self._default_defense = def_mean

        # ── 2. Corrección rho (optimización 1-D, fuerzas fijas) ──────────────
        log_lh = self.base + attack[hi] + defense[ai] + self.home_adv * (~neutral)
        log_la = self.base + attack[ai] + defense[hi]
        lh = np.exp(log_lh)
        la = np.exp(log_la)

        def neg_ll_rho(rho: float) -> float:
            tau = _tau(hg, ag, lh, la, rho)
            tau = np.clip(tau, 1e-10, None)
            return -np.sum(weights * np.log(tau))

        res = minimize_scalar(neg_ll_rho, bounds=(-0.2, 0.2), method="bounded")
        self.rho = float(res.x)

        logger.info("DC ajustado — base=%.3f home_adv=%.3f rho=%.3f",
                    self.base, self.home_adv, self.rho)
        return self

    # ── Predicción ─────────────────────────────────────────────────────────────

    def _lambdas(self, home: str, away: str, neutral: bool = True) -> Tuple[float, float]:
        """Goles esperados (λ) de local y visitante.

        defense[t] es tendencia a CONCEDER (alto = peor defensa), por lo que
        suma en el λ del rival.
        """
        ah = self.attack.get(home, self._default_attack)
        dh = self.defense.get(home, self._default_defense)
        aa = self.attack.get(away, self._default_attack)
        da = self.defense.get(away, self._default_defense)
        adv = 0.0 if neutral else self.home_adv
        lh = np.exp(self.base + ah + da + adv)
        la = np.exp(self.base + aa + dh)
        return float(lh), float(la)

    def score_matrix(self, home: str, away: str, neutral: bool = True) -> np.ndarray:
        """Matriz P[i, j] = P(local marca i, visitante marca j), con corrección DC."""
        lh, la = self._lambdas(home, away, neutral)
        k = np.arange(self.max_goals + 1)
        ph = poisson.pmf(k, lh)
        pa = poisson.pmf(k, la)
        mat = np.outer(ph, pa)
        # Corrección de Dixon-Coles en las 4 celdas bajas
        mat[0, 0] *= 1.0 - lh * la * self.rho
        mat[1, 0] *= 1.0 + la * self.rho
        mat[0, 1] *= 1.0 + lh * self.rho
        mat[1, 1] *= 1.0 - self.rho
        mat /= mat.sum()  # renormaliza tras la corrección
        return mat

    def predict_1x2(self, home: str, away: str, neutral: bool = True) -> Dict[str, float]:
        """Probabilidades {home_win, draw, away_win} desde la matriz de marcadores."""
        mat = self.score_matrix(home, away, neutral)
        home_win = float(np.tril(mat, -1).sum())  # i > j
        draw = float(np.trace(mat))               # i == j
        away_win = float(np.triu(mat, 1).sum())   # i < j
        return {"home_win": home_win, "draw": draw, "away_win": away_win}

    def most_likely_score(self, home: str, away: str, neutral: bool = True) -> Tuple[int, int]:
        """Marcador más probable (argmax de la matriz) — coherente con predict_1x2."""
        mat = self.score_matrix(home, away, neutral)
        i, j = np.unravel_index(int(mat.argmax()), mat.shape)
        return int(i), int(j)

    def expected_goals(self, home: str, away: str, neutral: bool = True) -> Tuple[float, float]:
        return self._lambdas(home, away, neutral)

    # ── Serialización ────────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        return {
            "attack": self.attack,
            "defense": self.defense,
            "base": self.base,
            "home_adv": self.home_adv,
            "rho": self.rho,
            "half_life_days": self.half_life_days,
            "max_goals": self.max_goals,
            "default_attack": self._default_attack,
            "default_defense": self._default_defense,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "DixonColesModel":
        m = cls(half_life_days=d.get("half_life_days", 730.0),
                max_goals=d.get("max_goals", MAX_GOALS))
        m.attack = d["attack"]
        m.defense = d["defense"]
        m.base = d.get("base", 0.0)
        m.home_adv = d["home_adv"]
        m.rho = d["rho"]
        m._default_attack = d.get("default_attack", 0.0)
        m._default_defense = d.get("default_defense", 0.0)
        m.teams = sorted(m.attack)
        m.team_idx = {t: i for i, t in enumerate(m.teams)}
        return m

    def save(self, path: Path = MODELS_DIR / "dixon_coles.json") -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self.to_dict(), ensure_ascii=False, indent=2),
                        encoding="utf-8")
        logger.info("Dixon-Coles guardado en %s", path)

    @classmethod
    def load(cls, path: Path = MODELS_DIR / "dixon_coles.json") -> "DixonColesModel":
        return cls.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))


# ─── Entrenamiento / evaluación de alto nivel ────────────────────────────────

_LABELS = ["home_win", "draw", "away_win"]


def _outcome(hs: int, as_: int) -> str:
    return "home_win" if hs > as_ else ("draw" if hs == as_ else "away_win")


def train_dixon_coles(
    df_all: pd.DataFrame,
    since: str = "2014-01-01",
    half_life_days: float = 730.0,
    ref_date: Optional[pd.Timestamp] = None,
) -> "DixonColesModel":
    """Entrena un modelo de producción sobre los partidos recientes con marcador."""
    df = df_all.dropna(subset=["home_score", "away_score"]).copy()
    df = df[df["date"] >= since]
    if ref_date is None:
        ref_date = df["date"].max()
    return DixonColesModel(half_life_days=half_life_days).fit(df, ref_date=ref_date)


def evaluate_dixon_coles(
    model: "DixonColesModel",
    df_test: pd.DataFrame,
    neutral: bool = True,
) -> dict:
    """Métricas 1X2 (accuracy, log_loss, brier) + matriz de confusión y empates."""
    df = df_test.dropna(subset=["home_score", "away_score"])
    y_true, y_pred, probas = [], [], []
    for _, r in df.iterrows():
        h, a = r["home_team"], r["away_team"]
        if h not in model.attack or a not in model.attack:
            continue
        p = model.predict_1x2(h, a, neutral=neutral)
        vec = [p["home_win"], p["draw"], p["away_win"]]
        probas.append(vec)
        y_pred.append(_LABELS[int(np.argmax(vec))])
        y_true.append(_outcome(int(r["home_score"]), int(r["away_score"])))

    probas = np.array(probas)
    y_true = np.array(y_true)
    y_pred = np.array(y_pred)
    idx = {l: i for i, l in enumerate(_LABELS)}
    yt = np.array([idx[y] for y in y_true])
    eps = 1e-15

    cm = {
        tl: {pl: int(((y_true == tl) & (y_pred == pl)).sum()) for pl in _LABELS}
        for tl in _LABELS
    }
    return {
        "accuracy": round(float((y_true == y_pred).mean()), 4),
        "log_loss": round(float(-np.mean(np.log(probas[np.arange(len(yt)), yt] + eps))), 4),
        "brier_mean": round(float(np.mean(
            [np.sum((probas[i] - np.eye(3)[yt[i]]) ** 2) for i in range(len(yt))]
        ) / 3), 4),
        "n_test": int(len(yt)),
        "draws_expected": round(float(probas[:, 1].sum()), 1),
        "confusion_matrix": cm,
    }
