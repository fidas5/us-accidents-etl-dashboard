import React, { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { Play, Square, Loader, CheckCircle2, AlertCircle } from "lucide-react";

interface RunningJob {
  job_id: string;
  name: string;
  started_at: string;
  duration_seconds: number;
  process_id: number;
}

interface JobMonitorProps {
  onJobCancelled?: () => void;
}

export const JobMonitor: React.FC<JobMonitorProps> = ({ onJobCancelled }) => {
  const { token } = useAuth();
  const [runningJobs, setRunningJobs] = useState<RunningJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancellingJob, setCancellingJob] = useState<string | null>(null);

  const fetchRunningJobs = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await axios.get("http://127.0.0.1:5050/etl/running-jobs", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRunningJobs(res.data.running_jobs || []);
    } catch (err) {
      console.error("Failed to fetch running jobs:", err);
    } finally {
      setLoading(false);
    }
  };

  const cancelJob = async (jobId: string) => {
    if (!token) return;
    setCancellingJob(jobId);
    try {
      await axios.post(`http://127.0.0.1:5050/etl/cancel-job/${jobId}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Refresh the list
      await fetchRunningJobs();
      if (onJobCancelled) onJobCancelled();
    } catch (err) {
      console.error("Failed to cancel job:", err);
    } finally {
      setCancellingJob(null);
    }
  };

  useEffect(() => {
    fetchRunningJobs();
    // Poll every 3 seconds for updates
    const interval = setInterval(fetchRunningJobs, 3000);
    return () => clearInterval(interval);
  }, [token]);

  if (runningJobs.length === 0) {
    return null;
  }

  return (
    <div className="job-monitor">
      <div className="job-monitor-header">
        <div className="job-monitor-title">
          <Loader size={14} className="spin" />
          Running Jobs ({runningJobs.length})
        </div>
      </div>
      <div className="job-monitor-list">
        {runningJobs.map(job => (
          <div key={job.job_id} className="job-monitor-item">
            <div className="job-info">
              <span className="job-name">{job.name}</span>
              <span className="job-duration">
                Running for {Math.floor(job.duration_seconds)}s
              </span>
            </div>
            <button
              className="job-cancel-btn"
              onClick={() => cancelJob(job.job_id)}
              disabled={cancellingJob === job.job_id}
            >
              {cancellingJob === job.job_id ? (
                <Loader size={14} className="spin" />
              ) : (
                <Square size={14} />
              )}
              Stop
            </button>
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
        .job-monitor-item:last-child {
          border-bottom: none;
        }
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
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
};