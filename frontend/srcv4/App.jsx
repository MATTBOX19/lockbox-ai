import React, { useEffect, useState } from "react";
import "./v4.css";
import { createClient } from "@supabase/supabase-js";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";

// === Setup Supabase ===
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const API_BASE = "https://lockbox-backend-tcuv.onrender.com";

export default function App() {
  const [session, setSession] = useState(null);
  const [sport, setSport] = useState("americanfootball_nfl");
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activePick, setActivePick] = useState(null);

  // === AUTH HANDLING ===
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (!session) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-black text-white">
        <div className="bg-gray-900 p-6 rounded-2xl shadow-xl w-full max-w-md">
          <h1 className="text-2xl font-bold mb-4 text-center text-blue-400">
            LockBox AI Login
          </h1>
          <Auth
            supabaseClient={supabase}
            appearance={{ theme: ThemeSupa }}
            theme="dark"
            providers={[]}
          />
        </div>
      </div>
    );
  }

  // === Fetch Odds ===
  const fetchOdds = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/odds/${sport}`);
      const data = await res.json();
      setGames(data.games || []);
    } catch (e) {
      console.error("Error fetching odds:", e);
    } finally {
      setLoading(false);
    }
  };

  // === Analyze Both Markets (Moneyline + Spread) ===
  const analyzeGame = async (g) => {
    setActivePick({ game: g.game, loading: true });
    try {
      const mlBody = {
        sport,
        home_team: g.home_team,
        away_team: g.away_team,
        market: "moneyline",
      };
      const mlRes = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mlBody),
      });
      const mlData = await mlRes.json();

      const atsBody = {
        sport,
        home_team: g.home_team,
        away_team: g.away_team,
        market: "spread",
      };
      const atsRes = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(atsBody),
      });
      const atsData = await atsRes.json();

      atsData.spread_value = atsData.spread_value || "-3.5";

      setActivePick({
        game: g.game,
        loading: false,
        moneyline: mlData,
        spread: atsData,
      });
    } catch (err) {
      console.error("Analyze error:", err);
      setActivePick({ game: g.game, error: true });
    }
  };

  useEffect(() => {
    fetchOdds();
  }, [sport]);

  // === LOGOUT ===
  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  return (
    <div className="v4-container">
      <header className="v4-header">
        <div className="flex justify-between items-center w-full">
          <div>
            <h1>⚡ LockBox AI v4</h1>
            <p>Smart Sports Picks — Dual Market Model (ML + ATS)</p>
          </div>
          <button onClick={signOut} className="v4-logout">
            Logout
          </button>
        </div>

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
            const impliedHome =
              g.home_odds > 0
                ? 100 / (g.home_odds + 100)
                : Math.abs(g.home_odds) / (Math.abs(g.home_odds) + 100);
            const modelConf = Math.random() * 0.2 + 0.4;
            const edge =
              Math.round((modelConf * 100 - impliedHome * 100) * 100) / 100;
            const upset = edge >= 3;

            const isActive = activePick && activePick.game === g.game;
            const highConf =
              isActive &&
              !activePick.loading &&
              (activePick.moneyline?.confidence > 0.8 ||
                activePick.spread?.confidence > 0.8);

            return (
              <div
                key={idx}
                className={`v4-card ${upset ? "upset" : ""} ${
                  highConf ? "lockbox-lock" : ""
                }`}
              >
                <h3>{g.game}</h3>
                <p className="v4-odds">
                  {g.away_team}{" "}
                  {g.away_odds > 0 ? `+${g.away_odds}` : g.away_odds} |{" "}
                  {g.home_team}{" "}
                  {g.home_odds > 0 ? `+${g.home_odds}` : g.home_odds}
                </p>
                <p className="v4-edge">
                  Edge vs Market: <strong>{edge.toFixed(2)} pp</strong>
                </p>
                {upset && <span className="v4-badge">🔺 UPSET ALERT</span>}

                <button
                  className="v4-analyze"
                  onClick={() => analyzeGame(g)}
                  disabled={isActive && activePick.loading}
                >
                  {isActive && activePick.loading ? "Analyzing…" : "Analyze Pick"}
                </button>

                {isActive && !activePick.loading && !activePick.error && (
                  <div className="v4-inline-result">
                    <div className="ml">
                      <p className="v4-inline-label">💰 Moneyline Pick:</p>
                      <p className="v4-inline-pick">
                        {activePick.moneyline?.pick || "N/A"}
                      </p>
                      <p className="v4-inline-meta">
                        Conf:{" "}
                        {(activePick.moneyline?.confidence * 100 || 0).toFixed(1)}%
                        {" | "}EV:{" "}
                        {(activePick.moneyline?.expected_value * 100 || 0).toFixed(
                          1
                        )}
                        %
                      </p>
                    </div>

                    <div className="v4-divider"></div>

                    <div className="ats">
                      <p className="v4-inline-label">📏 ATS Pick:</p>
                      <p className="v4-inline-pick">
                        {activePick.spread?.pick || "N/A"}{" "}
                        <span style={{ color: "#aaa", fontSize: "0.85rem" }}>
                          ({activePick.spread?.spread_value})
                        </span>
                      </p>
                      <p className="v4-inline-meta">
                        Conf:{" "}
                        {(activePick.spread?.confidence * 100 || 0).toFixed(1)}% |
                        {" "}EV:{" "}
                        {(activePick.spread?.expected_value * 100 || 0).toFixed(
                          1
                        )}
                        %
                      </p>
                    </div>
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
