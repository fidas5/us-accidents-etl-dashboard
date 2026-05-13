// frontend/src/pages/etl/ETLYearManager.tsx
import { useState } from "react";
import { BarChart3, AlertCircle, Loader, Trash2 } from "lucide-react";

// ✅ Interface étendue pour les données backend
interface YearData {
  year: number;
  count: number;
  raw_count: number;
  clean_count: number;
  fact_count: number;
  has_raw: boolean;
  has_clean: boolean;
  has_fact: boolean;
  status: string;
}

interface Props {
  yearsData: YearData[];
  loadingYears: boolean;
  deletingYear: number | null;
  onDeleteYear: (year: number) => void;
}

export function ETLYearManager({ 
  yearsData, 
  loadingYears, 
  deletingYear, 
  onDeleteYear 
}: Props) {
  const [confirmYear, setConfirmYear] = useState<number | null>(null);

  const handleDelete = (year: number) => {
    if (confirmYear === year) {
      onDeleteYear(year);
      setConfirmYear(null);
    } else {
      setConfirmYear(year);
      setTimeout(() => setConfirmYear(null), 4000);
    }
  };

  // ✅ Obtenir le statut avec les bonnes propriétés
  const getStatus = (year: YearData) => {
    if (year.has_fact) return { text: "Complet", color: "#4ade80", icon: "✅" };
    if (year.has_clean) return { text: "Datamart manquant", color: "#fbbf24", icon: "⚠️" };
    if (year.has_raw) return { text: "Clean manquant", color: "#fb923c", icon: "⚠️" };
    return { text: "Aucune donnée", color: "#64748b", icon: "❌" };
  };

  return (
    <div className="etl-year-manager" style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "12px",
      padding: "22px"
    }}>
      {/* En-tête */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "13px",
        fontWeight: 500,
        color: "#93c5fd",
        marginBottom: "20px"
      }}>
        <BarChart3 size={16} />
        <span>📊 Années dans le datamart</span>
      </div>

      {loadingYears ? (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          padding: "40px",
          color: "var(--text-muted)"
        }}>
          <Loader size={20} className="etl-spin" />
          <span>Chargement des années...</span>
        </div>
      ) : yearsData.length === 0 ? (
        <div style={{
          textAlign: "center",
          padding: "40px",
          color: "var(--text-muted)"
        }}>
          <AlertCircle size={24} style={{ marginBottom: "8px" }} />
          <div>Aucune donnée trouvée</div>
          <div style={{ fontSize: "11px", marginTop: "8px" }}>
            Importez d'abord des données via l'onglet "Exécution des tâches"
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {yearsData.map((item) => {
            const status = getStatus(item);
            
            return (
              <div 
                key={item.year} 
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 16px",
                  background: "var(--surface2)",
                  borderRadius: "10px",
                  border: "1px solid var(--border)",
                  flexWrap: "wrap",
                  gap: "8px"
                }}
              >
                {/* Année et statut */}
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-main)" }}>
                    {item.year}
                  </span>
                  <span style={{
                    fontSize: "11px",
                    color: status.color,
                    background: `${status.color}15`,
                    padding: "4px 10px",
                    borderRadius: "20px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px"
                  }}>
                    <span>{status.icon}</span> {status.text}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    📊 {item.count.toLocaleString("fr-FR")} accidents
                  </span>
                </div>

                {/* Statistiques détaillées (optionnel) */}
                <div style={{ 
                  display: "flex", 
                  gap: "16px", 
                  fontSize: "10px", 
                  color: "var(--text-faint)",
                  fontFamily: "monospace"
                }}>
                  {item.has_raw && (
                    <span>📄 Raw: {item.raw_count.toLocaleString("fr-FR")}</span>
                  )}
                  {item.has_clean && (
                    <span>🧹 Clean: {item.clean_count.toLocaleString("fr-FR")}</span>
                  )}
                  {item.has_fact && (
                    <span>⭐ Datamart: {item.fact_count.toLocaleString("fr-FR")}</span>
                  )}
                </div>

                {/* Bouton suppression - visible si des données existent */}
                {(item.has_raw || item.has_clean || item.has_fact) && (
                  <button
                    onClick={() => handleDelete(item.year)}
                    disabled={deletingYear === item.year}
                    title={confirmYear === item.year ? "Cliquez encore pour confirmer" : "Supprimer cette année (raw + clean + datamart)"}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 14px",
                      borderRadius: "6px",
                      background: confirmYear === item.year ? "rgba(239,68,68,0.25)" : "rgba(239,68,68,0.08)",
                      border: confirmYear === item.year ? "1px solid #f87171" : "1px solid transparent",
                      color: "#f87171",
                      fontSize: "11px",
                      fontWeight: confirmYear === item.year ? 600 : 400,
                      cursor: "pointer",
                      transition: "all 0.15s"
                    }}
                  >
                    {deletingYear === item.year ? (
                      <Loader size={12} className="etl-spin" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                    {confirmYear === item.year ? "Confirmer la suppression ?" : "Supprimer"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      
      {/* Légende */}
      {yearsData.length > 0 && (
        <div style={{
          marginTop: "20px",
          padding: "10px",
          background: "var(--surface2)",
          borderRadius: "8px",
          fontSize: "10px",
          color: "var(--text-muted)",
          textAlign: "center",
          display: "flex",
          justifyContent: "center",
          gap: "16px",
          flexWrap: "wrap"
        }}>
          <span style={{ color: "#4ade80" }}>✅ Complet</span>
          <span style={{ color: "#fbbf24" }}>⚠️ Datamart manquant</span>
          <span style={{ color: "#fb923c" }}>⚠️ Clean manquant</span>
          <span>🗑️ Suppression complète (raw + clean + datamart)</span>
        </div>
      )}
    </div>
  );
}