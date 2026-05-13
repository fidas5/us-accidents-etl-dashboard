// frontend/src/pages/etl/ETLUploadCard.tsx
import { useRef } from "react";
import { Upload, CheckCircle2, AlertCircle, Loader, BarChart3, FileText } from "lucide-react";
import type { JobStatus, CSVAnalysis } from "./types";
import { fmt } from "./types";

interface Props {
  file: File | null;
  colErrors: string[];
  colOk: boolean;
  uploadStatus: JobStatus;
  uploadMsg: string;
  uploadProgress: number;
  csvAnalysis: CSVAnalysis | null;
  isAnalyzing: boolean;
  selectedYear: number | "all";
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUpload: () => void;
  onSelectYear: (year: number | "all") => void;
}

export function ETLUploadCard({
  file,
  colErrors,
  colOk,
  uploadStatus,
  uploadMsg,
  uploadProgress,
  csvAnalysis,
  isAnalyzing,
  selectedYear,
  onFileChange,
  onUpload,
  onSelectYear,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="etl-card" style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "12px",
      padding: "22px"
    }}>
      <div style={{
        fontSize: "13px",
        fontWeight: 500,
        color: "#93c5fd",
        marginBottom: "16px",
        display: "flex",
        alignItems: "center",
        gap: "6px"
      }}>
        <FileText size={14} /> Étape 1 — Importer et analyser le CSV
      </div>
      
      <div style={{
        fontSize: "12px",
        color: "var(--text-muted)",
        marginBottom: "16px"
      }}>
        Jeu de données des accidents routiers aux États-Unis (fichier CSV)
      </div>

      {/* Zone de dépôt */}
      <div
        onClick={() => fileRef.current?.click()}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px",
          border: `2px dashed ${colErrors.length > 0 ? "#f87171" : colOk ? "#4ade80" : "var(--border)"}`,
          borderRadius: "12px",
          background: "var(--surface2)",
          cursor: "pointer",
          marginBottom: "16px"
        }}
      >
        <Upload size={24} color={colErrors.length > 0 ? "#f87171" : colOk ? "#4ade80" : "#3b82f6"} />
        <div style={{ marginTop: 8, fontSize: "13px", color: "var(--text-muted)" }}>
          Cliquez pour parcourir
        </div>
        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
          fichiers .csv seulement
        </div>
        {file && (
          <div style={{
            marginTop: 8,
            fontSize: "11px",
            fontFamily: "monospace",
            color: "#60a5fa"
          }}>
            📄 {file.name}
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={onFileChange} />

      {/* Erreurs de colonnes */}
      {colErrors.length > 0 && (
        <div style={{
          padding: "10px",
          borderRadius: "8px",
          background: "rgba(239,68,68,.1)",
          color: "#f87171",
          fontSize: "12px",
          marginBottom: "16px"
        }}>
          <strong>Colonnes requises manquantes :</strong> {colErrors.join(", ")}
        </div>
      )}

      {/* Barre de progression */}
      {uploadStatus === "loading" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{
            height: "4px",
            background: "var(--surface2)",
            borderRadius: "2px",
            overflow: "hidden"
          }}>
            <div style={{
              width: `${uploadProgress}%`,
              height: "100%",
              background: "linear-gradient(90deg, #3b82f6, #60a5fa)"
            }} />
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px", textAlign: "center" }}>
            {uploadProgress}% téléchargé
          </div>
        </div>
      )}

      {/* Bouton upload */}
      <button
        disabled={!file || uploadStatus === "loading" || uploadStatus === "success" || colErrors.length > 0}
        onClick={onUpload}
        style={{
          width: "100%",
          padding: "10px",
          borderRadius: "8px",
          border: "none",
          background: (!file || uploadStatus === "loading" || uploadStatus === "success" || colErrors.length > 0)
            ? "var(--surface2)"
            : "linear-gradient(135deg, #3b82f6, #6366f1)",
          color: (!file || uploadStatus === "loading" || uploadStatus === "success" || colErrors.length > 0)
            ? "var(--text-muted)"
            : "white",
          fontSize: "13px",
          fontWeight: 500,
          cursor: (!file || uploadStatus === "loading" || uploadStatus === "success" || colErrors.length > 0)
            ? "not-allowed"
            : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          marginBottom: "16px"
        }}
      >
        {uploadStatus === "loading" ? (
          <><Loader size={13} className="etl-spin" /> Téléchargement...</>
        ) : uploadStatus === "success" ? (
          <><CheckCircle2 size={13} /> Fichier importé</>
        ) : (
          <><Upload size={13} /> Importer le CSV</>
        )}
      </button>

      {/* Message résultat */}
      {uploadMsg && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px",
          borderRadius: "8px",
          background: uploadStatus === "success" ? "rgba(74,222,128,.1)" : "rgba(239,68,68,.1)",
          fontSize: "12px",
          color: uploadStatus === "success" ? "#4ade80" : "#f87171",
          marginBottom: "16px"
        }}>
          {uploadStatus === "success" ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          {uploadMsg}
        </div>
      )}

      {/* Sélecteur d'année */}
      {csvAnalysis && !isAnalyzing && (
        <div style={{
          marginTop: "8px",
          paddingTop: "16px",
          borderTop: "1px solid var(--border)"
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "11px",
            color: "var(--text-muted)",
            marginBottom: "12px"
          }}>
            <BarChart3 size={13} />
            Filtrer par année
          </div>
          
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <button
              onClick={() => onSelectYear("all")}
              style={{
                padding: "4px 12px",
                borderRadius: "16px",
                border: "1px solid var(--border)",
                background: selectedYear === "all" ? "#3b82f6" : "transparent",
                color: selectedYear === "all" ? "white" : "var(--text-muted)",
                fontSize: "11px",
                cursor: "pointer"
              }}
            >
              Toutes ({fmt(csvAnalysis.total_rows_scanned)})
            </button>
            {csvAnalysis.available_years?.map((y) => (
              <button
                key={y}
                onClick={() => onSelectYear(y)}
                style={{
                  padding: "4px 12px",
                  borderRadius: "16px",
                  border: "1px solid var(--border)",
                  background: selectedYear === y ? "#3b82f6" : "transparent",
                  color: selectedYear === y ? "white" : "var(--text-muted)",
                  fontSize: "11px",
                  cursor: "pointer"
                }}
              >
                {y} ({fmt(csvAnalysis.year_counts?.[y])})
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}