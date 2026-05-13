// src/components/Layout.tsx
import React, { useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  LayoutDashboard, Database, Table, BrainCircuit,
  LogOut, Car, Menu, Sun, Moon,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import "./Layout.css"; // ← Import du CSS externe

const navigation = [
  { name: "Tableau de bord", href: "/", icon: LayoutDashboard },
  { name: "tâches ETL", href: "/etl", icon: Database },
  { name: "prédictions", href: "/predict", icon: BrainCircuit },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const handleLogout = () => { 
    logout(); 
    navigate("/login"); 
  };

  const isActive = (href: string) =>
    href === "/"
      ? location.pathname === "/" || location.pathname === ""
      : location.pathname.startsWith(href);

  return (
    <div className="layout-root">
      {/* Desktop sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <Car size={16} />
          </div>
          Accidents aux États-Unis
        </div>

        <ul className="sidebar-nav">
          {navigation.map((item) => (
            <li key={item.name}>
              <Link
                to={item.href}
                className={`sidebar-link ${isActive(item.href) ? "active" : ""}`}
              >
                <item.icon size={16} className="sidebar-link-icon" />
                {item.name}
              </Link>
            </li>
          ))}
        </ul>

        <div className="sidebar-footer">
          <div className="sidebar-user-avatar">
            {user?.email?.[0] ?? "U"}
          </div>
          <div className="sidebar-user-email">
            {user?.email}
          </div>
     
          
          <button 
            className="sidebar-logout" 
            onClick={handleLogout} 
            title="Logout"
          >
            <LogOut size={14} />
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="mobile-drawer-overlay" onClick={() => setMobileOpen(false)}>
          <div
            className={`mobile-drawer ${mobileOpen ? "open" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sidebar-brand" style={{ marginBottom: 12 }}>
              <div className="sidebar-brand-icon">
                <Car size={16} />
              </div>
              US Accidents
            </div>
            
            <ul className="sidebar-nav">
              {navigation.map((item) => (
                <li key={item.name}>
                  <Link
                    to={item.href}
                    className={`sidebar-link ${isActive(item.href) ? "active" : ""}`}
                    onClick={() => setMobileOpen(false)}
                  >
                    <item.icon size={16} />
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
            
            <div className="sidebar-footer">
              <div className="sidebar-user-avatar">
                {user?.email?.[0] ?? "U"}
              </div>
              <div className="sidebar-user-email">
                {user?.email}
              </div>
             
              <button 
                className="sidebar-logout" 
                onClick={handleLogout} 
                title="Logout"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="main-area">
        <header className="mobile-header">
          <div className="mobile-brand">
            <Car size={18} color="#60a5fa" />
            US Accidents
          </div>
          <button 
            className="mobile-menu-btn" 
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={18} />
          </button>
        </header>

        <div className="page-scroll">
          <div className="page-inner">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}