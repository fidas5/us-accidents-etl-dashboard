import React, { useEffect, useState } from "react";
import HealthCheck from "./components/HealthCheck";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import { LogOut, LayoutDashboard, ShieldCheck, Users, Database, Zap } from "lucide-react";

type View = "login" | "register" | "dashboard";

const TOKEN_KEY = "access_token";

function App() {
  const [view, setView] = useState<View>("login");
  const [token, setToken] = useState<string | null>(null);

  // Load token on startup
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      setToken(stored);
      setView("dashboard");
    }
  }, []);

  const handleLoggedIn = (accessToken: string) => {
    setToken(accessToken);
    localStorage.setItem(TOKEN_KEY, accessToken);
    setView("dashboard");
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
    setView("login");
  };

  const isAuthenticated = view === "dashboard";

  return (
    <div className="app-layout">
      {/* Sidebar ONLY when authenticated */}
      {isAuthenticated && (
        <aside className="sidebar">
          <div className="sidebar-header">
            <ShieldCheck style={{ marginRight: "0.5rem" }} />
            US Accidents ETL
          </div>
          <ul className="sidebar-nav">
            <li className="sidebar-nav-item">
              <span className="sidebar-link active">
                <LayoutDashboard />
                <span>Dashboard</span>
              </span>
            </li>
          </ul>
          <div className="sidebar-footer">
            <span className="text-sm">Logged in</span>
            <button className="btn btn-outline" onClick={handleLogout}>
              <LogOut className="me-2" size={16} /> Sign out
            </button>
          </div>
        </aside>
      )}

      {/* Main content */}
      <div className="main-content">
        {/* Mobile header */}
        <header className="mobile-header">
          <div className="flex items-center gap-2">
            <ShieldCheck />
            <span className="fw-bold">US Accidents ETL</span>
          </div>
          {isAuthenticated && (
            <button className="btn btn-outline" onClick={handleLogout}>
              <LogOut className="me-2" size={16} /> Sign out
            </button>
          )}
        </header>

        <main className="page-content">
          {/* Toggle login/register when NOT authenticated */}
          {!isAuthenticated && (
            <div className="text-center mb-4">
              {view === "login" ? (
                <p className="text-muted">
                  Don't have an account?{" "}
                  <button
                    type="button"
                    onClick={() => setView("register")}
                    className="btn btn-outline"
                    style={{ padding: "0.25rem 0.75rem", fontSize: "0.85rem" }}
                  >
                    Register here
                  </button>
                </p>
              ) : (
                <p className="text-muted">
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => setView("login")}
                    className="btn btn-outline"
                    style={{ padding: "0.25rem 0.75rem", fontSize: "0.85rem" }}
                  >
                    Sign in instead
                  </button>
                </p>
              )}
            </div>
          )}

          <div className="view-container">
            {view === "login" && <LoginPage onLoggedIn={handleLoggedIn} />}

            {view === "register" && <RegisterPage onLoggedIn={handleLoggedIn} />}

            {view === "dashboard" && (
              <div className="dashboard-wrapper">
                {/* Dashboard Header */}
                <div className="card" style={{ marginBottom: "1.5rem" }}>
                  <div className="card-header">
                    <div className="flex items-center gap-2">
                      <LayoutDashboard />
                      <span>Dashboard Overview</span>
                    </div>
                  </div>
                  <div className="card-body">
                    <p className="text-muted">
                      Analytics, ETL Jobs & Predictions for US accidents.
                    </p>
                  </div>
                </div>

                {/* KPI + HealthCheck */}
                <div className="kpi-grid">
                  <HealthCheck />

                  <div className="card kpi-card">
                    <div className="kpi-icon blue">
                      <Users />
                    </div>
                    <div className="kpi-content">
                      <h6>Active Users</h6>
                      <h3>1</h3>
                      <p className="text-muted text-sm">
                        Secure JWT authentication active
                      </p>
                    </div>
                  </div>

                  <div className="card kpi-card">
                    <div className="kpi-icon purple">
                      <Database />
                    </div>
                    <div className="kpi-content">
                      <h6>ETL Status</h6>
                      <h3>Ready</h3>
                      <p className="text-muted text-sm">
                        PostgreSQL accidents_clean loaded
                      </p>
                    </div>
                  </div>

                  <div className="card kpi-card">
                    <div className="kpi-icon yellow">
                      <Zap />
                    </div>
                    <div className="kpi-content">
                      <h6>Predictions</h6>
                      <h3>Live</h3>
                      <p className="text-muted text-sm">
                        Random Forest model ready (/predict)
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;