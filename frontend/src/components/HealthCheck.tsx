import React, { useEffect, useState } from "react";
import axios from "axios";
import { Activity, Server, Database, AlertCircle } from "lucide-react";

type HealthResponse = {
  status: string;
  db?: string;
  detail?: string;
};

const HealthCheck: React.FC = () => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios
      .get<HealthResponse>("http://127.0.0.1:5050/health")
      .then((res) => {
        setHealth(res.data);
      })
      .catch((err: any) => {
        if (err.response) {
          setError(`Status ${err.response.status}: ${JSON.stringify(err.response.data)}`);
        } else if (err.request) {
          setError("No response received from server");
        } else {
          setError(`Error: ${err.message}`);
        }
      });
  }, []);

  return (
    <div className="card">
      <div className="health-header">
        <Activity size={20} className="text-muted" />
        <h2 style={{ fontSize: '1.125rem', fontWeight: 500 }}>System Status</h2>
      </div>
      
      <div className="health-body">
        {error && (
          <div className="alert alert-danger">
            <AlertCircle size={20} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}
        
        {health && (
          <div>
            <div className="status-row">
              <div className="flex items-center gap-2">
                <Server size={20} className="text-muted" />
                <span style={{ fontWeight: 500 }}>API Server</span>
              </div>
              <span className={`badge ${health.status === 'ok' ? 'badge-success' : 'badge-warning'}`}>
                {health.status.toUpperCase()}
              </span>
            </div>
            
            {health.db && (
              <div className="status-row">
                <div className="flex items-center gap-2">
                  <Database size={20} className="text-muted" />
                  <span style={{ fontWeight: 500 }}>Database</span>
                </div>
                <span className={`badge ${health.db === 'ok' ? 'badge-success' : 'badge-warning'}`}>
                  {health.db.toUpperCase()}
                </span>
              </div>
            )}
            
            {health.detail && (
              <div className="code-block mt-4">
                {health.detail}
              </div>
            )}
          </div>
        )}
        
        {!health && !error && (
          <div className="spinner"></div>
        )}
      </div>
    </div>
  );
};

export default HealthCheck;