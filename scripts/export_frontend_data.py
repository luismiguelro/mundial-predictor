"""
Exporta todos los datos del modelo a JSON para consumo del frontend Next.js.
Uso: python scripts/export_frontend_data.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import numpy as np
import pandas as pd

from src.dixon_coles import DixonColesModel, train_dixon_coles
from src.extractor import load_results, load_shootouts
from src.simulator import (
    WC2026_GROUPS,
    WC2026_TEAMS,
    build_shootout_stats,
    build_team_stats,
)

DATA_PROCESSED = ROOT / "data" / "processed"
DATA_RAW = ROOT / "data" / "raw"
DATA_EXTERNAL = ROOT / "data" / "external"
OUT_DIR = ROOT / "frontend" / "public" / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)

FIXTURE_NAME_MAP = {
    "Bosnia & Herzegovina": "Bosnia and Herzegovina",
    "USA": "United States",
    "Curaçao": "Curacao",
}

# Anfitriones 2026: juegan sus partidos de grupo en casa → ventaja de localía.
HOSTS = {"Mexico", "Canada", "United States"}


def _poisson(rng, lam):
    """Muestrea Poisson(lam) con el rng dado (algoritmo de Knuth, seed estable)."""
    import math
    L = math.exp(-lam)
    k, p = 0, 1.0
    while True:
        k += 1
        p *= rng.random()
        if p <= L:
            return k - 1


def _lambdas(preds, t1, t2):
    """Goles esperados (λ) orientados a (t1, t2) desde predictions."""
    d = preds.get(f"{t1}|{t2}")
    if d and d.get("exp_home") is not None:
        return d["exp_home"], d["exp_away"]
    r = preds.get(f"{t2}|{t1}")
    if r and r.get("exp_home") is not None:
        return r["exp_away"], r["exp_home"]
    return 1.3, 1.3


def _sim_group_once(teams, preds, elos, rng, hosts=None, host_boost=1.0):
    """Una iteración de grupo: muestrea marcadores (Poisson con λ del modelo) y
    ordena por desempates FIFA (puntos → dif. de goles → goles a favor → ELO).
    Los anfitriones reciben ventaja de localía en sus partidos de grupo."""
    hosts = hosts or set()
    pts = {t: 0 for t in teams}
    gf = {t: 0 for t in teams}
    ga = {t: 0 for t in teams}
    for i in range(len(teams)):
        for j in range(i + 1, len(teams)):
            t1, t2 = teams[i], teams[j]
            l1, l2 = _lambdas(preds, t1, t2)
            if t1 in hosts: l1 *= host_boost
            if t2 in hosts: l2 *= host_boost
            g1, g2 = _poisson(rng, l1), _poisson(rng, l2)
            gf[t1] += g1; ga[t1] += g2
            gf[t2] += g2; ga[t2] += g1
            if g1 > g2:
                pts[t1] += 3
            elif g1 < g2:
                pts[t2] += 3
            else:
                pts[t1] += 1; pts[t2] += 1
    return sorted(
        teams,
        key=lambda t: (-pts[t], -(gf[t] - ga[t]), -gf[t], -elos.get(t, 1500)),
    )


def compute_group_standings(preds, groups, elos, n=5000, hosts=None, host_boost=1.0):
    """Monte Carlo: P(1st/2nd/3rd/4th) por equipo en cada grupo. Seed fijo."""
    import random
    rng = random.Random(42)
    result = {}
    for grp, teams in groups.items():
        counts = {t: [0, 0, 0, 0] for t in teams}
        for _ in range(n):
            order = _sim_group_once(teams, preds, elos, rng, hosts, host_boost)
            for pos, t in enumerate(order):
                counts[t][pos] += 1
        rows = sorted(
            [
                {
                    "team": t,
                    "flag": TEAM_FLAGS.get(t, "🏳️"),
                    "first":  round(counts[t][0] / n, 4),
                    "second": round(counts[t][1] / n, 4),
                    "third":  round(counts[t][2] / n, 4),
                    "fourth": round(counts[t][3] / n, 4),
                }
                for t in teams
            ],
            key=lambda x: -x["first"],
        )
        result[grp] = rows
    return result

TEAM_FLAGS = {
    "Argentina": "🇦🇷", "Brazil": "🇧🇷", "Colombia": "🇨🇴", "Uruguay": "🇺🇾",
    "Ecuador": "🇪🇨", "Venezuela": "🇻🇪", "Chile": "🇨🇱", "Peru": "🇵🇪",
    "Paraguay": "🇵🇾", "Bolivia": "🇧🇴",
    "Mexico": "🇲🇽", "United States": "🇺🇸", "Canada": "🇨🇦",
    "Panama": "🇵🇦", "Honduras": "🇭🇳", "Costa Rica": "🇨🇷",
    "Spain": "🇪🇸", "France": "🇫🇷", "Germany": "🇩🇪", "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    "Portugal": "🇵🇹", "Italy": "🇮🇹", "Netherlands": "🇳🇱", "Belgium": "🇧🇪",
    "Croatia": "🇭🇷", "Switzerland": "🇨🇭", "Denmark": "🇩🇰", "Serbia": "🇷🇸",
    "Turkey": "🇹🇷", "Romania": "🇷🇴", "Bosnia and Herzegovina": "🇧🇦",
    "Scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "South Africa": "🇿🇦", "Georgia": "🇬🇪",
    "Morocco": "🇲🇦", "Senegal": "🇸🇳", "Nigeria": "🇳🇬", "Ivory Coast": "🇨🇮",
    "Ghana": "🇬🇭", "Cameroon": "🇨🇲", "Algeria": "🇩🇿", "Tunisia": "🇹🇳",
    "DR Congo": "🇨🇩", "Cape Verde": "🇨🇻", "Egypt": "🇪🇬", "Haiti": "🇭🇹",
    "Qatar": "🇶🇦", "Japan": "🇯🇵", "South Korea": "🇰🇷", "Iran": "🇮🇷",
    "Saudi Arabia": "🇸🇦", "Australia": "🇦🇺", "Uzbekistan": "🇺🇿",
    "Iraq": "🇮🇶", "Jordan": "🇯🇴", "New Zealand": "🇳🇿",
    "Curacao": "🇨🇼", "Czech Republic": "🇨🇿", "Sweden": "🇸🇪",
    "Norway": "🇳🇴", "Austria": "🇦🇹",
}

CONFEDERATION_MAP = {
    "Mexico": "CONCACAF", "United States": "CONCACAF", "Canada": "CONCACAF",
    "Panama": "CONCACAF", "Honduras": "CONCACAF", "Costa Rica": "CONCACAF",
    "Haiti": "CONCACAF", "Curacao": "CONCACAF",
    "Colombia": "CONMEBOL", "Argentina": "CONMEBOL", "Brazil": "CONMEBOL",
    "Uruguay": "CONMEBOL", "Ecuador": "CONMEBOL", "Venezuela": "CONMEBOL",
    "Chile": "CONMEBOL", "Peru": "CONMEBOL", "Paraguay": "CONMEBOL",
    "Spain": "UEFA", "France": "UEFA", "Germany": "UEFA", "England": "UEFA",
    "Portugal": "UEFA", "Italy": "UEFA", "Netherlands": "UEFA", "Belgium": "UEFA",
    "Croatia": "UEFA", "Switzerland": "UEFA", "Denmark": "UEFA", "Serbia": "UEFA",
    "Turkey": "UEFA", "Romania": "UEFA", "Bosnia and Herzegovina": "UEFA",
    "Scotland": "UEFA", "Sweden": "UEFA", "Norway": "UEFA", "Austria": "UEFA",
    "Czech Republic": "UEFA", "Georgia": "UEFA",
    "Morocco": "CAF", "Senegal": "CAF", "Nigeria": "CAF", "Ivory Coast": "CAF",
    "Ghana": "CAF", "Cameroon": "CAF", "Algeria": "CAF", "Tunisia": "CAF",
    "DR Congo": "CAF", "Cape Verde": "CAF", "Egypt": "CAF", "South Africa": "CAF",
    "Japan": "AFC", "South Korea": "AFC", "Iran": "AFC", "Saudi Arabia": "AFC",
    "Australia": "AFC", "Uzbekistan": "AFC", "Iraq": "AFC", "Jordan": "AFC",
    "Qatar": "AFC",
    "New Zealand": "OFC",
}


def _parse_slot(s: str) -> dict:
    """Convierte un placeholder del fixture en un slot resoluble.

    '1A' → ganador del grupo A · '2B' → segundo del grupo B
    '3A/B/C/D/F' → mejor tercero de uno de esos grupos
    """
    s = s.strip()
    if s and s[0] in "12" and len(s) >= 2:
        return {"type": "pos", "pos": int(s[0]) - 1, "group": s[1:]}
    if s.startswith("3"):
        return {"type": "third", "groups": s[1:].split("/")}
    return {"type": "raw", "value": s}


def parse_bracket(fixture_raw: dict) -> dict:
    """Extrae el cuadro eliminatorio del fixture oficial.

    r32: 16 cruces con slots de posición de grupo / mejor tercero.
    ko:  R16 → Final, cada cruce referencia ganadores por número ('W74').
    El partido por el tercer puesto se omite (no está en el camino al título).
    """
    KO = {"Round of 32", "Round of 16", "Quarter-final", "Semi-final", "Final"}
    r32, ko = [], []
    for m in fixture_raw["matches"]:
        rd = m.get("round")
        if rd not in KO:
            continue
        num = m.get("num") or 103  # la Final a veces no trae num
        if rd == "Round of 32":
            r32.append({"num": num, "a": _parse_slot(m["team1"]), "b": _parse_slot(m["team2"])})
        else:
            ko.append({"num": num, "a": m["team1"].strip(), "b": m["team2"].strip()})
    r32.sort(key=lambda x: x["num"])
    ko.sort(key=lambda x: x["num"])
    return {"r32": r32, "ko": ko}


def main():
    print("Cargando modelo y datos...")
    dc = DixonColesModel.load(ROOT / "models" / "dixon_coles.json")
    host_boost = float(np.exp(dc.home_adv))  # factor de goles esperados por jugar en casa
    df_features = pd.read_parquet(DATA_PROCESSED / "features.parquet")
    df_wc = pd.read_csv(DATA_PROCESSED / "wc_clean.csv", parse_dates=["date"])
    df_wc = df_wc[df_wc["home_score"].notna()].copy()

    with open(DATA_PROCESSED / "elo_current.json") as f:
        elo_ratings = json.load(f)

    team_to_group = {t: g for g, ts in WC2026_GROUPS.items() for t in ts}

    # ── 1. teams.json ─────────────────────────────────────────────────────
    print("Exportando teams.json...")
    team_stats = build_team_stats(df_features, elo_ratings, WC2026_TEAMS)
    elo_sorted = list(elo_ratings.keys())

    shootout_stats = build_shootout_stats(load_shootouts())

    teams_out = {}
    for team in WC2026_TEAMS:
        stats = team_stats.get(team, {})
        elo = elo_ratings.get(team, 1500.0)
        rank = elo_sorted.index(team) + 1 if team in elo_sorted else 999
        pens = shootout_stats.get(team, {"wins": 0, "total": 0})
        teams_out[team] = {
            "elo": round(elo, 1),
            "rank": rank,
            "flag": TEAM_FLAGS.get(team, "🏳️"),
            "group": team_to_group.get(team, "?"),
            "confederation": CONFEDERATION_MAP.get(team, "?"),
            "goals_scored": round(stats.get("goals_scored", 1.5), 2),
            "goals_conceded": round(stats.get("goals_conceded", 1.2), 2),
            "wc_matches": stats.get("wc_matches", 0),
            "pen_wins": pens["wins"],
            "pen_total": pens["total"],
            "is_host": team in HOSTS,
            # factor de localía aplicado a sus partidos de grupo (1.0 si no anfitrión)
            "host_boost": round(host_boost, 4) if team in HOSTS else 1.0,
        }

    (OUT_DIR / "teams.json").write_text(
        json.dumps(teams_out, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # ── 2. groups.json ────────────────────────────────────────────────────
    print("Exportando groups.json...")
    (OUT_DIR / "groups.json").write_text(
        json.dumps(WC2026_GROUPS, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # ── 3. predictions.json (Dixon-Coles: 1X2 + marcador, mismo modelo) ────
    print("Exportando predictions.json (Dixon-Coles, todos los pares)...")
    predictions_out = {}
    for i, t1 in enumerate(WC2026_TEAMS):
        for t2 in WC2026_TEAMS[i + 1:]:
            for a, b in ((t1, t2), (t2, t1)):  # ambas direcciones (espejo)
                p = dc.predict_1x2(a, b, neutral=True)       # sede neutral en el Mundial
                sh, sa = dc.most_likely_score(a, b, neutral=True)
                eh, ea = dc.expected_goals(a, b, neutral=True)
                predictions_out[f"{a}|{b}"] = {
                    "home_win": round(p["home_win"], 4),
                    "draw": round(p["draw"], 4),
                    "away_win": round(p["away_win"], 4),
                    "exp_home": round(eh, 2),    # goles esperados (xG del modelo)
                    "exp_away": round(ea, 2),
                    "score_home": sh,            # marcador más probable (coherente con 1X2)
                    "score_away": sa,
                }

    (OUT_DIR / "predictions.json").write_text(
        json.dumps(predictions_out, ensure_ascii=False), encoding="utf-8"
    )
    print(f"  -> {len(predictions_out)} pares exportados")

    # ── 4. matches.json (histórico WC — últimos 500 partidos) ─────────────
    print("Exportando matches.json...")
    df_matches = df_wc.copy()
    df_matches["year"] = df_matches["date"].dt.year
    matches_out = df_matches[[
        "date", "home_team", "away_team", "home_score", "away_score", "outcome", "year"
    ]].tail(500).copy()
    matches_out["date"] = matches_out["date"].dt.strftime("%Y-%m-%d")
    matches_out["home_score"] = matches_out["home_score"].astype(int)
    matches_out["away_score"] = matches_out["away_score"].astype(int)

    (OUT_DIR / "matches.json").write_text(
        json.dumps(matches_out.to_dict("records"), ensure_ascii=False), encoding="utf-8"
    )

    # ── 5. stats.json (datos curiosos pre-computados) ─────────────────────
    print("Exportando stats.json...")
    df_wc_s = df_wc.copy()
    df_wc_s["total_goals"] = df_wc_s["home_score"] + df_wc_s["away_score"]
    df_wc_s["margin"] = (df_wc_s["home_score"] - df_wc_s["away_score"]).abs()
    df_wc_s["year"] = df_wc_s["date"].dt.year

    by_year = df_wc_s.groupby("year").agg(
        total=("total_goals", "sum"),
        matches=("total_goals", "count"),
    ).reset_index()
    by_year["avg"] = (by_year["total"] / by_year["matches"]).round(3)

    # Top goleadores colectivos
    all_teams_hist = set(df_wc_s["home_team"].tolist() + df_wc_s["away_team"].tolist())
    goal_rows = []
    for team in all_teams_hist:
        hm = df_wc_s[df_wc_s["home_team"] == team]
        am = df_wc_s[df_wc_s["away_team"] == team]
        n = len(hm) + len(am)
        if n < 5:
            continue
        gf = int(hm["home_score"].sum() + am["away_score"].sum())
        ga = int(hm["away_score"].sum() + am["home_score"].sum())
        goal_rows.append({
            "team": team,
            "flag": TEAM_FLAGS.get(team, "🏳️"),
            "matches": n,
            "goals_for": gf,
            "goals_against": ga,
            "goal_diff": gf - ga,
            "avg": round(gf / n, 2),
        })
    goal_rows.sort(key=lambda x: x["goals_for"], reverse=True)

    # Sorpresas ELO
    df_feat = df_features.copy()
    df_feat["underdog_won"] = (
        ((df_feat["elo_diff"] > 0) & (df_feat["outcome"] == "away_win")) |
        ((df_feat["elo_diff"] < 0) & (df_feat["outcome"] == "home_win"))
    )
    upsets = df_feat[df_feat["underdog_won"]].copy()
    upsets["upset_magnitude"] = upsets["elo_diff"].abs()
    top_upsets = upsets.nlargest(10, "upset_magnitude")
    merged = top_upsets.merge(
        df_wc_s[["date", "home_team", "away_team", "home_score", "away_score"]],
        on=["date", "home_team", "away_team"], how="left"
    )

    upsets_out = []
    for _, r in merged.iterrows():
        if r["elo_diff"] > 0:
            favored, winner = r["home_team"], r["away_team"]
            elo_fav, elo_under = r["elo_home"], r["elo_away"]
        else:
            favored, winner = r["away_team"], r["home_team"]
            elo_fav, elo_under = r["elo_away"], r["elo_home"]
        upsets_out.append({
            "year": int(r["date"].year) if hasattr(r["date"], "year") else int(str(r["date"])[:4]),
            "home_team": r["home_team"],
            "away_team": r["away_team"],
            "home_score": int(r["home_score"]) if pd.notna(r.get("home_score")) else 0,
            "away_score": int(r["away_score"]) if pd.notna(r.get("away_score")) else 0,
            "favored": favored,
            "winner": winner,
            "elo_favored": round(float(elo_fav), 0),
            "elo_winner": round(float(elo_under), 0),
            "elo_advantage": round(float(r["upset_magnitude"]), 0),
            "flag_favored": TEAM_FLAGS.get(favored, "🏳️"),
            "flag_winner": TEAM_FLAGS.get(winner, "🏳️"),
        })

    # Colombia stats
    col_home = df_wc_s[df_wc_s["home_team"] == "Colombia"]
    col_away = df_wc_s[df_wc_s["away_team"] == "Colombia"]
    c_total = len(col_home) + len(col_away)
    c_wins = int(
        (col_home["outcome"] == "home_win").sum() +
        (col_away["outcome"] == "away_win").sum()
    )
    c_draws = int((pd.concat([col_home, col_away])["outcome"] == "draw").sum())
    c_gf = int(col_home["home_score"].sum() + col_away["away_score"].sum())
    c_ga = int(col_home["away_score"].sum() + col_away["home_score"].sum())

    # Partido más goleador
    max_row = df_wc_s.loc[df_wc_s["total_goals"].idxmax()]
    max_margin_row = df_wc_s.loc[df_wc_s["margin"].idxmax()]

    stats_out = {
        "total_matches": len(df_wc_s),
        "total_goals": int(df_wc_s["total_goals"].sum()),
        "avg_goals_all": round(float(df_wc_s["total_goals"].mean()), 3),
        "n_editions": int(df_wc_s["year"].nunique()),
        "highest_scoring_match": {
            "home_team": max_row["home_team"],
            "away_team": max_row["away_team"],
            "home_score": int(max_row["home_score"]),
            "away_score": int(max_row["away_score"]),
            "total": int(max_row["total_goals"]),
            "year": int(max_row["year"]),
            "flag_home": TEAM_FLAGS.get(max_row["home_team"], "🏳️"),
            "flag_away": TEAM_FLAGS.get(max_row["away_team"], "🏳️"),
        },
        "biggest_victory": {
            "home_team": max_margin_row["home_team"],
            "away_team": max_margin_row["away_team"],
            "home_score": int(max_margin_row["home_score"]),
            "away_score": int(max_margin_row["away_score"]),
            "margin": int(max_margin_row["margin"]),
            "year": int(max_margin_row["year"]),
            "flag_home": TEAM_FLAGS.get(max_margin_row["home_team"], "🏳️"),
            "flag_away": TEAM_FLAGS.get(max_margin_row["away_team"], "🏳️"),
        },
        "goals_by_year": [
            {"year": int(r["year"]), "total": int(r["total"]), "matches": int(r["matches"]), "avg": float(r["avg"])}
            for _, r in by_year.iterrows()
        ],
        "best_avg_edition": {
            "year": int(by_year.loc[by_year["avg"].idxmax(), "year"]),
            "avg": float(by_year["avg"].max()),
        },
        "worst_avg_edition": {
            "year": int(by_year.loc[by_year["avg"].idxmin(), "year"]),
            "avg": float(by_year["avg"].min()),
        },
        "top_scoring_teams": goal_rows[:15],
        "top_upsets": upsets_out,
        "colombia": {
            "total_matches": c_total,
            "wins": c_wins,
            "draws": c_draws,
            "losses": c_total - c_wins - c_draws,
            "goals_for": c_gf,
            "goals_against": c_ga,
            "win_pct": round(c_wins / c_total * 100, 1) if c_total else 0,
            "elo_current": round(elo_ratings.get("Colombia", 1500.0), 1),
            "elo_rank": elo_sorted.index("Colombia") + 1 if "Colombia" in elo_sorted else 999,
        },
    }

    (OUT_DIR / "stats.json").write_text(
        json.dumps(stats_out, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # ── 6. group_matches.json ─────────────────────────────────────────────────
    print("Exportando group_matches.json...")
    with open(DATA_EXTERNAL / "wc2026_fixture.json", encoding="utf-8") as f_fix:
        fixture_raw = json.load(f_fix)

    group_matches_out: dict = {}
    for m in fixture_raw["matches"]:
        grp_raw = m.get("group", "")
        if not grp_raw.startswith("Group "):
            continue
        grp = grp_raw.replace("Group ", "")
        t1 = FIXTURE_NAME_MAP.get(m["team1"], m["team1"])
        t2 = FIXTURE_NAME_MAP.get(m["team2"], m["team2"])
        if t1 in HOSTS or t2 in HOSTS:
            # Anfitrión local: predicción con ventaja de localía (no neutral)
            host, away = (t1, t2) if t1 in HOSTS else (t2, t1)
            pp = dc.predict_1x2(host, away, neutral=False)
            hw, dr_, aw = pp["home_win"], pp["draw"], pp["away_win"]
            t1w, dr, t2w = (hw, dr_, aw) if t1 in HOSTS else (aw, dr_, hw)
        else:
            key, rev = f"{t1}|{t2}", f"{t2}|{t1}"
            if key in predictions_out:
                p = predictions_out[key]; t1w, dr, t2w = p["home_win"], p["draw"], p["away_win"]
            elif rev in predictions_out:
                p = predictions_out[rev]; t1w, dr, t2w = p["away_win"], p["draw"], p["home_win"]
            else:
                t1w, dr, t2w = 0.34, 0.32, 0.34
        group_matches_out.setdefault(grp, []).append({
            "date": m["date"],
            "round": m["round"],
            "ground": m.get("ground", ""),
            "team1": t1, "team2": t2,
            "team1_flag": TEAM_FLAGS.get(t1, "🏳️"),
            "team2_flag": TEAM_FLAGS.get(t2, "🏳️"),
            "t1_win": round(t1w, 4),
            "draw":   round(dr,  4),
            "t2_win": round(t2w, 4),
        })

    (OUT_DIR / "group_matches.json").write_text(
        json.dumps(group_matches_out, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    n_gm = sum(len(v) for v in group_matches_out.values())
    print(f"  -> {n_gm} partidos de grupos exportados")

    # ── 7. group_standings.json (Monte Carlo 5 000 sims) ─────────────────────
    print("Exportando group_standings.json (Monte Carlo 5 000 sims)...")
    from src.simulator import WC2026_GROUPS as _GROUPS
    group_standings = compute_group_standings(
        predictions_out, _GROUPS, elo_ratings, n=5000, hosts=HOSTS, host_boost=host_boost
    )
    (OUT_DIR / "group_standings.json").write_text(
        json.dumps(group_standings, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # ── 8. goalscorers.json (top goleadores historicos WC) ───────────────────
    print("Exportando goalscorers.json...")
    gs_path = DATA_RAW / "goalscorers.csv"
    if gs_path.exists():
        df_gs = pd.read_csv(gs_path, parse_dates=["date"])
        wc_date_set = set(df_wc["date"].dt.strftime("%Y-%m-%d"))
        df_gs["date_str"] = df_gs["date"].dt.strftime("%Y-%m-%d")
        df_gs_wc = df_gs[
            df_gs["date_str"].isin(wc_date_set) &
            (df_gs["own_goal"].astype(str).str.upper() != "TRUE")
        ].copy()
        scorer_agg = (
            df_gs_wc.groupby(["scorer", "team"])
            .size()
            .reset_index(name="goals")
            .sort_values("goals", ascending=False)
        )

        # víctimas: equipos a los que les marcó cada goleador (usado por FunFacts)
        df_gs_wc["opponent"] = df_gs_wc.apply(
            lambda r: r["away_team"] if r["team"] == r["home_team"] else r["home_team"],
            axis=1,
        )

        def _victims(scorer: str, country: str) -> list:
            sub = df_gs_wc[(df_gs_wc["scorer"] == scorer) & (df_gs_wc["team"] == country)]
            agg = sub.groupby("opponent").size().sort_values(ascending=False)
            return [
                {"team": opp, "flag": TEAM_FLAGS.get(opp, "🏳️"), "goals": int(n)}
                for opp, n in agg.items()
            ]

        goalscorers_out = [
            {
                "rank": i + 1,
                "scorer": row["scorer"],
                "country": row["team"],
                "flag": TEAM_FLAGS.get(row["team"], "🏳️"),
                "goals": int(row["goals"]),
                "victims": _victims(row["scorer"], row["team"]),
            }
            for i, row in enumerate(scorer_agg.head(30).to_dict("records"))
        ]
        (OUT_DIR / "goalscorers.json").write_text(
            json.dumps(goalscorers_out, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"  -> {len(goalscorers_out)} goleadores exportados")
    else:
        print("  -> goalscorers.csv no encontrado, saltando")

    # ── 9. qatar2022.json (backtest público con Dixon-Coles) ─────────────────
    # Backtest honesto: el modelo se reentrena SOLO con datos previos al torneo
    # (sin fuga de información) y predice los 64 partidos de Qatar 2022.
    print("Exportando qatar2022.json (backtest Dixon-Coles)...")
    wc2022_start = pd.Timestamp("2022-11-20")
    df_all_raw = load_results()
    dc_bt = train_dixon_coles(df_all_raw[df_all_raw["date"] < wc2022_start],
                              ref_date=wc2022_start)

    df_q = df_wc[df_wc["date"].dt.year == 2022].copy()
    labels = ["home_win", "draw", "away_win"]

    matches_bt = []
    hits = 0
    for _, r in df_q.iterrows():
        h, a = r["home_team"], r["away_team"]
        if h not in dc_bt.attack or a not in dc_bt.attack:
            continue
        p = dc_bt.predict_1x2(h, a, neutral=True)
        sh, sa = dc_bt.most_likely_score(h, a, neutral=True)
        vec = [p["home_win"], p["draw"], p["away_win"]]
        predicted = labels[int(np.argmax(vec))]
        hit = predicted == r["outcome"]
        hits += int(hit)
        matches_bt.append({
            "date": r["date"].strftime("%Y-%m-%d"),
            "home_team": h, "away_team": a,
            "home_flag": TEAM_FLAGS.get(h, "🏳️"),
            "away_flag": TEAM_FLAGS.get(a, "🏳️"),
            "home_score": int(r["home_score"]), "away_score": int(r["away_score"]),
            "home_win": round(p["home_win"], 4), "draw": round(p["draw"], 4),
            "away_win": round(p["away_win"], 4),
            "pred_score_home": sh, "pred_score_away": sa,
            "predicted": predicted, "actual": r["outcome"], "hit": hit,
        })

    qatar_out = {
        "n": len(matches_bt),
        "hits": hits,
        "accuracy": round(hits / len(matches_bt), 4) if matches_bt else 0,
        "matches": matches_bt,
    }
    (OUT_DIR / "qatar2022.json").write_text(
        json.dumps(qatar_out, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"  -> {len(matches_bt)} partidos, accuracy {qatar_out['accuracy']:.1%}")

    # ── 10. bracket.json (cuadro eliminatorio oficial 2026) ──────────────────
    print("Exportando bracket.json (cuadro oficial)...")
    bracket_out = parse_bracket(fixture_raw)
    (OUT_DIR / "bracket.json").write_text(
        json.dumps(bracket_out, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"  -> {len(bracket_out['r32'])} cruces R32 + {len(bracket_out['ko'])} de R16 a Final")

    # ── Resumen ───────────────────────────────────────────────────────────
    print("\n[OK] Exportacion completa:")
    for f in sorted(OUT_DIR.glob("*.json")):
        size_kb = f.stat().st_size / 1024
        print(f"   {f.name:<25} {size_kb:.1f} KB")


if __name__ == "__main__":
    main()
