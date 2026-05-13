// frontend/src/pages/etl/ETLJobsCard.tsx
import { CheckCircle2, AlertCircle, Loader, Play, RefreshCw, Lock, RotateCcw } from "lucide-react";
import type { Job, JobStatus, JobResult, JobProgress } from "./types";
import { JOBS } from "./constants";
import { fmt, fmtDuration } from "./types";

interface Props {
  jobStatus: Record<string, JobStatus>;
  jobResult: Record<string, JobResult>;
  jobProgress: Record<string, JobProgress>;
  selectedYear: number | "all";
  isJobUnlocked: (job: Job) => boolean;
  onRunJob: (job: Job) => void;
}

function statusIcon(status: JobStatus) {
  if (status === "loading") return <Loader size={14} className="etl-spin" />;
  if (status === "success") return <CheckCircle2 size={14} color="#4ade80" />;
  if (status === "partial") return <AlertCircle size={14} color="#fbbf24" />;
  if (status === "error")   return <AlertCircle size={14} color="#f87171" />;
  return null;
}

function progressLabel(jobId: string, status: JobStatus, jobProgress: Record<string, JobProgress>): string {
  if (status !== "loading") return "";
  const p = jobProgress[jobId];
  if (!p?.active) return "En cours…";
  if (p.pct != null) return `${p.pct.toFixed(0)}%`;
  if (p.rows_inserted != null) return `${fmt(p.rows_inserted)} insérés`;
  return "En cours…";
}

export function ETLJobsCard({ 
  jobStatus, 
  jobResult, 
  jobProgress, 
  selectedYear,
  isJobUnlocked, 
  onRunJob, 
  
   
}: Props) {
  return (
    <div className="etl-card" style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "12px",
      padding: "22px"
    }}>
      <div className="etl-card-title" style={{
        fontSize: "13px",
        fontWeight: 500,
        color: "#93c5fd",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        margin: "0 0 16px",
        display: "flex",
        alignItems: "center",
        gap: "6px"
      }}>
        ⚙️ Étape 2 — Exécuter les tâches ETL
      </div>
      
      <div className="etl-card-desc" style={{
        fontSize: "12px",
        color: "var(--text-muted)",
        marginBottom: "20px"
      }}>
        Exécuter les transformations séquentiellement
      </div>

      <div className="etl-jobs-list" style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px"
      }}>
        {JOBS.map((job, idx) => {
          const unlocked = isJobUnlocked(job);
          const st = jobStatus[job.id] ?? "idle";
          const isLoading = st === "loading";
          const isDone = st === "success";
          const isError = st === "error";
          const result = jobResult[job.id];
          const progLabel = progressLabel(job.id, st, jobProgress);
          
          // ✅ Vérifier si une année est requise pour build-datamart
          const isBuildDatamart = job.id === "build-datamart";
          const yearRequired = isBuildDatamart && selectedYear === "all";
          const isDisabled = !unlocked || isLoading || yearRequired;

          return (
            <div
              key={job.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 16px",
                background: "var(--surface2)",
                borderRadius: "10px",
                border: `1px solid ${isError && !isLoading ? "rgba(239,68,68,.3)" : "var(--border)"}`,
                transition: "all 0.15s",
                opacity: !unlocked ? 0.6 : 1
              }}
            >
              <div className="etl-job-info" style={{ flex: 1 }}>
                <div className="etl-job-name" style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "4px",
                  fontWeight: 600,
                  fontSize: "13px"
                }}>
                  {job.icon} {idx + 1}. {job.label}
                  {isError && !isLoading && (
                    <span style={{
                      fontSize: 9,
                      padding: "2px 8px",
                      borderRadius: 12,
                      background: "rgba(239,68,68,.15)",
                      color: "#f87171",
                      marginLeft: 6
                    }}>
                      Échec
                    </span>
                  )}
                  {yearRequired && !isLoading && (
                    <span style={{
                      fontSize: 9,
                      padding: "2px 8px",
                      borderRadius: 12,
                      background: "rgba(251,191,36,.15)",
                      color: "#fbbf24",
                      marginLeft: 6
                    }}>
                    </span>
                  )}
                </div>

                <div className="etl-job-desc" style={{
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  marginBottom: "4px"
                }}>
                  {job.description}
                </div>

                {!unlocked && !yearRequired && (
                  <div className="etl-job-lock" style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "10px",
                    color: "var(--text-muted)",
                    marginTop: "4px"
                  }}>
                    <Lock size={10} /> {job.lockHint}
                  </div>
                )}

              
                {isLoading && progLabel && (
                  <div style={{ fontSize: 11, color: "#60a5fa", marginTop: 4 }}>
                    ⏳ {progLabel}
                    {jobProgress[job.id]?.elapsed_seconds != null && (
                      <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>
                        ({fmtDuration(jobProgress[job.id]!.elapsed_seconds!)})
                      </span>
                    )}
                  </div>
                )}

                {isError && !isLoading && result?.message && (
                  <div style={{ fontSize: 11, color: "#f87171", marginTop: 4 }}>
                    ✕ {result.message}
                  </div>
                )}

                {isDone && result && (
                  <div className="etl-job-pills" style={{
                    display: "flex",
                    gap: "8px",
                    marginTop: "6px"
                  }}>
                    {result.rows_inserted != null && (
                      <span className="etl-pill pill-green" style={{
                        fontSize: "10px",
                        padding: "2px 8px",
                        borderRadius: "12px",
                        background: "rgba(74,222,128,.12)",
                        color: "#4ade80"
                      }}>
                        ✅ {fmt(result.rows_inserted)} inséré
                      </span>
                    )}
                    {result.rows_processed != null && result.rows_processed > 0 && (
                      <span className="etl-pill pill-blue" style={{
                        fontSize: "10px",
                        padding: "2px 8px",
                        borderRadius: "12px",
                        background: "rgba(59,130,246,.12)",
                        color: "#60a5fa"
                      }}>
                        🔄 {fmt(result.rows_processed)} traité
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="etl-job-actions" style={{
                display: "flex",
                alignItems: "center",
                gap: "12px"
              }}>
                {statusIcon(st)}
                <button
                  className="etl-run-btn"
                  disabled={isDisabled}
                  onClick={() => onRunJob(job)}
                  title={yearRequired ? "Sélectionnez une année spécifique dans l'étape 1" : (job.lockHint || "")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 14px",
                    borderRadius: "6px",
                    background: isDisabled ? "var(--surface)" : (isLoading ? "var(--surface2)" : "#3b82f6"),
                    border: "none",
                    color: isDisabled ? "var(--text-muted)" : (isLoading ? "var(--text-main)" : "white"),
                    fontSize: "11px",
                    fontWeight: 500,
                    cursor: isDisabled ? "not-allowed" : "pointer",
                    transition: "all 0.15s",
                    opacity: isDisabled ? 0.5 : 1
                  }}
                >
                  {isLoading ? (
                    <><Loader size={11} className="etl-spin" /> {progLabel || "En cours…"}</>
                  ) : isDone ? (
                    <><RefreshCw size={11} /> Re-exécuter</>
                  ) : (
                    <><Play size={11} /> Exécuter</>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>     
    </div>
  );
}