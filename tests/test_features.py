import pandas as pd
import pytest

from src.features import INITIAL_ELO, compute_elo_ratings, expected_score, update_elo


def test_expected_score_equal_ratings():
    assert expected_score(1500, 1500) == pytest.approx(0.5)


def test_expected_score_higher_rating_wins():
    assert expected_score(1600, 1500) > 0.5


def test_update_elo_increases_on_win():
    new = update_elo(1500, 0.5, 1.0)
    assert new > 1500


def test_update_elo_decreases_on_loss():
    new = update_elo(1500, 0.5, 0.0)
    assert new < 1500


def _make_results():
    return pd.DataFrame({
        "date": pd.to_datetime(["2020-01-01", "2020-06-01"]),
        "home_team": ["A", "B"],
        "away_team": ["B", "A"],
        "home_score": [2, 1],
        "away_score": [0, 2],
        "neutral": [False, False],
    })


def test_compute_elo_starts_at_initial():
    df = _make_results()
    result, _ = compute_elo_ratings(df)
    assert result.iloc[0]["elo_home"] == INITIAL_ELO
    assert result.iloc[0]["elo_away"] == INITIAL_ELO


def test_compute_elo_diff_column_exists():
    df = _make_results()
    result, _ = compute_elo_ratings(df)
    assert "elo_diff" in result.columns


def test_compute_elo_returns_ratings_dict():
    df = _make_results()
    _, ratings = compute_elo_ratings(df)
    assert isinstance(ratings, dict)
    assert "A" in ratings and "B" in ratings


def test_compute_elo_skips_nan_scores():
    df = _make_results().copy()
    df.loc[0, "home_score"] = float("nan")
    result, ratings = compute_elo_ratings(df)
    # primer partido sin resultado: ELOs se registran pero ratings no cambian
    assert result.iloc[0]["elo_home"] == INITIAL_ELO
    assert result.iloc[1]["elo_home"] == INITIAL_ELO  # A no fue actualizado
