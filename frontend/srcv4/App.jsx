import React, { useEffect, useState, useRef } from "react";
import "./v4.css";

const App = () => {
  const [sport, setSport] = useState("NFL");
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const controllerRef = useRef(null);
  const inFlight = useRef(false);
  const debounceTimer = useRef(null);

  const API_URL = import.meta.env.VITE_API_URL || "https://lockbox-backend.onrender.com";

  // --------------------------
  // Controlled fetch
  // --------------------------
  const fetchOdds = async () => {
    if (inFlight.current) return; // lock active fetch
    inFlight.current = true;
    clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(async () => {
      try {
        if (controllerRef.current) controllerRef.current.abort();
        controllerRef.current = new AbortController();
        const signal = controllerRef.current.signal;

        setLoading(true);
        setError(null);

        const res = await fetch(`${API_URL}/odds?sport=${sport}`, { signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        setGames(data);
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Fetch failed:", err);
          setError("Failed to load odds. Try again.");
        }
      } finally {
        setLoading(false);
        inFlight.current = false;
      }
    }, 300); // 300ms debounce
  };

  // --------------------------
  // Lifecycle
  // --------------------------
  useEffect(() => {
    fetchOdds();
    return () => {
      if (controllerRef.current) controllerRef.current.abort();
      clearTimeout(debounceTimer.current);
    };
  }, [sport]);

  // --------------------------
  // Analyze Pick
  // --------------------------
  const analyzePick = async (game) => {
    try {
      const res = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          home_team: game.home_team,
          away_team: game.away_team,
          home_odds: game.home_odds,
          away_odds: game.away_odds,
        }),
      });
      const data = await res.json();
      setGames((prev) =>
        prev.map((g) =>
          g.id === game.id
            ? { ...g, analysis: data }
            : g
        )
      );
    } catch (err) {
      console.error("Analyze failed:", err);
      setError("Failed to analyze pick.");
    }
  };

  // --------------------------
  // Render
  // --------------------------
  return (
    <div className="App">
      <h1 className="title">⚡ LockBox AI v4</h1>
      <p className="subtitle">Smart Sports Picks — Dual Market Model (ML + ATS)</p>

      <div className="controls">
        <button onClick={() => setSport("NFL")} className="btn">NFL</button>
        <button onClick={fetchOdds} className="btn" disabled={loading}>
          {loading ? "Refreshing..." : "Refresh Odds"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {lastUpdated && (
        <p className="timestamp">Last updated: {lastUpdated}</p>
      )}

      <div className="cards-container">
        {games.map((game) => {
          const edge = game.analysis?.edge;
          const pick = game.analysis?.pick;
          const conf = game.analysis?.confidence;
          const ev = game.analysis?.expected_value;
          const showAlert = edge && edge > 6;

          return (
            <div className="game-card" key={game.id}>
              <h2>{game.home_team} vs {game.away_team}</h2>
              <p>{game.home_team} {game.home_odds} | {game.away_team} {game.away_odds}</p>
              <p className="edge">Edge vs Market: {edge ? edge.toFixed(2) : "—"} pp</p>

              <div className="buttons">
                {showAlert && <button className="alert-btn">⚠️ UPSET ALERT</button>}
                <button
                  onClick={() => analyzePick(game)}
                  className="analyze-btn"
                  disabled={loading}
                >
                  Analyze Pick
                </button>
              </div>

              {pick && (
                <div className="analysis-box">
                  <p><strong>Moneyline Pick:</strong> {pick}</p>
                  <p>Conf: {(conf * 100).toFixed(1)}% | EV: {(ev * 100).toFixed(1)}%</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default App;
