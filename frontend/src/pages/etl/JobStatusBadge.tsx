// frontend/src/pages/etl/JobStatusBadge.tsx
import { Loader, CheckCircle2, AlertCircle, Clock, XCircle } from "lucide-react";
import { isInProgress } from "./types";

interface Props {
  status: string;
  showIcon?: boolean;  // Optionnel : afficher ou non l'icône
  size?: "sm" | "md";  // Optionnel : taille du badge
}

/**
 * Badge d'affichage du statut d'un job ETL
 * 
 * Statuts gérés :
 * - success     → Succès (vert)
 * - running     → En cours (bleu avec spinner)
 * - pending     → En attente (gris)
 * - timeout     → Expiré (orange)
 * - error/failed→ Échec (rouge)
 * - autre       → Inconnu (gris)
 * 
 * @param status - Statut du job
 * @param showIcon - Afficher l'icône (défaut: true)
 * @param size - Taille du badge: "sm" (petit) ou "md" (moyen, défaut)
 */
export function JobStatusBadge({ status, showIcon = true, size = "md" }: Props) {
  // Tailles prédéfinies
  const sizes = {
    sm: { padding: "2px 8px", fontSize: "9px", gap: "3px", iconSize: 8 },
    md: { padding: "2px 10px", fontSize: "10px", gap: "4px", iconSize: 10 },
  };
  
  const styleSize = sizes[size] || sizes.md;

  // 1️⃣ SUCCÈS
  if (status === "success") {
    return (
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        gap: styleSize.gap,
        padding: styleSize.padding,
        borderRadius: "20px",
        fontSize: styleSize.fontSize,
        fontWeight: 600,
        background: "rgba(74,222,128,.12)",
        color: "#4ade80",
      }}>
        {showIcon && <CheckCircle2 size={styleSize.iconSize} />}
        Succès
      </span>
    );
  }

  // 2️⃣ EN COURS (running, pending, processing, active, loading)
  if (isInProgress(status)) {
    let label = "En cours";
    let bgColor = "rgba(59,130,246,.12)";
    let textColor = "#60a5fa";
    
    // Sous-types pour plus de précision
    if (status === "pending") {
      label = "En attente";
      bgColor = "rgba(148,163,184,.12)";
      textColor = "#94a3b8";
    } else if (status === "timeout") {
      label = "Expiré";
      bgColor = "rgba(251,146,60,.12)";
      textColor = "#fb923c";
    }
    
    return (
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        gap: styleSize.gap,
        padding: styleSize.padding,
        borderRadius: "20px",
        fontSize: styleSize.fontSize,
        fontWeight: 600,
        background: bgColor,
        color: textColor,
      }}>
        {showIcon && (status === "pending" ? (
          <Clock size={styleSize.iconSize} />
        ) : (
          <Loader size={styleSize.iconSize} className="etl-spin" />
        ))}
        {label}
      </span>
    );
  }

  // 3️⃣ TIMEOUT (déjà traité ci-dessus mais gardé pour compatibilité)
  if (status === "timeout") {
    return (
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        gap: styleSize.gap,
        padding: styleSize.padding,
        borderRadius: "20px",
        fontSize: styleSize.fontSize,
        fontWeight: 600,
        background: "rgba(251,146,60,.12)",
        color: "#fb923c",
      }}>
        {showIcon && <Clock size={styleSize.iconSize} />}
        Expiré
      </span>
    );
  }

  // 4️⃣ ÉCHEC
  if (status === "error" || status === "failed") {
    return (
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        gap: styleSize.gap,
        padding: styleSize.padding,
        borderRadius: "20px",
        fontSize: styleSize.fontSize,
        fontWeight: 600,
        background: "rgba(239,68,68,.12)",
        color: "#f87171",
      }}>
        {showIcon && <XCircle size={styleSize.iconSize} />}
        Échec
      </span>
    );
  }

  // 5️⃣ STATUT INCONNU
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: styleSize.gap,
      padding: styleSize.padding,
      borderRadius: "20px",
      fontSize: styleSize.fontSize,
      fontWeight: 600,
      background: "rgba(148,163,184,.12)",
      color: "#94a3b8",
    }}>
      {showIcon && <AlertCircle size={styleSize.iconSize} />}
      {status || "Inconnu"}
    </span>
  );
}