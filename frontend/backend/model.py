# backend/model.py
import math
from dataclasses import dataclass

@dataclass
class PickResult:
    pick: str
    confidence: float
    expected_value: float
    edge: float
    kelly_fraction: float
    spread_value: str | None = None


def implied_prob(odds: float) -> float:
    """Convert American odds to implied probability (no vig)."""
    if odds > 0:
        return 100 / (odds + 100)
    return abs(odds) / (abs(odds) + 100)


def payout_per_dollar(odds: float) -> float:
    """Return profit per $1 stake (excluding stake)."""
    return odds / 100 if odds > 0 else 100 / abs(odds)


def ev_fraction(p_model: float, odds: float) -> float:
    """Expected value per $1 stake (fractional form)."""
    payoff = payout_per_dollar(odds)
    return p_model * payoff - (1 - p_model)


def ev_percent(p_model: float, odds: float) -> float:
    return round(ev_fraction(p_model, odds) * 100, 2)


def kelly_fraction(p_model: float, odds: float, scale: float = 0.25) -> float:
    """Quarter-Kelly staking fraction."""
    b = payout_per_dollar(odds)
    q = 1 - p_model
    f = (b * p_model - q) / b
    return round(max(0, min(f * scale, 1)), 4)


def analyze_game(home_team: str, away_team: str,
                 home_odds: float, away_odds: float,
                 market: str = "moneyline") -> dict:
    """
    Deterministic model using market odds as baseline, adds small bias for realism.
    Stable output across refreshes.
    """

    # === Implied probabilities (no-vig normalisation) ===
    p_home = implied_prob(home_odds)
    p_away = implied_prob(away_odds)
    z = p_home + p_away
    p_home /= z
    p_away /= z

    # === Model bias (deterministic hash) ===
    # Use simple reproducible hash for same matchup
    hkey = sum(ord(c) for c in f"{home_team}-{away_team}") % 1000
    bias = ((hkey % 21) - 10) / 100  # -0.10 … +0.10
    model_home = min(max(p_home + bias * 0.1, 0.05), 0.95)
    model_away = 1 - model_home

    # === Compute Edge, EV, Kelly ===
    edge_home = round((model_home - p_home) * 100, 2)
    edge_away = round((model_away - p_away) * 100, 2)

    ev_home = ev_percent(model_home, home_odds)
    ev_away = ev_percent(model_away, away_odds)

    k_home = kelly_fraction(model_home, home_odds)
    k_away = kelly_fraction(model_away, away_odds)

    # === Pick selection ===
    if ev_home > ev_away:
        pick = home_team
        conf = model_home
        ev = ev_home / 100
        edge = edge_home
        kelly = k_home
    else:
        pick = away_team
        conf = model_away
        ev = ev_away / 100
        edge = edge_away
        kelly = k_away

    # === Return consistent structure ===
    return {
        "pick": pick,
        "confidence": round(conf, 3),
        "expected_value": round(ev, 3),
        "edge": round(edge, 2),
        "kelly_fraction": kelly,
        "spread_value": "-3.5" if market == "spread" else None,
    }
