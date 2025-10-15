from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx, os, statistics, time
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from supabase import create_client, Client
from model import analyze_game

# === Load env ===
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
ODDS_API_KEY = os.getenv("ODDS_API_KEY")

ODDS_API_BASE = "https://api.the-odds-api.com/v4/sports"
SUPPORTED_SPORTS = [
    "americanfootball_nfl",
    "americanfootball_ncaaf",
    "basketball_nba",
    "baseball_mlb",
    "icehockey_nhl",
]

# === App ===
app = FastAPI(title="LockBox AI", version="4.4")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

# === Supabase ===
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# === Cache ===
_odds_cache = {}
CACHE_DURATION = 60  # seconds

# === Schemas ===
class AnalysisRequest(BaseModel):
    sport: str
    home_team: str
    away_team: str
    market: str = "moneyline"  # "moneyline" or "spread"

# === Helpers ===
def _parse_iso(ts: str):
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        return None

def _first_valid_bookmakers(game: dict):
    return game.get("bookmakers", []) or []

def _h2h_prices(game: dict):
    home, away = game.get("home_team"), game.get("away_team")
    for bm in _first_valid_bookmakers(game):
        for m in bm.get("markets", []):
            if m.get("key") != "h2h":
                continue
            home_ml = away_ml = None
            for o in m.get("outcomes", []):
                if o.get("name") == home:
                    home_ml = o.get("price")
                elif o.get("name") == away:
                    away_ml = o.get("price")
            if home_ml is not None and away_ml is not None:
                return home_ml, away_ml
    return None, None

def _median_home_spread(game: dict):
    home, away = game.get("home_team"), game.get("away_team")
    pts = []
    for bm in _first_valid_bookmakers(game):
        for m in bm.get("markets", []):
            if m.get("key") != "spreads":
                continue
            for o in m.get("outcomes", []):
                if o.get("name") == home and isinstance(o.get("point"), (int, float)):
                    pts.append(float(o["point"]))
                    break
    if not pts:
        return None, None
    med = statistics.median(pts)
    return med, -med

def _clearly_past_or_live(game: dict, kickoff: datetime, now: datetime) -> bool:
    if game.get("completed") is True:
        return True
    scores = game.get("scores") or []
    if scores and kickoff and kickoff <= now + timedelta(minutes=5):
        return True
    return False

# === Odds Fetcher with Cache ===
async def _fetch_odds(sport: str):
    """Fetch fresh odds for a sport."""
    params = {
        "apiKey": ODDS_API_KEY,
        "regions": "us,us2",
        "markets": "h2h,spreads",
        "oddsFormat": "american",
        "dateFormat": "iso",
        "daysFrom": 8,
    }
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{ODDS_API_BASE}/{sport}/odds", params=params)
        return r.json()

async def _get_cached_odds(sport: str):
    """Return cached odds if within cache duration."""
    now = time.time()
    cache = _odds_cache.get(sport)
    if cache and now - cache["timestamp"] < CACHE_DURATION:
        print(f"[CACHE] Using cached odds for {sport}")
        return cache["data"]
    print(f"[FETCH] Refreshing odds for {sport}")
    data = await _fetch_odds(sport)
    _odds_cache[sport] = {"data": data, "timestamp": now}
    return data

# === Routes ===
@app.get("/health")
def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

@app.get("/odds/{sport}")
async def get_odds(sport: str):
    if sport not in SUPPORTED_SPORTS:
        return {"error": f"Unsupported sport: {sport}"}

    data = await _get_cached_odds(sport)
    now = datetime.now(timezone.utc)
    grace = timedelta(minutes=15)
    future = timedelta(days=8)
    out = []

    for g in data:
        kickoff = _parse_iso(g.get("commence_time"))
        if not kickoff or kickoff <= now + grace or kickoff > now + future:
            continue
        if _clearly_past_or_live(g, kickoff, now):
            continue

        home_ml, away_ml = _h2h_prices(g)
        if home_ml is None or away_ml is None:
            continue
        home_sp, away_sp = _median_home_spread(g)
        out.append({
            "game": f"{g.get('away_team')} vs {g.get('home_team')}",
            "home_team": g.get("home_team"),
            "away_team": g.get("away_team"),
            "home_odds": home_ml,
            "away_odds": away_ml,
            "home_spread": home_sp,
            "away_spread": away_sp,
            "commence": kickoff.isoformat().replace("+00:00", "Z"),
        })

    out.sort(key=lambda x: x["commence"])
    return {"sport": sport, "games": out, "cache_age_sec": int(time.time() - _odds_cache[sport]["timestamp"])}

@app.post("/analyze")
async def analyze(req: AnalysisRequest):
    if req.sport not in SUPPORTED_SPORTS:
        return {"error": f"Unsupported sport: {req.sport}"}

    data = await _get_cached_odds(req.sport)
    match = next((g for g in data if g.get("home_team") == req.home_team and g.get("away_team") == req.away_team), None)
    if not match:
        return {"error": "Game not found"}

    home_ml, away_ml = _h2h_prices(match)
    if home_ml is None or away_ml is None:
        return {"error": "Moneyline not available"}

    home_sp, away_sp = _median_home_spread(match)
    model_input = {
        "home_team": req.home_team,
        "away_team": req.away_team,
        "home_odds": home_ml,
        "away_odds": away_ml,
    }
    if req.market == "spread":
        if home_sp is None:
            return {"error": "Spread market not available"}
        model_input["spread"] = home_sp

    br = supabase.table("bankroll").select("*").limit(1).execute()
    bankroll = br.data[0]["amount"] if br.data else 1000.0
    result = analyze_game(model_input, bankroll)

    if req.market == "spread":
        result["spread_value"] = home_sp

    supabase.table("bets").insert({
        "game": result["game"],
        "pick": result["pick"],
        "result": "PENDING",
        "wager": result["wager"],
        "change": 0,
        "new_bankroll": result["new_bankroll"],
    }).execute()

    supabase.table("bankroll").update({"amount": result["new_bankroll"]}) \
        .eq("id", br.data[0]["id"]).execute()

    print(f"[LockBox AI] ✅ Saved {req.market} pick: {result['pick']} ({result['game']})")
    return result
