
/**
 * 📊 COMPOSANT JOB MONITOR - Surveillance des tâches ETL en arrière-plan
 * 
 * Ce composant affiche une fenêtre flottante (en bas à droite) qui montre
 * les tâches ETL actuellement en cours d'exécution sur le serveur.
 * 
 * 🎯 Objectifs :
 * - Visualiser les tâches longues (nettoyage, datamart, etc.)
 * - Voir la durée d'exécution de chaque tâche
 * - Être informé quand une tâche est en cours (feedback utilisateur)
 * - Fonctionner en mode autonome ou intégré dans une page parente
 

 * 🎨 UI/UX :
 * - N'apparaît que si au moins 1 job est en cours
 */


import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { Square, Loader } from "lucide-react";

const API = import.meta.env.VITE_API_URL;

interface RunningJob {
  job_id: string;
  name: string;
  started_at: string;
  duration_seconds: number;
  process_id: number;
}

interface JobMonitorProps {
  runningJobs?: RunningJob[];
}

export const JobMonitor: React.FC<JobMonitorProps> = ({
  runningJobs: externalJobs,
}) => {
  const { token } = useAuth();
  const [internalJobs, setInternalJobs] = useState<RunningJob[]>([]);


  const jobs = externalJobs ?? internalJobs;
  const isStandalone = externalJobs === undefined;

  const fetchRunningJobs = useCallback(async () => {
    if (!token || !isStandalone) return;
    try {
      const res = await axios.get(`${API}/etl/running-jobs`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10_000,
      });
      setInternalJobs(res.data.running_jobs ?? []);
    } catch {
    }
  }, [token, isStandalone]);

  useEffect(() => {
    if (!isStandalone) return;
    fetchRunningJobs();
    // Poll every 5 s when running standalone 
    const id = setInterval(fetchRunningJobs, 5_000);
    return () => clearInterval(id);
  }, [fetchRunningJobs, isStandalone]);



  const fmtDuration = (s: number) => {
    if (s < 60) return `${Math.floor(s)}s`;
    return `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`;
  };

  if (jobs.length === 0) return null;

  return (
    <div className="job-monitor">
      <div className="job-monitor-header">
        <div className="job-monitor-title">
          <Loader size={14} className="spin" />
          Tâches en cours ({jobs.length})
        </div>
      </div>

      <div className="job-monitor-list">
        {jobs.map((job) => (
          <div key={job.job_id} className="job-monitor-item">
            <div className="job-info">
              <span className="job-name">{job.name}</span>
              <span className="job-duration">
                En cours depuis {fmtDuration(job.duration_seconds)}
              </span>
            </div>
        
          </div>
        ))}
      </div>

      <style>{`
        .job-monitor {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 320px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          z-index: 1000;
          overflow: hidden;
        }
        .job-monitor-header {
          padding: 12px 16px;
          background: var(--surface2);
          border-bottom: 1px solid var(--border);
        }
        .job-monitor-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-main);
        }
        .job-monitor-error {
          padding: 8px 16px;
          font-size: 11px;
          color: #f87171;
          background: rgba(239,68,68,0.08);
          border-bottom: 1px solid var(--border);
        }
        .job-monitor-list {
          max-height: 300px;
          overflow-y: auto;
        }
        .job-monitor-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border);
        }
        .job-monitor-item:last-child { border-bottom: none; }
        .job-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .job-name {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-main);
        }
        .job-duration {
          font-size: 10px;
          color: var(--text-muted);
          font-family: monospace;
        }
        .job-cancel-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 6px;
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          color: #f87171;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .job-cancel-btn:hover:not(:disabled) {
          background: rgba(239,68,68,0.2);
          border-color: #f87171;
        }
        .job-cancel-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
};