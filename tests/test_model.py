import numpy as np
import pandas as pd
import pytest

from src.model import LABEL_MAP, temporal_split


def _make_features():
    rows = []
    for year in [2014, 2018, 2022]:
        for _ in range(5):
            rows.append({
                "year": year,
                "elo_diff": np.random.randn() * 100,
                "elo_home": 1500,
                "elo_away": 1500,
                "h2h_home_win_pct": 0.5,
                "is_neutral": 1,
                "wc_experience_diff": 0,
                "outcome": np.random.choice(list(LABEL_MAP.keys())),
            })
    return pd.DataFrame(rows)


def test_temporal_split_no_leakage():
    df = _make_features()
    train, test = temporal_split(df, test_year=2022)
    assert train["year"].max() < 2022
    assert (test["year"] == 2022).all()


def test_temporal_split_sizes():
    df = _make_features()
    train, test = temporal_split(df, test_year=2022)
    assert len(train) + len(test) == len(df)


def test_label_map_covers_all_outcomes():
    assert set(LABEL_MAP.keys()) == {"home_win", "draw", "away_win"}
    assert set(LABEL_MAP.values()) == {0, 1, 2}
