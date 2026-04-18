// src/pages/DashboardPage.tsx
import React from "react";
import DashboardStats from "../components/DashboardStats";
import { useAuth } from "../context/AuthContext";

export default function DashboardPage() {
  const { token } = useAuth();

  if (!token) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "40vh",
        color: "#6b7280",
        fontFamily: "ui-monospace, monospace",
        fontSize: 13,
      }}>
        No authentication token found.
      </div>
    );
  }

  return <DashboardStats token={token} />;
}