import numpy as np
import pandas as pd
import pytest

from src.extractor import add_outcome, filter_world_cups


def make_df(tournaments, home_scores, away_scores):
    return pd.DataFrame({
        "date": pd.date_range("2020-01-01", periods=len(tournaments)),
        "home_team": ["A"] * len(tournaments),
        "away_team": ["B"] * len(tournaments),
        "home_score": home_scores,
        "away_score": away_scores,
        "tournament": tournaments,
        "neutral": [False] * len(tournaments),
    })


def test_filter_world_cups_keeps_only_wc():
    df = make_df(
        ["FIFA World Cup", "FIFA World Cup qualification", "Friendly"],
        [1, 2, 0], [0, 1, 0]
    )
    result = filter_world_cups(df)
    assert len(result) == 1
    assert result.iloc[0]["tournament"] == "FIFA World Cup"


def test_add_outcome_home_win():
    df = make_df(["FIFA World Cup"], [2], [1])
    result = add_outcome(df)
    assert result.iloc[0]["outcome"] == "home_win"


def test_add_outcome_away_win():
    df = make_df(["FIFA World Cup"], [0], [1])
    result = add_outcome(df)
    assert result.iloc[0]["outcome"] == "away_win"


def test_add_outcome_draw():
    df = make_df(["FIFA World Cup"], [1], [1])
    result = add_outcome(df)
    assert result.iloc[0]["outcome"] == "draw"
