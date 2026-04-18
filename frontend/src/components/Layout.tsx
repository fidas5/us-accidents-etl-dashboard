// src/components/Layout.tsx
import React, { useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  LayoutDashboard,
  Database,
  Table,
  BrainCircuit,
  LogOut,
  Car,
  Menu,
  X,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "ETL Jobs", href: "/etl", icon: Database },
  { name: "Data Explorer", href: "/data", icon: Table },
  { name: "Predictions", href: "/predict", icon: BrainCircuit },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isActive = (href: string) =>
    href === "/"
      ? location.pathname === "/" || location.pathname === ""
      : location.pathname.startsWith(href);

  return (
    <>
      <style>{`
        /* ── Layout shell ── */
        .layout-root {
          display: flex;
          height: 100vh;
          overflow: hidden;
          background: #020617;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        /* ── Sidebar ── */
        .sidebar {
          width: 220px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: linear-gradient(180deg, #020a1a 0%, #020617 100%);
          border-right: 1px solid rgba(30, 58, 138, 0.25);
          padding: 20px 12px;
          position: relative;
          z-index: 20;
          overflow: hidden;
        }

        /* subtle grid texture */
        .sidebar::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(59,130,246,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59,130,246,0.04) 1px, transparent 1px);
          background-size: 24px 24px;
          pointer-events: none;
        }

        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 10px 20px;
          border-bottom: 1px solid rgba(30, 58, 138, 0.2);
          margin-bottom: 12px;
          color: #e5e7eb;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: -0.3px;
          position: relative;
        }

        .sidebar-brand-icon {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: rgba(59, 130, 246, 0.15);
          border: 1px solid rgba(59, 130, 246, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #60a5fa;
          flex-shrink: 0;
        }

        .sidebar-nav {
          list-style: none;
          margin: 0;
          padding: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
          position: relative;
        }

        .sidebar-link {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 12px;
          border-radius: 10px;
          color: #6b7280;
          font-size: 13.5px;
          font-weight: 500;
          text-decoration: none;
          transition: all 0.15s ease;
          position: relative;
          letter-spacing: -0.1px;
        }

        .sidebar-link:hover {
          color: #d1d5db;
          background: rgba(255,255,255,0.04);
        }

        .sidebar-link.active {
          color: #93c5fd;
          background: rgba(59, 130, 246, 0.12);
        }

        .sidebar-link.active::before {
          content: "";
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 3px;
          height: 60%;
          background: #3b82f6;
          border-radius: 0 3px 3px 0;
        }

        .sidebar-link-icon {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
          opacity: 0.9;
        }

        .sidebar-footer {
          position: relative;
          padding-top: 14px;
          border-top: 1px solid rgba(30, 58, 138, 0.2);
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .sidebar-user-avatar {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: rgba(59, 130, 246, 0.15);
          border: 1px solid rgba(59, 130, 246, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          color: #60a5fa;
          flex-shrink: 0;
          text-transform: uppercase;
        }

        .sidebar-user-email {
          flex: 1;
          font-size: 12px;
          color: #6b7280;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .sidebar-logout {
          width: 28px;
          height: 28px;
          border-radius: 7px;
          border: 1px solid rgba(148, 163, 184, 0.15);
          background: transparent;
          color: #6b7280;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0.15s;
        }

        .sidebar-logout:hover {
          color: #ef4444;
          border-color: rgba(239, 68, 68, 0.3);
          background: rgba(239, 68, 68, 0.07);
        }

        /* ── Main content area ── */
        .main-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          height: 100vh;
          overflow: hidden;
        }

        /* ── Mobile header ── */
        .mobile-header {
          display: none;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: rgba(2, 6, 23, 0.95);
          border-bottom: 1px solid rgba(30, 58, 138, 0.25);
          backdrop-filter: blur(10px);
          flex-shrink: 0;
          z-index: 30;
        }

        .mobile-brand {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #e5e7eb;
          font-size: 14px;
          font-weight: 700;
        }

        .mobile-menu-btn {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: transparent;
          color: #9ca3af;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        /* ── Page scroll area ── */
        .page-scroll {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          background: radial-gradient(ellipse at 20% 0%, rgba(37,99,235,0.12) 0%, transparent 50%),
                      radial-gradient(ellipse at 80% 100%, rgba(14,116,144,0.1) 0%, transparent 50%),
                      #020617;
          scrollbar-width: thin;
          scrollbar-color: rgba(59,130,246,0.2) transparent;
        }

        .page-scroll::-webkit-scrollbar { width: 6px; }
        .page-scroll::-webkit-scrollbar-track { background: transparent; }
        .page-scroll::-webkit-scrollbar-thumb {
          background: rgba(59,130,246,0.2);
          border-radius: 3px;
        }

        .page-inner {
          padding: 32px 40px 48px;
          max-width: 1280px;
          margin: 0 auto;
          width: 100%;
          min-height: 100%;
          color: #e5e7eb;
        }

        /* ── Mobile drawer overlay ── */
        .mobile-drawer-overlay {
          display: none;
          position: fixed;
          inset: 0;
          z-index: 40;
          background: rgba(2, 6, 23, 0.7);
          backdrop-filter: blur(4px);
        }

        .mobile-drawer {
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          width: 240px;
          z-index: 50;
          background: #020a1a;
          border-right: 1px solid rgba(30, 58, 138, 0.3);
          padding: 20px 12px;
          display: flex;
          flex-direction: column;
          transform: translateX(-100%);
          transition: transform 0.25s ease;
        }

        .mobile-drawer.open {
          transform: translateX(0);
        }

        /* ── Responsive ── */
        @media (max-width: 768px) {
          .sidebar { display: none; }
          .mobile-header { display: flex; }
          .mobile-drawer-overlay { display: block; }
          .page-inner { padding: 20px 16px 40px; }
        }

        /* ── Pass-through card & existing classes ── */
        .card {
          background: rgba(15, 23, 42, 0.7);
          border-radius: 14px;
          border: 1px solid rgba(30, 64, 175, 0.2);
          overflow: hidden;
          color: #e5e7eb;
        }
        .card-body { padding: 16px 20px; }
      `}</style>

      <div className="layout-root">
        {/* Desktop sidebar */}
        <aside className="sidebar">
          <div className="sidebar-brand">
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
            <div className="sidebar-user-email">{user?.email}</div>
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
          <div
            className="mobile-drawer-overlay"
            onClick={() => setMobileOpen(false)}
          >
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
                <div className="sidebar-user-email">{user?.email}</div>
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
          {/* Mobile top bar */}
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

          {/* Scrollable page content */}
          <div className="page-scroll">
            <div className="page-inner">
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}