import React from "react";
import DashboardStats from "../components/DashboardStats";
import { useAuth } from "../context/AuthContext";

export default function DashboardPage() {
  const { token } = useAuth();

  if (!token) {
    return (
      <div className="card">
        <div className="card-body">No auth token</div>
      </div>
    );
  }

  return (
    <div className="dashboard-wrapper">
      <DashboardStats token={token} />
    </div>
  );
}