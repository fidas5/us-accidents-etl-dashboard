// src/components/Layout.tsx
import React from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  LayoutDashboard,
  Database,
  Table,
  BrainCircuit,
  LogOut,
  Car,
} from "lucide-react";

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const navigation = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "ETL Jobs", href: "/etl", icon: Database },
    { name: "Data Explorer", href: "/data", icon: Table },
    { name: "Predictions", href: "/predict", icon: BrainCircuit },
  ];

  return (
    <div className="app-layout">
      <div className="sidebar">
        <div className="sidebar-header">
          <Car className="me-2" size={24} />
          <span>US Accidents</span>
        </div>
        <ul className="sidebar-nav">
          {navigation.map((item) => {
            const isActive =
              location.pathname === item.href ||
              (item.href === "/" && location.pathname === "");
            return (
              <li className="sidebar-nav-item" key={item.name}>
                <Link
                  to={item.href}
                  className={`sidebar-link ${isActive ? "active" : ""}`}
                >
                  <item.icon size={20} />
                  {item.name}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="sidebar-footer">
          <div
            className="truncate fw-medium text-muted"
            style={{ flexGrow: 1 }}
          >
            {user?.email}
          </div>
          <button onClick={handleLogout} className="btn-icon" title="Logout">
            <LogOut size={20} />
          </button>
        </div>
      </div>

      <div className="main-content">
        <header className="mobile-header">
          <div
            className="flex items-center"
            style={{ color: "var(--primary-color)" }}
          >
            <Car className="me-2" size={24} />
            <span className="fw-bold">US Accidents</span>
          </div>
          <button onClick={handleLogout} className="btn-icon">
            <LogOut size={20} />
          </button>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}