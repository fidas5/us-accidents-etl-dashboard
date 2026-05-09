// src/pages/ETLJobs.tsx
import React, { useState, useRef, useEffect, useCallback } from "react";
import axios, { AxiosError } from "axios";
import { useAuth } from "../context/AuthContext";
import {
  Upload, Play, CheckCircle2, AlertCircle, Loader,
  Lock, BarChart3, RefreshCw, PlayCircle, History,
  ChevronDown, ChevronUp, Database, Zap, RotateCcw, Trash2,
  LayoutDashboard, HardDrive, Settings, XCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type JobStatus = "idle" | "loading" | "success" | "error" | "partial";
type TabType = "pipeline" | "jobs" | "manage";

interface JobResult {
  message: string;
  rows_inserted?: number;
  rows_processed?: number;
  rows_skipped?: number;
  detail?: string;
  missing?: string[];
  year_distribution?: Record<string, number>;
  filter_applied?: string;
  new_dimensions?: {
    time: number;
    location: number;
    weather: number;
    road: number;
  };
  total_facts?: number;
}

interface Job {
  id: string;
  label: string;
  description: string;
  endpoint: string;
  dependsOn?: string;
  lockHint: string;
  icon: React.ReactNode;
}

interface CSVAnalysis {
  available_years: number[];
  year_counts: Record<number, number>;
  total_rows_scanned: number;
  valid_dates_found: number;
}

interface JobHistoryItem {
  id: number;
  name: string;
  job_type: string;
  status: string;
  rows_processed: number;
  rows_inserted: number;
  rows_skipped: number;
  error_message: string | null;
  duration_seconds: number;
  created_at: string;
  last_run_at: string;
}

interface PipelineStep {
  exists: boolean;
  count: number;
  is_complete: boolean;
  last_job: {
    status: string;
    rows_inserted: number;
    completed_at: string | null;
    duration_seconds: number;
  } | null;
}

interface PipelineStatus {
  csv_exists: boolean;
  raw: PipelineStep;
  clean: PipelineStep;
  datamart: PipelineStep & {
    expected_count: number;
    missing_records: number;
    completion_percentage: number;
  };
  recommended_action: string;
}

interface RunningJob {
  job_id: string;
  name: string;
  started_at: string;
  duration_seconds: number;
  process_id: number;
}

interface YearData {
  year: number;
  count: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API = "http://127.0.0.1:5050";

const REQUIRED_COLUMNS = [
  "ID", "Start_Time", "End_Time", "City", "State", "Severity",
  "Temperature(F)", "Visibility(mi)", "Weather_Condition", "Start_Lat", "Start_Lng",
];

const JOBS: Job[] = [
  {
    id: "load-raw",
    label: "Charger les données brutes",
    description: "Ingestion CSV → table accidents_raw (ajout des nouvelles années, suppression des doublons)",
    endpoint: "/etl/load-raw",
    dependsOn: "__upload__",
    lockHint: "Téléchargez et analysez d’abord un fichier CSV valide",
    icon: <Database size={14} />,
  },
  {
    id: "build-clean",
    label: "Construire les données nettoyées",
    description: "Validation, conversion des unités (°C / km) et enrichissement → accidents_clean",
    endpoint: "/etl/build-clean",
    dependsOn: "load-raw",
    lockHint: 'Terminez d’abord "Charger les données brutes"',
    icon: <Zap size={14} />,
  },
  {
    id: "build-datamart",
    label: "Construire le datamart",
    description: "Création du schéma en étoile (dimensions et table de faits) pour l’analyse (incrémental)",
    endpoint: "/etl/build-datamart",
    dependsOn: "build-clean",
    lockHint: 'Terminez d’abord "Construire les données nettoyées"',
    icon: <BarChart3 size={14} />,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data;
    if (data?.detail) return String(data.detail);
    if (data?.message) return String(data.message);
    if (err.code === "ECONNABORTED") return "le traitement est toujours en cours sur le serveur";
    if (!err.response) return "Impossible de joindre le serveur?";
    return `Server error ${err.response.status}: ${err.response.statusText}`;
  }
  if (err instanceof Error) return err.message;
  return "Une erreur inattendue s’est produite.";
}

function fmt(n?: number) {
  return n != null ? n.toLocaleString() : "—";
}

function fmtDuration(s: number) {
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = (s % 60).toFixed(0);
  return `${m}m ${rem}s`;
}

function shouldShowPipeline(status: PipelineStatus): boolean {
  const nothingStarted =
    !status.csv_exists &&
    !status.raw.exists &&
    !status.clean.exists &&
    !status.datamart.exists;

  const allDone =
    status.raw.is_complete &&
    status.clean.is_complete &&
    status.datamart.is_complete;

  return !nothingStarted && !allDone;
}

// ─── Composant de dialogue de confirmation ────────────────────────────────────

interface ConfirmDialogProps {
  isOpen: boolean;
  year: number | null;
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}

function ConfirmDialog({ isOpen, year, count, onConfirm, onCancel, deleting }: ConfirmDialogProps) {
  if (!isOpen || !year) return null;
  
  return (
    <div className="etl-modal-overlay">
      <div className="etl-modal">
        <div className="etl-modal-header">
          <AlertCircle size={20} color="#fbbf24" />
          <h3>Confirmer la suppression</h3>
        </div>
        <div className="etl-modal-body">
          <p>Êtes-vous sûr de vouloir supprimer toutes les données de l'année <strong>{year}</strong> ?</p>
          <div className="etl-modal-warning">
            <XCircle size={16} />
            <span>Cette action supprimera <strong>{count.toLocaleString()} accidents</strong> du datamart</span>
          </div>
          <p className="etl-modal-note">
            Les données sources (raw et clean) ne seront pas supprimées.<br/>
            Vous pourrez reconstruire le datamart ultérieurement.
          </p>
        </div>
        <div className="etl-modal-footer">
          <button className="etl-modal-cancel" onClick={onCancel} disabled={deleting}>
            Annuler
          </button>
          <button className="etl-modal-confirm" onClick={onConfirm} disabled={deleting}>
            {deleting ? <Loader size={16} className="etl-spin" /> : <Trash2 size={16} />}
            Supprimer {year}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Composant de gestion des années ─────────────────────────────────────────

interface YearManagerProps {
  yearsData: YearData[];
  loadingYears: boolean;
  onDeleteYear: (year: number, count: number) => void;
}

function YearManager({ yearsData, loadingYears, onDeleteYear }: YearManagerProps) {
  return (
    <div className="etl-year-manager">
      <div className="etl-year-manager-header">
        <Trash2 size={16} />
        <span>Gestion des années du datamart</span>
      </div>
      
      {loadingYears ? (
        <div className="etl-year-loading">
          <Loader size={16} className="etl-spin" />
          <span>Chargement des années...</span>
        </div>
      ) : yearsData.length === 0 ? (
        <div className="etl-year-empty">
          <CheckCircle2 size={16} color="#4ade80" />
          <span>Aucune donnée dans le datamart</span>
        </div>
      ) : (
        <div className="etl-year-list">
          {yearsData.map((item) => (
            <div key={item.year} className="etl-year-card">
              <div className="etl-year-card-info">
                <span className="etl-year-card-number">{item.year}</span>
                <span className="etl-year-card-count">
                  {item.count.toLocaleString()} accidents
                </span>
                <span className="etl-year-card-badge">
                  {item.year === new Date().getFullYear() ? "Année en cours" : 
                   item.year > new Date().getFullYear() ? "Année future" : "Archive"}
                </span>
              </div>
              <button 
                className="etl-year-card-delete"
                onClick={() => onDeleteYear(item.year, item.count)}
              >
                <Trash2 size={14} />
                Supprimer cette année
              </button>
            </div>
          ))}
        </div>
      )}
      
      
    </div>
  );
}

// ─── Composant principal ─────────────────────────────────────────────────────

export default function ETLPage() {
  const { token } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  // Onglet actif
  const [activeTab, setActiveTab] = useState<TabType>("pipeline");

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [colErrors, setColErrors] = useState<string[]>([]);
  const [colOk, setColOk] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<JobStatus>("idle");
  const [uploadMsg, setUploadMsg] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);

  // Analysis state
  const [csvAnalysis, setCsvAnalysis] = useState<CSVAnalysis | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | "all">("all");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Job state
  const [jobStatus, setJobStatus] = useState<Record<string, JobStatus>>({});
  const [jobResult, setJobResult] = useState<Record<string, JobResult>>({});

  // Pipeline / history
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [runningJobs, setRunningJobs] = useState<RunningJob[]>([]);
  const [jobHistory, setJobHistory] = useState<JobHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Year management
  const [yearsData, setYearsData] = useState<YearData[]>([]);
  const [loadingYears, setLoadingYears] = useState(false);
  const [deletingYear, setDeletingYear] = useState<number | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ show: boolean; year: number | null; count: number }>({
    show: false,
    year: null,
    count: 0
  });

  // Pipeline-level error banner
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  // Dedupe refs
  const analysisDoneRef = useRef(false);
  const initialLoadDoneRef = useRef(false);

  // ── Reset all jobs ──────────────────────────────────────────────────────────
  const resetAllJobs = () => {
    setJobStatus({});
    setJobResult({});
    setPipelineError(null);
    checkPipelineStatus();
  };

  // ── Auth header helper ──────────────────────────────────────────────────────
  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  // ── Column validation (client-side) ────────────────────────────────────────
  const validateColumns = (f: File): Promise<{ ok: boolean; missing: string[] }> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const firstLine = (e.target?.result as string).split("\n")[0] ?? "";
        const headers = firstLine.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
        const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
        resolve({ ok: missing.length === 0, missing });
      };
      reader.readAsText(f.slice(0, 8192));
    });

  // ── File selection ──────────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setColErrors([]);
    setColOk(false);
    setUploadStatus("idle");
    setUploadMsg("");
    setUploadProgress(0);
    setCsvAnalysis(null);
    analysisDoneRef.current = false;
    setPipelineError(null);
    if (!f) return;

    const { ok, missing } = await validateColumns(f);
    if (!ok) setColErrors(missing);
    else setColOk(true);
  };

  // ── Combined Upload & Analyze ───────────────────────────────────────────────
  const handleUploadAndAnalyze = async () => {
    if (!file || !token || colErrors.length > 0) return;
    
    setUploadStatus("loading");
    setUploadMsg("");
    setUploadProgress(0);
    setPipelineError(null);
    setIsAnalyzing(true);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await axios.post(`${API}/etl/upload-and-analyze-csv`, form, {
        headers: { ...authHeaders(), "Content-Type": "multipart/form-data" },
        timeout: 600000,
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percent);
          }
        },
      });

      const data = res.data;
      
      if (data.available_years) {
        const analysisData: CSVAnalysis = {
          available_years: data.available_years,
          year_counts: data.year_counts || {},
          total_rows_scanned: data.total_rows_scanned || 0,
          valid_dates_found: data.valid_dates_found || 0,
        };
        
        setCsvAnalysis(analysisData);
        setUploadStatus("success");
        setUploadMsg(`Fichier analysé avec succès. ${analysisData.total_rows_scanned.toLocaleString()} lignes trouvées.`);
        analysisDoneRef.current = true;
        
        if (analysisData.available_years.length > 0) {
          const maxYear = Math.max(...analysisData.available_years);
          setSelectedYear(maxYear);
        }
        
        await checkPipelineStatus();
        await fetchYearsDistribution();
        
      } else if (data.analysis && data.analysis.status === "success") {
        const analysisData: CSVAnalysis = {
          available_years: data.analysis.available_years || [],
          year_counts: data.analysis.year_counts || {},
          total_rows_scanned: data.analysis.total_rows_scanned || 0,
          valid_dates_found: data.analysis.valid_dates_found || 0,
        };
        
        setCsvAnalysis(analysisData);
        setUploadStatus("success");
        setUploadMsg(`✅ ${data.upload?.filename || file.name} analysé avec succès`);
        analysisDoneRef.current = true;
        
        if (analysisData.available_years.length > 0) {
          const maxYear = Math.max(...analysisData.available_years);
          setSelectedYear(maxYear);
        }
        
        await checkPipelineStatus();
        await fetchYearsDistribution();
        
      } else {
        setUploadStatus("error");
        setUploadMsg(data.message || data.analysis?.error || "Analysis failed");
      }
      
    } catch (err) {
      setUploadStatus("error");
      const msg = extractErrorMessage(err);
      setUploadMsg(msg);
      setPipelineError(`Upload failed: ${msg}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Years Distribution ──────────────────────────────────────────────────────
  const fetchYearsDistribution = useCallback(async () => {
    if (!token) return;
    setLoadingYears(true);
    try {
      const res = await axios.get(`${API}/etl/years-distribution`, {
        headers: authHeaders(),
      });
      setYearsData(res.data.years || []);
    } catch (err) {
      console.error("Failed to fetch years:", extractErrorMessage(err));
    } finally {
      setLoadingYears(false);
    }
  }, [token, authHeaders]);

  // ── Delete Year ─────────────────────────────────────────────────────────────
  const handleDeleteClick = (year: number, count: number) => {
    setConfirmDialog({ show: true, year, count });
  };

  const handleConfirmDelete = async () => {
    const { year } = confirmDialog;
    if (!year) return;
    
    setDeletingYear(year);
    setConfirmDialog({ show: false, year: null, count: 0 });
    
    try {
      await axios.post(`${API}/etl/delete-year`, 
        { year, force: true },
        { headers: authHeaders() }
      );
      await fetchYearsDistribution();
      await checkPipelineStatus();
    } catch (err) {
      console.error("Failed to delete year:", extractErrorMessage(err));
      setPipelineError(`Impossible de supprimer l'année ${year}`);
    } finally {
      setDeletingYear(null);
    }
  };

  const handleCancelDelete = () => {
    setConfirmDialog({ show: false, year: null, count: 0 });
  };

  // ── Pipeline Status ─────────────────────────────────────────────────────────
  const checkPipelineStatus = useCallback(async () => {
    if (!token) return;
    setCheckingStatus(true);
    try {
      const res = await axios.get(`${API}/etl/pipeline-status`, {
        headers: authHeaders(),
        timeout: 15_000,
      });
      const data: PipelineStatus = res.data;
      setPipelineStatus(data);

      setJobStatus((prev) => {
        const next = { ...prev };
        if (data.raw.is_complete) next["load-raw"] = "success";
        if (data.clean.is_complete) next["build-clean"] = "success";
        if (data.datamart.is_complete) next["build-datamart"] = "success";
        else if (data.datamart.exists && !data.datamart.is_complete)
          next["build-datamart"] = "partial";
        return next;
      });

      if (data.csv_exists && !analysisDoneRef.current && !isAnalyzing) {
        setTimeout(() => {}, 500);
        setUploadStatus("success");
      }
    } catch (err) {
      if (!(err instanceof AxiosError && err.response?.status === 401)) {
        console.error("Vérification du statut du pipeline échouée:", extractErrorMessage(err));
      }
    } finally {
      setCheckingStatus(false);
    }
  }, [token, authHeaders, isAnalyzing]);

  // ── Job History ─────────────────────────────────────────────────────────────
  const fetchJobHistory = useCallback(async () => {
    if (!token) return;
    setIsLoadingHistory(true);
    try {
      const res = await axios.get(`${API}/etl/job-history`, {
        headers: authHeaders(),
        timeout: 15_000,
      });
      setJobHistory(res.data.jobs ?? []);
    } catch (err) {
      console.error("Échec de la récupération de l'historique des tâches:", extractErrorMessage(err));
    } finally {
      setIsLoadingHistory(false);
    }
  }, [token, authHeaders]);

  // ── Running Jobs ────────────────────────────────────────────────────────────
  const fetchRunningJobs = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API}/etl/running-jobs`, {
        headers: authHeaders(),
        timeout: 10_000,
      });
      setRunningJobs(res.data.running_jobs ?? []);
    } catch {
      // Silent
    }
  }, [token, authHeaders]);

  // ── Run a single job ────────────────────────────────────────────────────────
  const runJob = async (job: Job) => {
    if (!token || !isJobUnlocked(job)) return;
    setPipelineError(null);
    setJobStatus((s) => ({ ...s, [job.id]: "loading" }));
    setJobResult((r) => ({ ...r, [job.id]: { message: "" } }));

    const payload: Record<string, unknown> = {};
    if (job.id === "load-raw") {
      payload.year = selectedYear;
    }

    try {
      const res = await axios.post(`${API}${job.endpoint}`, payload, {
        headers: authHeaders(),
        timeout: 0,
      });
      setJobStatus((s) => ({ ...s, [job.id]: "success" }));
      setJobResult((r) => ({ ...r, [job.id]: res.data }));
      await fetchJobHistory();
      await checkPipelineStatus();
      await fetchYearsDistribution();
    } catch (err) {
      setJobStatus((s) => ({ ...s, [job.id]: "error" }));
      const msg = extractErrorMessage(err);
      const detail = err instanceof AxiosError ? err.response?.data?.detail : undefined;
      const missing = err instanceof AxiosError ? (err.response?.data?.missing ?? []) : [];
      setJobResult((r) => ({
        ...r,
        [job.id]: { message: msg, detail, missing },
      }));
      setPipelineError(`"${job.label}" failed: ${msg}${detail ? ` — ${detail}` : ""}`);
    }
  };

  // ── Resume Pipeline ─────────────────────────────────────────────────────────
  const resumePipeline = async () => {
    if (!token || !pipelineStatus) return;
    setResuming(true);
    setPipelineError(null);

    try {
      const stepsToRun: string[] = [];
      if (!pipelineStatus.raw.is_complete && pipelineStatus.csv_exists)
        stepsToRun.push("load-raw");
      if (!pipelineStatus.clean.is_complete && pipelineStatus.raw.exists)
        stepsToRun.push("build-clean");
      if (!pipelineStatus.datamart.is_complete && pipelineStatus.clean.exists)
        stepsToRun.push("build-datamart");

      if (stepsToRun.length === 0) {
        setResuming(false);
        return;
      }

      for (const stepId of stepsToRun) {
        const job = JOBS.find((j) => j.id === stepId)!;
        setJobStatus((s) => ({ ...s, [stepId]: "loading" }));
        const payload: Record<string, unknown> = {};
        if (stepId === "load-raw") payload.year = selectedYear;

        try {
          const res = await axios.post(`${API}${job.endpoint}`, payload, {
            headers: authHeaders(),
            timeout: 0,
          });
          setJobStatus((s) => ({ ...s, [stepId]: "success" }));
          setJobResult((r) => ({ ...r, [stepId]: res.data }));
          await checkPipelineStatus();
        } catch (err) {
          throw err;
        }
      }

      await fetchJobHistory();
      await fetchYearsDistribution();
    } catch (err) {
      const msg = extractErrorMessage(err);
      setPipelineError(`Impossible de reprendre le pipeline: ${msg}`);
    } finally {
      setResuming(false);
    }
  };

  // ── Unlock logic ────────────────────────────────────────────────────────────
  const isJobUnlocked = (job: Job): boolean => {
    if (!job.dependsOn) return true;
    if (job.dependsOn === "__upload__")
      return uploadStatus === "success" && csvAnalysis !== null;
    return jobStatus[job.dependsOn] === "success";
  };

  // ── Effects ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    fetchRunningJobs();
    const interval = setInterval(fetchRunningJobs, 5_000);
    return () => clearInterval(interval);
  }, [token, fetchRunningJobs]);

  useEffect(() => {
    if (!token) return;
    const anyLoading = Object.values(jobStatus).some((s) => s === "loading");
    const delay = anyLoading ? 5_000 : 15_000;
    const interval = setInterval(() => {
      checkPipelineStatus();
      if (anyLoading) fetchJobHistory();
    }, delay);
    return () => clearInterval(interval);
  }, [token, jobStatus, checkPipelineStatus, fetchJobHistory]);

  useEffect(() => {
    if (token && !initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      checkPipelineStatus();
      fetchJobHistory();
      fetchYearsDistribution();
    }
  }, [token, checkPipelineStatus, fetchJobHistory, fetchYearsDistribution]);

  // ─────────────────────────────────────────────────────────────────────────────
  const statusIcon = (status: JobStatus) => {
    if (status === "loading") return <Loader size={14} className="etl-spin" />;
    if (status === "success") return <CheckCircle2 size={14} color="#4ade80" />;
    if (status === "partial") return <AlertCircle size={14} color="#fbbf24" />;
    if (status === "error") return <AlertCircle size={14} color="#f87171" />;
    return null;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        .etl-page { font-family: 'Inter', system-ui, sans-serif; }
        .etl-header { margin-bottom: 28px; }
        .etl-title  { font-size: 22px; font-weight: 600; color: var(--text-main); margin: 0 0 4px; letter-spacing: -0.3px; }
        .etl-sub    { font-size: 12px; color: var(--text-muted); font-family: monospace; margin: 0; }

        /* Tabs */
        .etl-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 24px;
          border-bottom: 1px solid var(--border);
          padding-bottom: 0;
        }
        .etl-tab {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          font-size: 13px;
          font-weight: 500;
          color: var(--text-muted);
          cursor: pointer;
          transition: all .2s;
        }
        .etl-tab:hover {
          color: #3b82f6;
        }
        .etl-tab.active {
          color: #3b82f6;
          border-bottom-color: #3b82f6;
        }

        .etl-error-banner {
          display: flex; align-items: flex-start; gap: 10px;
          padding: 12px 16px; border-radius: 10px;
          background: rgba(239,68,68,.08); border: 1px solid rgba(239,68,68,.25);
          color: #f87171; font-size: 12px; line-height: 1.5; margin-bottom: 18px;
        }
        .etl-error-dismiss {
          margin-left: auto; background: transparent; border: none;
          cursor: pointer; color: #f87171; opacity: .7; font-size: 18px;
          padding: 0 2px;
        }

        /* Pipeline Status */
        .etl-pipeline {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 20px;
        }
        .etl-pipeline-hd {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
        }
        .etl-pipeline-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: .08em;
          color: #93c5fd;
        }
        .etl-pipeline-refresh {
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 4px 10px;
          cursor: pointer;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          transition: all .2s;
        }
        .etl-pipeline-refresh:hover {
          border-color: #3b82f6;
          color: #3b82f6;
        }
        .etl-pipeline-steps {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 16px;
        }
        .etl-ps {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--surface2);
          flex: 1;
          min-width: 120px;
        }
        .etl-ps.ps-done {
          border-color: rgba(74,222,128,.4);
          background: rgba(74,222,128,.04);
        }
        .etl-ps.ps-partial {
          border-color: rgba(251,191,36,.4);
          background: rgba(251,191,36,.04);
        }
        .etl-ps-icon { font-size: 18px; }
        .etl-ps-name {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        .etl-ps.ps-done .etl-ps-name { color: #4ade80; }
        .etl-ps.ps-partial .etl-ps-name { color: #fbbf24; }

        .etl-resume-btn {
          width: 100%;
          padding: 10px;
          border: none;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 500;
          color: white;
          background: linear-gradient(135deg, #3b82f6, #6366f1);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          transition: all .2s;
        }
        .etl-resume-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(59,130,246,.3);
        }

        /* Year Manager */
        .etl-year-manager {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 20px;
        }
        .etl-year-manager-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: #f87171;
          margin-bottom: 16px;
          text-transform: uppercase;
          letter-spacing: .06em;
        }
        .etl-year-loading, .etl-year-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 40px;
          color: var(--text-muted);
          font-size: 13px;
        }
        .etl-year-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-height: 400px;
          overflow-y: auto;
        }
        .etl-year-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 12px;
          transition: all .2s;
        }
        .etl-year-card:hover {
          border-color: rgba(239,68,68,.3);
          background: rgba(239,68,68,.02);
        }
        .etl-year-card-info {
          display: flex;
          align-items: baseline;
          gap: 16px;
          flex-wrap: wrap;
        }
        .etl-year-card-number {
          font-size: 24px;
          font-weight: 700;
          color: var(--text-main);
          font-family: monospace;
        }
        .etl-year-card-count {
          font-size: 13px;
          color: #4ade80;
          font-family: monospace;
          background: rgba(74,222,128,.1);
          padding: 2px 10px;
          border-radius: 20px;
        }
        .etl-year-card-badge {
          font-size: 11px;
          padding: 2px 10px;
          border-radius: 20px;
          background: rgba(59,130,246,.1);
          color: #93c5fd;
        }
        .etl-year-card-delete {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 18px;
          background: rgba(239,68,68,.1);
          border: 1px solid rgba(239,68,68,.3);
          border-radius: 8px;
          color: #f87171;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all .2s;
        }
        .etl-year-card-delete:hover {
          background: rgba(239,68,68,.2);
          border-color: #f87171;
        }
        .etl-year-note {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 16px;
          padding: 10px 14px;
          background: rgba(59,130,246,.06);
          border-radius: 8px;
          font-size: 11px;
          color: #93c5fd;
        }

        /* Modal de confirmation */
        .etl-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .etl-modal {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          width: 90%;
          max-width: 450px;
          box-shadow: 0 20px 35px rgba(0,0,0,.3);
        }
        .etl-modal-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 20px 24px;
          border-bottom: 1px solid var(--border);
        }
        .etl-modal-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: var(--text-main);
        }
        .etl-modal-body {
          padding: 24px;
        }
        .etl-modal-body p {
          margin: 0 0 16px 0;
          color: var(--text-muted);
          font-size: 14px;
          line-height: 1.5;
        }
        .etl-modal-warning {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          background: rgba(239,68,68,.1);
          border-radius: 8px;
          color: #f87171;
          font-size: 13px;
          margin-bottom: 16px;
        }
        .etl-modal-note {
          font-size: 12px !important;
          color: var(--text-faint) !important;
          margin-bottom: 0 !important;
        }
        .etl-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 16px 24px;
          border-top: 1px solid var(--border);
        }
        .etl-modal-cancel {
          padding: 8px 20px;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text-muted);
          font-size: 13px;
          cursor: pointer;
          transition: all .2s;
        }
        .etl-modal-cancel:hover {
          background: var(--surface2);
        }
        .etl-modal-confirm {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 20px;
          background: rgba(239,68,68,.15);
          border: 1px solid rgba(239,68,68,.4);
          border-radius: 8px;
          color: #f87171;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all .2s;
        }
        .etl-modal-confirm:hover:not(:disabled) {
          background: rgba(239,68,68,.25);
        }
        .etl-modal-confirm:disabled {
          opacity: .6;
          cursor: not-allowed;
        }

        /* Running jobs */
        .etl-running {
          position: fixed;
          bottom: 24px;
          right: 24px;
          width: 320px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0,0,0,.35);
          z-index: 1000;
          overflow: hidden;
        }
        .etl-running-hd {
          padding: 12px 16px;
          background: var(--surface2);
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-main);
        }
        .etl-running-item {
          display: flex;
          justify-content: space-between;
          padding: 10px 16px;
          border-bottom: 1px solid var(--border);
        }
        .etl-running-item:last-child { border-bottom: none; }
        .etl-running-name { font-size: 12px; font-weight: 500; }
        .etl-running-dur { font-size: 11px; color: var(--text-muted); font-family: monospace; }

        /* Grid et cartes */
        .etl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
        .etl-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 24px; }
        .etl-card-title { font-size: 10px; font-weight: 600; color: #93c5fd; text-transform: uppercase; letter-spacing: .08em; margin: 0 0 4px; }
        .etl-card-desc { font-size: 12px; color: var(--text-muted); margin: 0 0 20px; font-family: monospace; }

        /* Upload zone */
        .etl-upload-zone {
          border: 1px dashed rgba(59,130,246,.3);
          border-radius: 12px;
          padding: 24px;
          text-align: center;
          cursor: pointer;
          margin-bottom: 16px;
          transition: all .2s;
        }
        .etl-upload-zone:hover {
          border-color: rgba(59,130,246,.6);
          background: rgba(59,130,246,.03);
        }
        .etl-upload-zone.zone-invalid {
          border-color: rgba(239,68,68,.4);
          background: rgba(239,68,68,.04);
        }
        .etl-upload-zone.zone-valid {
          border-color: rgba(34,197,94,.4);
          background: rgba(34,197,94,.04);
        }
        .etl-upload-label { font-size: 12px; color: var(--text-muted); }
        .etl-file-name { font-size: 11px; font-family: monospace; color: var(--text-main); margin-top: 8px; }
        .etl-progress-bar {
          width: 100%;
          height: 4px;
            background: rgba(59,130,246,.2);
          border-radius: 2px;
          margin: 12px 0;
        }
        .etl-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #3b82f6, #6366f1);
          transition: width .3s ease;
          border-radius: 2px;
        }
        .etl-progress-text {
          font-size: 11px;
          color: var(--text-muted);
          text-align: center;
        }

        .etl-col-errors {
          padding: 10px 14px;
          border-radius: 8px;
          margin-bottom: 16px;
          background: rgba(239,68,68,.08);
          border: 1px solid rgba(239,68,68,.2);
          font-size: 12px;
          color: #f87171;
        }
        .etl-btn {
          width: 100%;
          height: 42px;
          border-radius: 8px;
          border: none;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: #3b82f6;
          color: white;
          transition: all .2s;
        }
        .etl-btn:hover:not(:disabled) {
          filter: brightness(1.05);
        }
        .etl-btn:disabled {
          opacity: .45;
          cursor: not-allowed;
        }
        .etl-result {
          margin-top: 12px;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 12px;
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }
        .etl-result.res-ok {
          background: rgba(34,197,94,.08);
          color: #4ade80;
          border: 1px solid rgba(34,197,94,.15);
        }
        .etl-result.res-err {
          background: rgba(239,68,68,.08);
          color: #f87171;
          border: 1px solid rgba(239,68,68,.15);
        }

        /* Year selector */
        .etl-year-sel {
          margin-top: 16px;
          padding: 16px;
          background: var(--surface2);
          border-radius: 10px;
        }
        .etl-year-hd {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          font-size: 11px;
          font-weight: 600;
          color: #93c5fd;
          text-transform: uppercase;
        }
        .etl-year-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 14px;
        }
        .etl-year-stat {
          padding: 10px;
          background: var(--surface);
          border-radius: 8px;
          text-align: center;
        }
        .etl-year-stat-lbl {
          font-size: 9px;
          color: var(--text-muted);
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        .etl-year-stat-val {
          font-size: 18px;
          font-weight: 600;
          color: #4ade80;
          font-family: monospace;
        }
        .etl-year-btns {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .etl-year-btn {
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 12px;
          background: var(--surface);
          border: 1px solid var(--border);
          cursor: pointer;
          transition: all .2s;
        }
        .etl-year-btn:hover {
          border-color: #3b82f6;
        }
        .etl-year-btn.active {
          background: #3b82f6;
          color: white;
          border-color: #3b82f6;
        }

        /* Jobs list */
        .etl-jobs-list { display: flex; flex-direction: column; gap: 12px; }
        .etl-job-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 16px;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 10px;
          transition: all .2s;
        }
        .etl-job-row.job-locked { opacity: .5; }
        .etl-job-row.job-done { border-color: rgba(34,197,94,.3); }
        .etl-job-row.job-error { border-color: rgba(239,68,68,.3); }
        .etl-job-info { flex: 1; }
        .etl-job-name {
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 4px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .etl-job-desc {
          font-size: 11px;
          color: var(--text-muted);
          margin-bottom: 6px;
        }
        .etl-job-lock {
          font-size: 10px;
          color: #f87171;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .etl-job-pills {
          display: flex;
          gap: 8px;
          margin-top: 8px;
          flex-wrap: wrap;
        }
        .etl-pill {
          font-size: 10px;
          padding: 2px 10px;
          border-radius: 20px;
        }
        .pill-green {
          background: rgba(34,197,94,.1);
          color: #4ade80;
        }
        .etl-job-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .etl-run-btn {
          height: 32px;
          padding: 0 18px;
          border-radius: 7px;
          background: #3b82f6;
          color: white;
          border: none;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all .2s;
        }
        .etl-run-btn:hover:not(:disabled) {
          filter: brightness(1.05);
        }
        .etl-run-btn:disabled {
          opacity: .45;
          cursor: not-allowed;
        }

        /* History panel */
        .etl-history-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          cursor: pointer;
          width: 100%;
          margin-bottom: 12px;
          transition: all .2s;
        }
        .etl-history-toggle:hover {
          border-color: #3b82f6;
          background: rgba(59,130,246,.05);
        }
        .etl-history-toggle .hd-count {
          margin-left: auto;
          font-size: 10px;
          padding: 2px 10px;
          border-radius: 20px;
          background: var(--surface2);
          color: var(--text-muted);
        }
        .etl-history-panel {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          margin-bottom: 20px;
          overflow: hidden;
        }
        .etl-history-hd {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 14px 20px;
          background: var(--surface2);
          border-bottom: 1px solid var(--border);
          font-size: 11px;
          font-weight: 600;
          color: #93c5fd;
          text-transform: uppercase;
          letter-spacing: .06em;
        }
        .etl-history-refresh {
          margin-left: auto;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 4px 10px;
          cursor: pointer;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          transition: all .2s;
        }
        .etl-history-refresh:hover {
          border-color: #3b82f6;
          color: #93c5fd;
        }
        .etl-history-list {
          max-height: 420px;
          overflow-y: auto;
        }
        .etl-history-item {
          padding: 14px 20px;
          border-bottom: 1px solid var(--border);
          transition: background .15s;
        }
        .etl-history-item:hover {
          background: var(--surface2);
        }
        .etl-history-item:last-child {
          border-bottom: none;
        }
        .etl-history-item-hd {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .etl-history-item-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-main);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .hist-status {
          padding: 2px 10px;
          border-radius: 20px;
          font-size: 10px;
          font-weight: 600;
        }
        .hist-ok {
          background: rgba(74,222,128,.12);
          color: #4ade80;
          border: 1px solid rgba(74,222,128,.2);
        }
        .hist-fail {
          background: rgba(239,68,68,.12);
          color: #f87171;
          border: 1px solid rgba(239,68,68,.2);
        }
        .hist-partial {
          background: rgba(251,191,36,.12);
          color: #fbbf24;
          border: 1px solid rgba(251,191,36,.2);
        }
        .etl-history-metrics {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 8px;
        }
        .etl-history-metric {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          color: var(--text-muted);
        }
        .etl-history-date {
          font-size: 10px;
          color: var(--text-faint);
          font-family: monospace;
        }
        .etl-history-err {
          margin-top: 8px;
          padding: 8px 12px;
          border-radius: 6px;
          background: rgba(239,68,68,.08);
          color: #f87171;
          font-size: 11px;
          font-family: monospace;
        }
        .etl-history-empty {
          text-align: center;
          padding: 40px;
          color: var(--text-muted);
          font-size: 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        @keyframes etl-spin {
          to { transform: rotate(360deg); }
        }
        .etl-spin {
          animation: etl-spin 1s linear infinite;
        }

        @media (max-width: 680px) {
          .etl-grid {
            grid-template-columns: 1fr;
          }
          .etl-tabs {
            flex-direction: column;
            border-bottom: none;
          }
          .etl-tab {
            justify-content: center;
          }
        }
      `}</style>

      <div className="etl-page">
        <div className="etl-header">
          <h1 className="etl-title">Pipeline ETL</h1>
          <p className="etl-sub">Import, transformation et gestion des données d'accidents</p>
        </div>

        {/* Navigation par onglets */}
        <div className="etl-tabs">
          <button 
            className={`etl-tab ${activeTab === "pipeline" ? "active" : ""}`}
            onClick={() => setActiveTab("pipeline")}
          >
            <LayoutDashboard size={16} />
            Pipeline ETL
          </button>
          <button 
            className={`etl-tab ${activeTab === "jobs" ? "active" : ""}`}
            onClick={() => setActiveTab("jobs")}
          >
            <HardDrive size={16} />
            Exécution des tâches
          </button>
          <button 
            className={`etl-tab ${activeTab === "manage" ? "active" : ""}`}
            onClick={() => setActiveTab("manage")}
          >
            <Settings size={16} />
            Gestion des années
          </button>
        </div>

        {pipelineError && (
          <div className="etl-error-banner">
            <AlertCircle size={14} />
            <span>{pipelineError}</span>
            <button className="etl-error-dismiss" onClick={() => setPipelineError(null)}>×</button>
          </div>
        )}

        {/* Onglet 1: Pipeline ETL */}
        {activeTab === "pipeline" && (
          <>
            <div className="etl-pipeline">
              <div className="etl-pipeline-hd">
                <div className="etl-pipeline-title">
                  <RefreshCw size={13} className={checkingStatus ? "etl-spin" : ""} />
                  État du pipeline ETL
                </div>
                <button className="etl-pipeline-refresh" onClick={checkPipelineStatus} disabled={checkingStatus}>
                  {checkingStatus ? <Loader size={12} className="etl-spin" /> : <><RefreshCw size={12} /> Actualiser</>}
                </button>
              </div>
              <div className="etl-pipeline-steps">
                <div className={`etl-ps ${pipelineStatus?.csv_exists ? "ps-done" : ""}`}>
                  <div className="etl-ps-icon">📁</div>
                  <div className="etl-ps-name">CSV Uploadé</div>
                  {pipelineStatus?.csv_exists ? <CheckCircle2 size={14} color="#4ade80" /> : <div style={{ width: 14, height: 14, opacity: .4 }}>○</div>}
                </div>
                <div className={`etl-ps ${pipelineStatus?.raw.is_complete ? "ps-done" : pipelineStatus?.raw.exists ? "ps-partial" : ""}`}>
                  <div className="etl-ps-icon">💾</div>
                  <div className="etl-ps-name">Raw Loaded</div>
                  {pipelineStatus?.raw.is_complete ? <CheckCircle2 size={14} color="#4ade80" /> : 
                   pipelineStatus?.raw.exists ? <AlertCircle size={14} color="#fbbf24" /> :
                   <div style={{ width: 14, height: 14, opacity: .4 }}>○</div>}
                </div>
                <div className={`etl-ps ${pipelineStatus?.clean.is_complete ? "ps-done" : pipelineStatus?.clean.exists ? "ps-partial" : ""}`}>
                  <div className="etl-ps-icon">🧹</div>
                  <div className="etl-ps-name">Clean Built</div>
                  {pipelineStatus?.clean.is_complete ? <CheckCircle2 size={14} color="#4ade80" /> :
                   pipelineStatus?.clean.exists ? <AlertCircle size={14} color="#fbbf24" /> :
                   <div style={{ width: 14, height: 14, opacity: .4 }}>○</div>}
                </div>
                <div className={`etl-ps ${pipelineStatus?.datamart.is_complete ? "ps-done" : pipelineStatus?.datamart.exists ? "ps-partial" : ""}`}>
                  <div className="etl-ps-icon">⭐</div>
                  <div className="etl-ps-name">Datamart</div>
                  {pipelineStatus?.datamart.is_complete ? <CheckCircle2 size={14} color="#4ade80" /> :
                   pipelineStatus?.datamart.exists ? <AlertCircle size={14} color="#fbbf24" /> :
                   <div style={{ width: 14, height: 14, opacity: .4 }}>○</div>}
                </div>
              </div>
              
              {pipelineStatus && !pipelineStatus.datamart.is_complete && pipelineStatus.datamart.exists && (
                <div style={{ 
                  marginTop: 12, 
                  padding: 10, 
                  background: 'rgba(251,191,36,.1)', 
                  borderRadius: 8, 
                  textAlign: 'center', 
                  fontSize: 12, 
                  color: '#fbbf24' 
                }}>
                  ⚠️ Datamart partiellement construit : {pipelineStatus.datamart.completion_percentage}% complet
                </div>
              )}

              {pipelineStatus && shouldShowPipeline(pipelineStatus) && (
                <button className="etl-resume-btn" onClick={resumePipeline} disabled={resuming} style={{ marginTop: 16 }}>
                  {resuming ? <><Loader size={13} className="etl-spin" /> Reprise…</> : <><PlayCircle size={13} /> Reprendre le pipeline</>}
                </button>
              )}
            </div>
          </>
        )}

        {/* Onglet 2: Exécution des tâches */}
        {activeTab === "jobs" && (
          <div className="etl-grid">
            <div className="etl-card">
              <div className="etl-card-title">Étape 1 — Importer et analyser le CSV</div>
              <div className="etl-card-desc">Jeu de données des accidents routiers aux États-Unis</div>

              <div
                className={`etl-upload-zone ${colErrors.length > 0 ? "zone-invalid" : colOk ? "zone-valid" : ""}`}
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={24} color={colErrors.length > 0 ? "#f87171" : colOk ? "#4ade80" : "#3b82f6"} />
                <div className="etl-upload-label" style={{ marginTop: 8 }}>Cliquez pour parcourir</div>
                <div className="etl-upload-label" style={{ fontSize: 11 }}>fichiers .csv seulement</div>
                {file && <div className="etl-file-name">{file.name}</div>}
              </div>
              <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleFileChange} />

              {colErrors.length > 0 && (
                <div className="etl-col-errors">
                  <strong>Colonnes requises manquantes:</strong> {colErrors.join(", ")}
                </div>
              )}

              {uploadStatus === "loading" && (
                <div>
                  <div className="etl-progress-bar">
                    <div className="etl-progress-fill" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <div className="etl-progress-text">{uploadProgress}% téléchargé</div>
                </div>
              )}

              <button
                className="etl-btn"
                disabled={!file || uploadStatus === "loading" || uploadStatus === "success" || colErrors.length > 0}
                onClick={handleUploadAndAnalyze}
              >
                {uploadStatus === "loading" ? (
                  <><Loader size={13} className="etl-spin" /> Téléchargement et analyse…</>
                ) : uploadStatus === "success" ? (
                  <><CheckCircle2 size={13} /> Importé et analysé</>
                ) : (
                  <><Upload size={13} /> Importer et analyser</>
                )}
              </button>

              {uploadMsg && (
                <div className={`etl-result ${uploadStatus === "success" ? "res-ok" : "res-err"}`}>
                  {uploadStatus === "success" ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                  {uploadMsg}
                </div>
              )}

              {csvAnalysis && !isAnalyzing && (
                <div className="etl-year-sel">
                  <div className="etl-year-hd">
                    <BarChart3 size={13} />
                    Résumé des données &amp; Filtre par année
                  </div>
                  <div className="etl-year-stats">
                    <div className="etl-year-stat">
                      <div className="etl-year-stat-lbl">Total lignes</div>
                      <div className="etl-year-stat-val">{fmt(csvAnalysis.total_rows_scanned)}</div>
                    </div>
                    <div className="etl-year-stat">
                      <div className="etl-year-stat-lbl">Années trouvées</div>
                      <div className="etl-year-stat-val">{csvAnalysis.available_years?.length ?? 0}</div>
                    </div>
                  </div>
                  <div className="etl-year-btns">
                    <button className={`etl-year-btn ${selectedYear === "all" ? "active" : ""}`} onClick={() => setSelectedYear("all")}>
                      tout ({fmt(csvAnalysis.total_rows_scanned)})
                    </button>
                    {csvAnalysis.available_years?.map((y) => (
                      <button key={y} className={`etl-year-btn ${selectedYear === y ? "active" : ""}`} onClick={() => setSelectedYear(y)}>
                        {y} ({fmt(csvAnalysis.year_counts?.[y])})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="etl-card">
              <div className="etl-card-title">Étape 2 — Exécuter les tâches ETL</div>
              <div className="etl-card-desc">Exécuter les transformations séquentiellement</div>

              <div className="etl-jobs-list">
                {JOBS.map((job, idx) => {
                  const unlocked = isJobUnlocked(job);
                  const st = jobStatus[job.id] ?? "idle";
                  const isLoading = st === "loading";
                  const isDone = st === "success";
                  const isError = st === "error";
                  const result = jobResult[job.id];

                  return (
                    <div key={job.id} className={`etl-job-row ${!unlocked ? "job-locked" : ""} ${isDone ? "job-done" : ""} ${isError ? "job-error" : ""}`}>
                      <div className="etl-job-info">
                        <div className="etl-job-name">
                          {job.icon} {idx + 1}. {job.label}
                          {isError && <span className="etl-job-badge badge-error" style={{ fontSize: 9, padding: '2px 8px', borderRadius: 12, background: 'rgba(239,68,68,.15)', color: '#f87171' }}>Échec</span>}
                        </div>
                        <div className="etl-job-desc">{job.description}</div>
                        {!unlocked && <div className="etl-job-lock"><Lock size={10} /> {job.lockHint}</div>}
                        {isError && result?.message && <div className="etl-job-error-msg" style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>✕ {result.message}</div>}
                        {(isDone) && result && (
                          <div className="etl-job-pills">
                            {result.rows_inserted != null && <span className="etl-pill pill-green">{fmt(result.rows_inserted)} inséré</span>}
                          </div>
                        )}
                      </div>
                      <div className="etl-job-actions">
                        {statusIcon(st)}
                        <button className="etl-run-btn" disabled={!unlocked || isLoading} onClick={() => runJob(job)}>
                          {isLoading ? <><Loader size={11} className="etl-spin" /> Running…</> : isDone ? <><RefreshCw size={11} /> Re-run</> : <><Play size={11} /> Run</>}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Onglet 3: Gestion des années */}
        {activeTab === "manage" && (
          <YearManager
            yearsData={yearsData}
            loadingYears={loadingYears}
            onDeleteYear={handleDeleteClick}
          />
        )}

        {/* Historique des tâches - Visible sur onglet Pipeline et Jobs */}
        {(activeTab === "pipeline" || activeTab === "jobs") && (
          <>
            <button 
              className="etl-history-toggle" 
              onClick={() => { 
                if (!showHistory) fetchJobHistory(); 
                setShowHistory(!showHistory); 
              }}
            >
              <History size={15} />
              <span>Historique des exécutions ETL</span>
              <span className="hd-count">{jobHistory.length} tâches</span>
              {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showHistory && (
              <div className="etl-history-panel">
                <div className="etl-history-hd">
                  <History size={14} />
                  <span>Exécutions récentes</span>
                  <button 
                    className="etl-history-refresh" 
                    onClick={fetchJobHistory} 
                    disabled={isLoadingHistory}
                  >
                    {isLoadingHistory ? (
                      <Loader size={12} className="etl-spin" />
                    ) : (
                      <>
                        <RefreshCw size={12} />
                        Actualiser
                      </>
                    )}
                  </button>
                </div>
                
                {isLoadingHistory ? (
                  <div className="etl-history-empty">
                    <Loader size={22} className="etl-spin" />
                    <span>Chargement de l'historique...</span>
                  </div>
                ) : jobHistory.length === 0 ? (
                  <div className="etl-history-empty">
                    <CheckCircle2 size={22} color="#4ade80" />
                    <span>Aucune tâche ETL n'a encore été exécutée</span>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Exécutez une tâche pour voir l'historique ici</span>
                  </div>
                ) : (
                  <div className="etl-history-list">
                    {jobHistory.map((job) => (
                      <div key={job.id} className="etl-history-item">
                        <div className="etl-history-item-hd">
                          <div className="etl-history-item-name">
                            {job.name}
                            <span className={`hist-status ${
                              job.status === "success" ? "hist-ok" : 
                              job.status === "failed" ? "hist-fail" : "hist-partial"
                            }`}>
                              {job.status === "success" ? "Succès" : 
                               job.status === "failed" ? "Échec" : "Partiel"}
                            </span>
                          </div>
                          <div className="etl-history-date">
                            {new Date(job.created_at).toLocaleString('fr-FR')}
                          </div>
                        </div>
                        
                        <div className="etl-history-metrics">
                          {job.rows_inserted > 0 && (
                            <div className="etl-history-metric">
                              <CheckCircle2 size={11} color="#4ade80" />
                              <span>{job.rows_inserted.toLocaleString()} insérés</span>
                            </div>
                          )}
                          {job.rows_processed > 0 && (
                            <div className="etl-history-metric">
                              <RefreshCw size={11} />
                              <span>{job.rows_processed.toLocaleString()} traités</span>
                            </div>
                          )}
                          {job.rows_skipped > 0 && (
                            <div className="etl-history-metric">
                              <AlertCircle size={11} color="#fbbf24" />
                              <span>{job.rows_skipped.toLocaleString()} ignorés</span>
                            </div>
                          )}
                          {job.duration_seconds > 0 && (
                            <div className="etl-history-metric">
                              ⏱
                              <span>{fmtDuration(job.duration_seconds)}</span>
                            </div>
                          )}
                        </div>
                        
                        {job.error_message && (
                          <div className="etl-history-err">
                            <AlertCircle size={12} style={{ display: 'inline', marginRight: 6 }} />
                            {job.error_message}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Modal de confirmation */}
        <ConfirmDialog
          isOpen={confirmDialog.show}
          year={confirmDialog.year}
          count={confirmDialog.count}
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
          deleting={deletingYear !== null}
        />

        {/* Running jobs toast */}
        {runningJobs.length > 0 && (
          <div className="etl-running">
            <div className="etl-running-hd">
              <Loader size={14} className="etl-spin" />
              Tâches en cours ({runningJobs.length})
            </div>
            {runningJobs.map((job) => (
              <div key={job.job_id} className="etl-running-item">
                <div className="etl-running-info">
                  <div className="etl-running-name">{job.name}</div>
                  <div className="etl-running-dur">{fmtDuration(job.duration_seconds)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}