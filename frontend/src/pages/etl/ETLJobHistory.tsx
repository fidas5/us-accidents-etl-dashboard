// frontend/src/pages/etl/ETLJobHistory.tsx
import { CheckCircle2, AlertCircle, Loader, RefreshCw, History, ChevronUp, ChevronDown } from "lucide-react";
import { fmt, fmtDuration, getDisplayStatus } from "./types";
import type { JobHistoryItem } from "./types";
import { JobStatusBadge } from "./JobStatusBadge";

interface Props {
  jobHistory: JobHistoryItem[];
  showHistory: boolean;
  isLoadingHistory: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}

export function ETLJobHistory({ 
  jobHistory, 
  showHistory, 
  isLoadingHistory, 
  onToggle, 
  onRefresh 
}: Props) {
  return (
    <>
      {/* Bouton bascule */}
      <button
        onClick={onToggle}
        style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: "8px", 
          padding: "12px 16px", 
          background: "var(--surface)", 
          border: "1px solid var(--border)", 
          borderRadius: "10px", 
          cursor: "pointer", 
          width: "100%", 
          marginBottom: "12px" 
        }}
      >
        <History size={15} />
        <span>📜 Historique des exécutions ETL</span>
        <span style={{ 
          marginLeft: "auto", 
          fontSize: "10px", 
          padding: "2px 10px", 
          borderRadius: "20px", 
          background: "var(--surface2)" 
        }}>
          {jobHistory.length} tâche{jobHistory.length > 1 ? 's' : ''}
        </span>
        {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {/* Panneau d'historique */}
      {showHistory && (
        <div style={{ 
          background: "var(--surface)", 
          border: "1px solid var(--border)", 
          borderRadius: "12px", 
          marginBottom: "20px", 
          overflow: "hidden" 
        }}>
          {/* En-tête */}
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "8px", 
            padding: "14px 20px", 
            background: "var(--surface2)", 
            borderBottom: "1px solid var(--border)", 
            fontWeight: 600, 
            color: "#93c5fd", 
            textTransform: "uppercase", 
            fontSize: "11px" 
          }}>
            <History size={14} />
            <span>Exécutions récentes</span>
            <button
              onClick={onRefresh}
              disabled={isLoadingHistory}
              style={{ 
                marginLeft: "auto", 
                background: "transparent", 
                border: "1px solid var(--border)", 
                borderRadius: "6px", 
                padding: "4px 10px", 
                cursor: "pointer", 
                display: "flex", 
                alignItems: "center", 
                gap: "6px", 
                fontSize: "11px" 
              }}
            >
              {isLoadingHistory ? (
                <Loader size={12} className="etl-spin" />
              ) : (
                <><RefreshCw size={12} /> Actualiser</>
              )}
            </button>
          </div>

          {/* Corps - États */}
          {isLoadingHistory ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
              <Loader size={22} className="etl-spin" />
              <div style={{ marginTop: "8px", fontSize: "12px" }}>Chargement de l'historique...</div>
            </div>
          ) : jobHistory.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
              <History size={32} style={{ opacity: 0.3, marginBottom: "12px" }} />
              <div>Aucune tâche ETL n'a encore été exécutée</div>
              <div style={{ fontSize: "11px", marginTop: "8px" }}>
                Utilisez les boutons ci-dessus pour lancer votre première tâche
              </div>
            </div>
          ) : (
            <div style={{ maxHeight: "420px", overflowY: "auto" }}>
              {jobHistory.map((job) => {
                const displayStatus = getDisplayStatus(job);
                const isSuccess = job.status === "success";
                const isError = job.status === "error";
                
                return (
                  <div 
                    key={job.id} 
                    style={{ 
                      padding: "14px 20px", 
                      borderBottom: "1px solid var(--border)",
                      transition: "background 0.15s",
                      cursor: "pointer"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--surface2)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {/* Ligne principale */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, fontSize: "13px" }}>{job.name}</span>
                        <JobStatusBadge status={job.status} />
                      </div>
                      <div style={{ fontSize: "10px", color: "var(--text-faint)", fontFamily: "monospace" }}>
                        {new Date(job.created_at).toLocaleString("fr-FR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </div>
                    </div>

                    {/* Métriques */}
                    <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: job.error_message ? "8px" : 0 }}>
                      {job.rows_inserted > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--text-muted)" }}>
                          <CheckCircle2 size={11} color="#4ade80" />
                          <span><strong>{fmt(job.rows_inserted)}</strong> inséré{job.rows_inserted > 1 ? 's' : ''}</span>
                        </div>
                      )}
                      {job.rows_processed > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--text-muted)" }}>
                          <RefreshCw size={11} />
                          <span><strong>{fmt(job.rows_processed)}</strong> traité{job.rows_processed > 1 ? 's' : ''}</span>
                        </div>
                      )}
                      {job.duration_seconds > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--text-muted)" }}>
                          ⏱️ <strong>{fmtDuration(job.duration_seconds)}</strong>
                        </div>
                      )}
                    </div>

                    {/* Message d'erreur */}
                    {job.error_message && (
                      <div style={{ 
                        marginTop: "8px", 
                        padding: "8px 12px", 
                        borderRadius: "6px", 
                        background: "rgba(239,68,68,.08)", 
                        border: "1px solid rgba(239,68,68,.15)",
                        color: "#f87171", 
                        fontSize: "11px",
                        fontFamily: "monospace"
                      }}>
                        <AlertCircle size={12} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
                        {job.error_message}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}