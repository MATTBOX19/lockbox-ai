# backend/model.py
import math, random


def american_to_decimal(odds):
    if odds > 0:
        return 1 + odds / 100
    else:
        return 1 + 100 / abs(odds)


def implied_prob(odds):
    return 100 / (odds + 100) if odds > 0 else abs(odds) / (abs(odds) + 100)


def analyze_game(game, bankroll):
    home, away = game["home_team"], game["away_team"]
    home_odds, away_odds = game["home_odds"], game["away_odds"]
    if not home_odds or not away_odds:
        return {"error": "invalid odds"}

    # Model predicted edge (fake ML logic placeholder)
    model_prob_home = random.uniform(0.45, 0.65)
    market_prob_home = implied_prob(home_odds)
    edge_home = model_prob_home - market_prob_home
    edge_away = -edge_home

    # Choose pick
    pick = home if edge_home > 0 else away
    edge = abs(edge_home if pick == home else edge_away)

    # EV & Kelly
    odds_used = home_odds if pick == home else away_odds
    dec_odds = american_to_decimal(odds_used)
    ev = (dec_odds * model_prob_home) - 1
    kelly = ((dec_odds * model_prob_home) - 1) / (dec_odds - 1)
    stake = max(5, round(bankroll * (kelly / 4), 2))

    # Volatility weighting
    conf = round(min(0.55 + edge * 2.5, 0.85), 2)

    return {
        "game": f"{away} vs {home}",
        "pick": pick,
        "confidence": conf,
        "edge": round(edge, 3),
        "expected_value": round(ev, 3),
        "wager": stake,
        "new_bankroll": round(bankroll - stake, 2),
        "analysis_summary": f"{pick} has {conf*100:.1f}% confidence (edge {edge:.2%}, EV {ev:.2f})",
    }
