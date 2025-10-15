import React, { useEffect, useState } from "react";
import "./v4.css";

// === Backend URL ===
// If you deploy backend separately, keep this updated to its Render URL.
const API_BASE = import.meta.env.VITE_API_BASE || "https://lockbox-backend-tcuv.onrender.com";

export default function App() {
  const [sport, setSport] = useState("americanfootball_nfl");
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // === Fetch odds from backend ===
  const fetchOdds = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/odds/${sport}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.games) {
        setGames(data.games);
      } else {
        setError("No games returned from backend.");
      }
    } catch (err) {
      console.error("Fetch failed:", err);
      setError("Failed to load odds. Try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOdds();
  }, [sport]);

  return (
    <div className="app-container">
      <h1>⚡ LockBox AI v4</h1>
      <p>Smart Sports Picks — Dual Market Model (ML + ATS)</p>

      <div className="toolbar">
        <select value={sport} onChange={(e) => setSport(e.target.value)}>
          <option value="americanfootball_nfl">NFL</option>
          <option value="americanfootball_ncaaf">NCAAF</option>
          <option value="basketball_nba">NBA</option>
          <option value="baseball_mlb">MLB</option>
          <option value="icehockey_nhl">NHL</option>
        </select>
        <button onClick={fetchOdds} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh Odds"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="grid">
        {games.length === 0 && !error && !loading && (
          <p>No active games available.</p>
        )}
        {games.map((g, i) => (
          <div key={i} className="game-card">
            <h3>{g.game}</h3>
            <p>
              {g.away_team} ({g.away_odds}) @ {g.home_team} ({g.home_odds})
            </p>
            {g.home_spread !== null && (
              <p>Spread: {g.home_spread} / {g.away_spread}</p>
            )}
            <p>Kickoff: {new Date(g.commence).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
