// src/pages/DashboardPage.tsx
import React from "react";
import DashboardStats from "../components/DashboardStats";
import { useAuth } from "../context/AuthContext";

export default function DashboardPage() {
  const { token } = useAuth();

  if (!token) {
    return (
      <div className="ds-loading">
        No authentication token found.
      </div>
    );
  }

  return <DashboardStats token={token} />;
}