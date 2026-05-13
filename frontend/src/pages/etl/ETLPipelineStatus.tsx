// frontend/src/pages/etl/ETLPipelineStatus.tsx
import { CheckCircle2, AlertCircle, Loader, RefreshCw, Play } from "lucide-react";
import type { PipelineStatus, YearPipelineStatus } from "./types";

interface Props {
  pipelineStatus: PipelineStatus | null;
  checkingStatus: boolean;
  onRefresh: () => void;
  yearsPipelineStatus: YearPipelineStatus[];
  loadingPipelineStatus: boolean;
  continuingYear: number | null;
  onContinueYear: (year: number, step: string) => void;
}

export function ETLPipelineStatus({
  pipelineStatus,
  checkingStatus,
  onRefresh,
  yearsPipelineStatus,
  loadingPipelineStatus,
  continuingYear,
  onContinueYear,
}: Props) {
  // ✅ Vérification réelle des données
  const hasRawData = (pipelineStatus?.raw?.count || 0) > 0;
  const hasCleanData = (pipelineStatus?.clean?.count || 0) > 0;
  const hasFactData = (pipelineStatus?.datamart?.count || 0) > 0;
  
  // ✅ Clean est complet si raw et clean ont le même nombre
  const isCleanComplete = hasCleanData && 
    (pipelineStatus?.clean?.count === pipelineStatus?.raw?.count);
  
  // ✅ Datamart est complet si toutes les années de clean sont dans fact
  const isDatamartComplete = pipelineStatus?.datamart?.is_complete || 
    (hasFactData && pipelineStatus?.datamart?.completion_percentage === 100);
  
  const steps = [
    { 
      key: "csv", 
      label: "CSV Importé", 
      icon: "📁", 
      done: hasRawData,
      partial: false 
    },
    { 
      key: "raw", 
      label: "Données brutes", 
      icon: "💾", 
      done: hasRawData, 
      partial: false
    },
    { 
      key: "clean", 
      label: "Données nettoyées", 
      icon: "🧹", 
      done: isCleanComplete,
      partial: hasCleanData && !isCleanComplete
    },
    { 
      key: "datamart", 
      label: "Datamart", 
      icon: "⭐", 
      done: isDatamartComplete,
      partial: hasFactData && !isDatamartComplete
    },
  ];

  const incompleteYears = yearsPipelineStatus.filter((ys) => !ys.fact_exists && ys.clean_exists);

  return (
    <>
      {/* État global du pipeline */}
      <div className="etl-pipeline" style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        padding: "16px",
        marginBottom: "20px"
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <RefreshCw size={13} className={checkingStatus ? "etl-spin" : ""} />
            <span style={{ fontWeight: 600, fontSize: "13px" }}>État global du pipeline</span>
          </div>
          <button 
            onClick={onRefresh} 
            disabled={checkingStatus}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              padding: "4px 10px",
              cursor: checkingStatus ? "not-allowed" : "pointer",
              fontSize: "11px",
              color: "var(--text-muted)"
            }}
          >
            {checkingStatus ? (
              <Loader size={12} className="etl-spin" />
            ) : (
              <><RefreshCw size={12} /> Actualiser</>
            )}
          </button>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "12px"
        }}>
          {steps.map((step) => (
            <div key={step.key} style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px",
              padding: "10px",
              borderRadius: "8px",
              background: step.done ? "rgba(74,222,128,.08)" : step.partial ? "rgba(251,191,36,.08)" : "var(--surface2)"
            }}>
              <div style={{ fontSize: "24px" }}>{step.icon}</div>
              <div style={{ fontSize: "11px", fontWeight: 500 }}>{step.label}</div>
              {step.done ? (
                <CheckCircle2 size={14} color="#4ade80" />
              ) : step.partial ? (
                <AlertCircle size={14} color="#fbbf24" />
              ) : (
                <div style={{ width: 14, height: 14, opacity: 0.4 }}>○</div>
              )}
            </div>
          ))}
        </div>

        {/* Message de progression */}
        {pipelineStatus && !isDatamartComplete && hasCleanData && (
          <div style={{
            marginTop: 12,
            padding: 8,
            background: "rgba(59,130,246,.1)",
            borderRadius: 6,
            textAlign: "center",
            fontSize: 11,
            color: "#60a5fa"
          }}>
            📊 Datamart : {pipelineStatus.datamart?.count?.toLocaleString("fr-FR") || 0} / {pipelineStatus.clean?.count?.toLocaleString("fr-FR") || 0} enregistrements
            ({pipelineStatus.datamart?.completion_percentage || 0}%)
          </div>
        )}

        {pipelineStatus && isDatamartComplete && (
          <div style={{
            marginTop: 12,
            padding: 8,
            background: "rgba(74,222,128,.1)",
            borderRadius: 6,
            textAlign: "center",
            fontSize: 11,
            color: "#4ade80"
          }}>
            ✅ Datamart complet !
          </div>
        )}
      </div>

      {/* Grille des années incomplètes (clean existe mais pas datamart) */}
      {loadingPipelineStatus ? (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          padding: "40px",
          color: "var(--text-muted)"
        }}>
          <Loader size={20} className="etl-spin" />
          <span>Chargement de l'état du pipeline...</span>
        </div>
      ) : incompleteYears.length > 0 ? (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "12px",
          marginTop: "16px"
        }}>
          {incompleteYears.map((ys) => {
            const nextStep = "datamart";
            const stepLabel = "Datamart";

            return (
              <div key={ys.year} style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "10px",
                padding: "12px"
              }}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px"
                }}>
                  <span style={{ fontSize: "18px", fontWeight: 600 }}>{ys.year}</span>
                  <span style={{
                    fontSize: "10px",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    background: "#fbbf2420",
                    color: "#fbbf24"
                  }}>
                    🧹 Clean complet
                  </span>
                </div>
                
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "12px",
                  fontSize: "11px",
                  color: "var(--text-muted)"
                }}>
                  <span>📄 Raw: {ys.raw_count.toLocaleString("fr-FR")}</span>
                  <span>🧹 Clean: {ys.clean_count.toLocaleString("fr-FR")}</span>
                  <span>⭐ Datamart: {ys.fact_count.toLocaleString("fr-FR")}</span>
                </div>

                <button
                  onClick={() => onContinueYear(ys.year, nextStep)}
                  disabled={continuingYear === ys.year}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    padding: "8px",
                    background: continuingYear === ys.year ? "var(--surface2)" : "#3b82f6",
                    border: "none",
                    borderRadius: "6px",
                    color: continuingYear === ys.year ? "var(--text-muted)" : "white",
                    fontSize: "11px",
                    cursor: continuingYear === ys.year ? "not-allowed" : "pointer"
                  }}
                >
                  {continuingYear === ys.year ? (
                    <><Loader size={10} className="etl-spin" /> Construction en cours...</>
                  ) : (
                    <><Play size={10} /> Construire le datamart ({stepLabel})</>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      ) : yearsPipelineStatus.length > 0 && (
        <div style={{
          marginTop: "12px",
          padding: "8px",
          background: "rgba(74,222,128,.08)",
          borderRadius: "6px",
          textAlign: "center",
          fontSize: "11px",
          color: "#4ade80"
        }}>
          ✅ Toutes les années sont complètes dans le datamart !
        </div>
      )}
    </>
  );
}