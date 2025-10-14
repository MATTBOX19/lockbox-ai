// frontend/srcv4/App.jsx
import React, { useEffect, useState } from "react";
import "./v4.css";

const API_BASE = "http://127.0.0.1:8000";

export default function App() {
  const [sport, setSport] = useState("americanfootball_nfl");
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activePick, setActivePick] = useState(null);

  const fetchOdds = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/odds/${sport}`);
      const data = await res.json();
      setGames(data.games || []);
    } catch (e) {
      console.error("Error fetching odds:", e);
      setGames([]);
    } finally {
      setLoading(false);
    }
  };

  const analyzeGame = async (g) => {
    setActivePick({ game: g.game, loading: true });

    try {
      // moneyline
      const mlRes = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sport,
          home_team: g.home_team,
          away_team: g.away_team,
          market: "moneyline",
        }),
      });
      const mlData = await mlRes.json();

      // spread (only if spread exists)
      let spData = { error: "No spread market" };
      if (g.home_spread !== null && g.home_spread !== undefined) {
        const spRes = await fetch(`${API_BASE}/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sport,
            home_team: g.home_team,
            away_team: g.away_team,
            market: "spread",
          }),
        });
        spData = await spRes.json();
      }

      setActivePick({
        game: g.game,
        loading: false,
        moneyline: mlData,
        spread: spData,
      });
    } catch (err) {
      console.error("Analyze error:", err);
      setActivePick({ game: g.game, error: true, loading: false });
    }
  };

  useEffect(() => {
    fetchOdds();
  }, [sport]);

  return (
    <div className="v4-container">
      <header className="v4-header">
        <h1>⚡ LockBox AI v4</h1>
        <p>Smart Sports Picks — ML + ATS (real book lines)</p>
        <div className="v4-controls">
          <select
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            className="v4-select"
          >
            <option value="americanfootball_nfl">NFL</option>
            <option value="americanfootball_ncaaf">NCAAF</option>
            <option value="basketball_nba">NBA</option>
            <option value="baseball_mlb">MLB</option>
            <option value="icehockey_nhl">NHL</option>
          </select>
          <button onClick={fetchOdds} disabled={loading}>
            {loading ? "Loading…" : "Refresh Odds"}
          </button>
        </div>
      </header>

      <main className="v4-main">
        {games.length === 0 && !loading && (
          <p className="v4-empty">No games available right now.</p>
        )}

        <div className="v4-grid">
          {games.map((g, idx) => {
            const mlText = `${g.away_team} ${g.away_odds > 0 ? `+${g.away_odds}` : g.away_odds}  |  ${g.home_team} ${g.home_odds > 0 ? `+${g.home_odds}` : g.home_odds}`;
            const atsText =
              g.home_spread === null || g.home_spread === undefined
                ? "ATS: N/A"
                : `ATS: ${g.home_team} ${g.home_spread > 0 ? `+${g.home_spread}` : g.home_spread}`;

            const isActive = activePick && activePick.game === g.game;

            return (
              <div key={idx} className="v4-card">
                <h3>{g.game}</h3>
                <p className="v4-odds">{mlText}</p>
                <p className="v4-edge">{atsText}</p>

                <button
                  className="v4-analyze"
                  onClick={() => analyzeGame(g)}
                  disabled={isActive && activePick.loading}
                >
                  {isActive && activePick.loading ? "Analyzing…" : "Analyze Pick"}
                </button>

                {/* Inline results */}
                {isActive && !activePick.loading && !activePick.error && (
                  <div className="v4-inline-result">
                    <p className="v4-inline-label">💰 Moneyline Pick:</p>
                    <p className="v4-inline-pick">
                      {activePick.moneyline?.pick || "N/A"}
                    </p>
                    <p className="v4-inline-meta">
                      Conf:{" "}
                      {activePick.moneyline?.confidence
                        ? `${(activePick.moneyline.confidence * 100).toFixed(1)}%`
                        : "—"}{" "}
                      | EV:{" "}
                      {activePick.moneyline?.expected_value
                        ? `${(activePick.moneyline.expected_value * 100).toFixed(1)}%`
                        : "—"}
                    </p>

                    <div className="v4-divider" style={{ margin: "8px 0" }} />

                    <p className="v4-inline-label">📏 ATS Pick:</p>
                    <p className="v4-inline-pick">
                      {activePick.spread?.error
                        ? "N/A"
                        : activePick.spread?.pick || "N/A"}
                    </p>
                    <p className="v4-inline-meta">
                      Line:{" "}
                      {g.home_spread === null || g.home_spread === undefined
                        ? "N/A"
                        : `${g.home_team} ${g.home_spread > 0 ? `+${g.home_spread}` : g.home_spread}`}
                      {"  |  "}
                      Conf:{" "}
                      {activePick.spread?.confidence
                        ? `${(activePick.spread.confidence * 100).toFixed(1)}%`
                        : "—"}{" "}
                      | EV:{" "}
                      {activePick.spread?.expected_value
                        ? `${(activePick.spread.expected_value * 100).toFixed(1)}%`
                        : "—"}
                    </p>
                  </div>
                )}

                {isActive && activePick.error && (
                  <p className="v4-inline-error">Error analyzing game.</p>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
