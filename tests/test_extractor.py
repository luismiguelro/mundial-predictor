import numpy as np
import pandas as pd
import pytest

from src.extractor import (
    add_outcome,
    filter_world_cups,
    load_former_names,
    normalize_team_names,
)


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


def test_normalize_team_names_basic():
    df = make_df(["Friendly", "Friendly"], [1, 0], [0, 2])
    df.loc[0, "home_team"] = "Zaïre"
    df.loc[1, "away_team"] = "Czechoslovakia"
    result = normalize_team_names(df, {"Zaïre": "DR Congo", "Czechoslovakia": "Czech Republic"})
    assert result.loc[0, "home_team"] == "DR Congo"
    assert result.loc[1, "away_team"] == "Czech Republic"


def test_normalize_team_names_no_mutation():
    df = make_df(["Friendly"], [1], [0])
    df.loc[0, "home_team"] = "Zaïre"
    normalize_team_names(df, {"Zaïre": "DR Congo"})
    assert df.loc[0, "home_team"] == "Zaïre"  # el original no cambia


def test_load_former_names_resolves_chains(tmp_path):
    # CSV de muestra autocontenido: el dataset real (data/raw/*.csv) está
    # gitignored y no existe en CI, así que el test no debe depender de él.
    csv = tmp_path / "former_names.csv"
    csv.write_text(
        "former,current\n"
        "Netherlands Antilles,Curaçao\n"
        "Zaïre,DR Congo\n"
        "Soviet Union,Russia\n",
        encoding="utf-8",
    )
    mapping = load_former_names(csv)
    # cadena CSV + SUCCESSOR_MAP: Netherlands Antilles → Curaçao → Curacao
    assert mapping["Netherlands Antilles"] == "Curacao"
    assert mapping["Curaçao"] == "Curacao"          # SUCCESSOR_MAP
    assert mapping["Zaïre"] == "DR Congo"
    assert mapping["Czechoslovakia"] == "Czech Republic"  # SUCCESSOR_MAP
    assert mapping["Soviet Union"] == "Russia"
