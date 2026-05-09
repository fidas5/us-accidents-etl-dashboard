// src/pages/ETLJobs.tsx
import React, { useState, useRef, useEffect, useCallback } from "react";
import axios, { AxiosError } from "axios";
import { useAuth } from "../context/AuthContext";
import {
  Upload, Play, CheckCircle2, AlertCircle, Loader,
  Lock, BarChart3, RefreshCw, PlayCircle,
  Database, Zap, RotateCcw, Trash2,
  LayoutDashboard, HardDrive, Settings, XCircle, ChevronUp, ChevronDown, History
} from "lucide-react";
import "./ETLJobs.css";

// ─── Types ────────────────────────────────────────────────────────────────────

type JobStatus = "idle" | "loading" | "success" | "error" | "partial";
type TabType = "jobs" | "manage";

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

interface YearPipelineStatus {
  year: number;
  raw_exists: boolean;
  clean_exists: boolean;
  fact_exists: boolean;
  raw_count: number;
  clean_count: number;
  fact_count: number;
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
    lockHint: "Téléchargez et analysez d'abord un fichier CSV valide",
    icon: <Database size={14} />,
  },
  {
    id: "build-clean",
    label: "Construire les données nettoyées",
    description: "Validation, conversion des unités (°C / km) et enrichissement → accidents_clean",
    endpoint: "/etl/build-clean",
    dependsOn: "load-raw",
    lockHint: '"Charger les données brutes"',
    icon: <Zap size={14} />,
  },
  {
    id: "build-datamart",
    label: "Construire le datamart",
    description: "Création du schéma en étoile (dimensions et table de faits) pour l'analyse (incrémental)",
    endpoint: "/etl/build-datamart",
    dependsOn: "build-clean",
    lockHint: '"Construire les données nettoyées"',
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
  return "Une erreur inattendue s'est produite.";
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

// ─── ConfirmDialog ────────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  isOpen: boolean;
  year: number | null;
  rawCount: number;
  cleanCount: number;
  factCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}

function ConfirmDialog({
  isOpen, year, rawCount, cleanCount, factCount,
  onConfirm, onCancel, deleting,
}: ConfirmDialogProps) {
  if (!isOpen || !year) return null;

  return (
    <div className="etl-modal-overlay">
      <div className="etl-modal">
        <div className="etl-modal-header">
          <AlertCircle size={20} color="#fbbf24" />
          <h3>Confirmer la suppression</h3>
        </div>
        <div className="etl-modal-body">
          <p>
            Êtes-vous sûr de vouloir supprimer toutes les données de l'année{" "}
            <strong>{year}</strong> ?
          </p>
          <div className="etl-modal-warning">
            <XCircle size={16} />
            <span>⚠️ Cette action supprimera définitivement :</span>
          </div>
          <div className="etl-modal-details">
            <div>
              📄 accidents_raw :{" "}
              <strong>{rawCount.toLocaleString()}</strong> enregistrements
            </div>
            <div>
              🧹 accidents_clean :{" "}
              <strong>{cleanCount.toLocaleString()}</strong> enregistrements
            </div>
            <div>
              ⭐ fact_accident :{" "}
              <strong>{factCount.toLocaleString()}</strong> enregistrements
            </div>
          </div>
          <p className="etl-modal-note">
            Cette action est IRRÉVERSIBLE. Les données seront supprimées de TOUTES les tables.
          </p>
        </div>
        <div className="etl-modal-footer">
          <button className="etl-modal-cancel" onClick={onCancel} disabled={deleting}>
            Annuler
          </button>
          <button className="etl-modal-confirm" onClick={onConfirm} disabled={deleting}>
            {deleting ? <Loader size={16} className="etl-spin" /> : <Trash2 size={16} />}
            Supprimer définitivement {year}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── YearManager ──────────────────────────────────────────────────────────────

interface YearManagerProps {
  yearsData: YearData[];
  loadingYears: boolean;
  importingYear: number | null;
  onImportYear: (year: number) => void;
  onDeleteYear: (year: number) => void;
}

function YearManager({
  yearsData, loadingYears, importingYear, onImportYear, onDeleteYear,
}: YearManagerProps) {
  return (
    <div className="etl-year-manager">
      <div className="etl-year-manager-header">
        <BarChart3 size={16} />
        <span>Années dans le datamart</span>
      </div>

      {loadingYears ? (
        <div className="etl-year-loading">
          <Loader size={16} className="etl-spin" />
          <span>Chargement des années...</span>
        </div>
      ) : yearsData.length === 0 ? (
        <div className="etl-year-empty">
          <AlertCircle size={16} color="#fbbf24" />
          <span>Aucune donnée dans le datamart</span>
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
            Importez d'abord des données via l'onglet "Exécution des tâches"
          </span>
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
              </div>
              <div className="etl-year-card-actions">
                <button
                  className="etl-year-card-delete"
                  onClick={() => onDeleteYear(item.year)}
                  disabled={importingYear === item.year}
                >
                  <Trash2 size={14} />
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ETLPage() {
  const { token } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<TabType>("jobs");

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
  const [runningJobs, setRunningJobs] = useState<RunningJob[]>([]);
  const [jobHistory, setJobHistory] = useState<JobHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Year management
  const [yearsData, setYearsData] = useState<YearData[]>([]);
  const [loadingYears, setLoadingYears] = useState(false);
  const [deletingYear, setDeletingYear] = useState<number | null>(null);
  const [importingYear, setImportingYear] = useState<number | null>(null);

  // ── FIXED: confirmDialog now carries per-table counts ──
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    year: number | null;
    rawCount: number;
    cleanCount: number;
    factCount: number;
  }>({ show: false, year: null, rawCount: 0, cleanCount: 0, factCount: 0 });

  // Year pipeline status
  const [yearsPipelineStatus, setYearsPipelineStatus] = useState<YearPipelineStatus[]>([]);
  const [loadingPipelineStatus, setLoadingPipelineStatus] = useState(false);
  const [continuingYear, setContinuingYear] = useState<number | null>(null);

  const [pipelineError, setPipelineError] = useState<string | null>(null);

  const analysisDoneRef = useRef(false);
  const initialLoadDoneRef = useRef(false);

  // ── Reset all jobs ──────────────────────────────────────────────────────────
  const resetAllJobs = () => {
    setJobStatus({});
    setJobResult({});
    setPipelineError(null);
    checkPipelineStatus();
  };

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  // ── Column validation ───────────────────────────────────────────────────────
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

  // ── Upload & Analyze ────────────────────────────────────────────────────────
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
        setUploadMsg(
          `Fichier analysé avec succès. ${analysisData.total_rows_scanned.toLocaleString()} lignes trouvées.`
        );
        analysisDoneRef.current = true;
        if (analysisData.available_years.length > 0) {
          setSelectedYear(Math.max(...analysisData.available_years));
        }
        await checkPipelineStatus();
        await fetchYearsDistribution();
        await fetchYearsPipelineStatus();
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
          setSelectedYear(Math.max(...analysisData.available_years));
        }
        await checkPipelineStatus();
        await fetchYearsDistribution();
        await fetchYearsPipelineStatus();
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

  // ── Years Pipeline Status ───────────────────────────────────────────────────
  const fetchYearsPipelineStatus = useCallback(async () => {
    if (!token) return;
    setLoadingPipelineStatus(true);
    try {
      const res = await axios.get(`${API}/etl/year-status`, {
        headers: authHeaders(),
      });
      setYearsPipelineStatus(res.data.years_status || []);
    } catch (err) {
      console.error("Failed to fetch pipeline status:", err);
    } finally {
      setLoadingPipelineStatus(false);
    }
  }, [token, authHeaders]);

  // ── Continue Pipeline ───────────────────────────────────────────────────────
  const continuePipeline = async (year: number, step: string) => {
    if (!token) return;
    setContinuingYear(year);
    setPipelineError(null);
    try {
      if (step === "raw") {
        const job = JOBS.find((j) => j.id === "load-raw")!;
        await runJob(job, year);
      } else if (step === "clean") {
        const job = JOBS.find((j) => j.id === "build-clean")!;
        await runJob(job, year);
      } else if (step === "datamart") {
        await importYear(year);
      }
      await fetchYearsPipelineStatus();
      await fetchYearsDistribution();
    } catch (err) {
      console.error(`Continue pipeline for ${year} failed:`, err);
      setPipelineError(`Reprise du pipeline pour ${year} a échoué`);
    } finally {
      setContinuingYear(null);
    }
  };

  // ── Import Year ─────────────────────────────────────────────────────────────
  const importYear = async (year: number) => {
    if (!token) return;
    setImportingYear(year);
    setPipelineError(null);
    try {
      const res = await axios.post(
        `${API}/etl/build-datamart`,
        { year },
        { headers: authHeaders() }
      );
      console.log(`Import ${year}:`, res.data);
      await fetchYearsDistribution();
      await fetchYearsPipelineStatus();
      setUploadStatus("success");
      setUploadMsg(
        `✅ Année ${year} importée : ${
          res.data.current?.toLocaleString() ?? res.data.rows_inserted?.toLocaleString()
        } accidents`
      );
      setTimeout(() => setUploadMsg(""), 5000);
    } catch (err) {
      console.error(`Import ${year} failed:`, err);
      setPipelineError(`Import de ${year} a échoué : ${extractErrorMessage(err)}`);
    } finally {
      setImportingYear(null);
    }
  };

  // ── FIXED: handleDeleteClick — look up real per-table counts ───────────────
  const handleDeleteClick = (year: number) => {
    const ys = yearsPipelineStatus.find((s) => s.year === year);
    setConfirmDialog({
      show: true,
      year,
      rawCount:   ys?.raw_count   ?? 0,
      cleanCount: ys?.clean_count ?? 0,
      factCount:  ys?.fact_count  ?? 0,
    });
  };

  // ── FIXED: handleConfirmDelete — optimistic removal + proper reset ─────────
  const handleConfirmDelete = async () => {
    const { year } = confirmDialog;
    if (!year) return;

    setDeletingYear(year);
    setConfirmDialog({ show: false, year: null, rawCount: 0, cleanCount: 0, factCount: 0 });

    try {
      console.log("[delete] Deleting year:", year);
      const response = await axios.post(
        `${API}/etl/delete-year`,
        { year, force: true },
        { headers: authHeaders() }
      );
      console.log("[delete] Response:", response.data);

      // Optimistic: remove immediately so UI doesn't wait for server re-fetch
      setYearsData((prev) => prev.filter((d) => d.year !== year));
      setYearsPipelineStatus((prev) => prev.filter((s) => s.year !== year));

      // Then sync with server
      await fetchYearsDistribution();
      await fetchYearsPipelineStatus();
      await checkPipelineStatus();

      setUploadStatus("success");
      setUploadMsg(`✅ Année ${year} supprimée`);
      setTimeout(() => setUploadMsg(""), 5000);
    } catch (err) {
      console.error("[delete] Failed:", err);
      setPipelineError(
        `Impossible de supprimer l'année ${year}: ${extractErrorMessage(err)}`
      );
      // Re-fetch to restore accurate state if delete failed
      await fetchYearsDistribution();
      await fetchYearsPipelineStatus();
    } finally {
      setDeletingYear(null);
    }
  };

  const handleCancelDelete = () => {
    setConfirmDialog({ show: false, year: null, rawCount: 0, cleanCount: 0, factCount: 0 });
  };

  // ── Pipeline Status ─────────────────────────────────────────────────────────
  const checkPipelineStatus = useCallback(async () => {
    if (!token) return;
    setCheckingStatus(true);
    try {
      const res = await axios.get(`${API}/etl/pipeline-status`, {
        headers: authHeaders(),
        timeout: 15000,
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
        timeout: 15000,
      });
      setJobHistory(res.data.jobs ?? []);
    } catch (err) {
      console.error("Échec de la récupération de l'historique:", extractErrorMessage(err));
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
        timeout: 10000,
      });
      setRunningJobs(res.data.running_jobs ?? []);
    } catch {
      // Silent
    }
  }, [token, authHeaders]);

  // ── Run a single job ────────────────────────────────────────────────────────
  const runJob = async (job: Job, specificYear?: number) => {
    if (!token || !isJobUnlocked(job)) return;
    setPipelineError(null);
    setJobStatus((s) => ({ ...s, [job.id]: "loading" }));
    setJobResult((r) => ({ ...r, [job.id]: { message: "" } }));

    const payload: Record<string, unknown> = {};

    if (job.id === "load-raw" && typeof selectedYear === "number") {
      payload.year = specificYear ?? selectedYear;
    }
    if (job.id === "build-clean" && typeof selectedYear === "number") {
      payload.year = specificYear ?? selectedYear;
    }
    // build-datamart: no year filter (processes all)

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
      await fetchYearsPipelineStatus();
    } catch (err) {
      setJobStatus((s) => ({ ...s, [job.id]: "error" }));
      const msg = extractErrorMessage(err);
      const detail = err instanceof AxiosError ? err.response?.data?.detail : undefined;
      const missing = err instanceof AxiosError ? (err.response?.data?.missing ?? []) : [];
      setJobResult((r) => ({
        ...r,
        [job.id]: { message: msg, detail, missing },
      }));
      setPipelineError(
        `"${job.label}" failed: ${msg}${detail ? ` — ${detail}` : ""}`
      );
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
    const interval = setInterval(fetchRunningJobs, 5000);
    return () => clearInterval(interval);
  }, [token, fetchRunningJobs]);

  useEffect(() => {
    if (!token) return;
    const anyLoading = Object.values(jobStatus).some((s) => s === "loading");
    const delay = anyLoading ? 5000 : 15000;
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
      fetchYearsPipelineStatus();
    }
  }, [token, checkPipelineStatus, fetchJobHistory, fetchYearsDistribution, fetchYearsPipelineStatus]);

  // ── Status icon helper ──────────────────────────────────────────────────────
  const statusIcon = (status: JobStatus) => {
    if (status === "loading") return <Loader size={14} className="etl-spin" />;
    if (status === "success") return <CheckCircle2 size={14} color="#4ade80" />;
    if (status === "partial") return <AlertCircle size={14} color="#fbbf24" />;
    if (status === "error") return <AlertCircle size={14} color="#f87171" />;
    return null;
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="etl-page">
      <div className="etl-header">
        <h1 className="etl-title">Pipeline ETL</h1>
        <p className="etl-sub">Import, transformation et gestion des données d'accidents</p>
      </div>

      {/* Tabs */}
      <div className="etl-tabs">
        <button
          className={`etl-tab ${activeTab === "jobs" ? "active" : ""}`}
          onClick={() => setActiveTab("jobs")}
        >
          <LayoutDashboard size={16} />
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
          <button className="etl-error-dismiss" onClick={() => setPipelineError(null)}>
            ×
          </button>
        </div>
      )}

      {/* ── Tab 1: Jobs ── */}
      {activeTab === "jobs" && (
        <>
          {/* Pipeline status */}
          <div className="etl-pipeline">
            <div className="etl-pipeline-hd">
              <div className="etl-pipeline-title">
                <RefreshCw size={13} className={checkingStatus ? "etl-spin" : ""} />
                État global du pipeline
              </div>
              <button
                className="etl-pipeline-refresh"
                onClick={checkPipelineStatus}
                disabled={checkingStatus}
              >
                {checkingStatus ? (
                  <Loader size={12} className="etl-spin" />
                ) : (
                  <>
                    <RefreshCw size={12} /> Actualiser
                  </>
                )}
              </button>
            </div>
            <div className="etl-pipeline-steps">
              <div className={`etl-ps ${pipelineStatus?.csv_exists ? "ps-done" : ""}`}>
                <div className="etl-ps-icon">📁</div>
                <div className="etl-ps-name">CSV Uploadé</div>
                {pipelineStatus?.csv_exists ? (
                  <CheckCircle2 size={14} color="#4ade80" />
                ) : (
                  <div style={{ width: 14, height: 14, opacity: 0.4 }}>○</div>
                )}
              </div>
              <div
                className={`etl-ps ${
                  pipelineStatus?.raw.is_complete
                    ? "ps-done"
                    : pipelineStatus?.raw.exists
                    ? "ps-partial"
                    : ""
                }`}
              >
                <div className="etl-ps-icon">💾</div>
                <div className="etl-ps-name">Raw Loaded</div>
                {pipelineStatus?.raw.is_complete ? (
                  <CheckCircle2 size={14} color="#4ade80" />
                ) : pipelineStatus?.raw.exists ? (
                  <AlertCircle size={14} color="#fbbf24" />
                ) : (
                  <div style={{ width: 14, height: 14, opacity: 0.4 }}>○</div>
                )}
              </div>
              <div
                className={`etl-ps ${
                  pipelineStatus?.clean.is_complete
                    ? "ps-done"
                    : pipelineStatus?.clean.exists
                    ? "ps-partial"
                    : ""
                }`}
              >
                <div className="etl-ps-icon">🧹</div>
                <div className="etl-ps-name">Clean Built</div>
                {pipelineStatus?.clean.is_complete ? (
                  <CheckCircle2 size={14} color="#4ade80" />
                ) : pipelineStatus?.clean.exists ? (
                  <AlertCircle size={14} color="#fbbf24" />
                ) : (
                  <div style={{ width: 14, height: 14, opacity: 0.4 }}>○</div>
                )}
              </div>
              <div
                className={`etl-ps ${
                  pipelineStatus?.datamart.is_complete
                    ? "ps-done"
                    : pipelineStatus?.datamart.exists
                    ? "ps-partial"
                    : ""
                }`}
              >
                <div className="etl-ps-icon">⭐</div>
                <div className="etl-ps-name">Datamart</div>
                {pipelineStatus?.datamart.is_complete ? (
                  <CheckCircle2 size={14} color="#4ade80" />
                ) : pipelineStatus?.datamart.exists ? (
                  <AlertCircle size={14} color="#fbbf24" />
                ) : (
                  <div style={{ width: 14, height: 14, opacity: 0.4 }}>○</div>
                )}
              </div>
            </div>

            {pipelineStatus &&
              !pipelineStatus.datamart.is_complete &&
              pipelineStatus.datamart.exists && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 10,
                    background: "rgba(251,191,36,.1)",
                    borderRadius: 8,
                    textAlign: "center",
                    fontSize: 12,
                    color: "#fbbf24",
                  }}
                >
                  ⚠️ Datamart partiellement construit :{" "}
                  {pipelineStatus.datamart.completion_percentage}% complet
                </div>
              )}
          </div>

          {/* Per-year pipeline grid */}
          {loadingPipelineStatus ? (
            <div className="etl-loading">
              <Loader size={20} className="etl-spin" />
              <span>Chargement de l'état du pipeline...</span>
            </div>
          ) : yearsPipelineStatus.length > 0 &&
            yearsPipelineStatus.some((ys) => !ys.fact_exists) ? (
            <div className="etl-year-pipeline-grid">
              {yearsPipelineStatus
                .filter((ys) => !ys.fact_exists)
                .map((ys) => (
                  <div key={ys.year} className="etl-year-pipeline-card">
                    <div className="etl-year-pipeline-header">
                      <span className="etl-year-pipeline-year">{ys.year}</span>
                      <span
                        className="etl-year-pipeline-badge"
                        style={{
                          background: !ys.raw_exists
                            ? "#64748b20"
                            : "#fbbf2420",
                          color: !ys.raw_exists ? "#64748b" : "#fbbf24",
                        }}
                      >
                        {!ys.raw_exists
                          ? "📥 À importer"
                          : !ys.clean_exists
                          ? "⚠️ Raw terminé, Clean à faire"
                          : "⚠️ Clean terminé, Datamart à faire"}
                      </span>
                    </div>
                    <div className="etl-year-pipeline-stats">
                      <div className="etl-year-pipeline-stat">
                        <span>📄 Raw</span>
                        <strong>{ys.raw_count.toLocaleString()}</strong>
                        {ys.raw_exists && <CheckCircle2 size={12} color="#4ade80" />}
                      </div>
                      <div className="etl-year-pipeline-stat">
                        <span>🧹 Clean</span>
                        <strong>{ys.clean_count.toLocaleString()}</strong>
                        {ys.clean_exists && <CheckCircle2 size={12} color="#4ade80" />}
                      </div>
                      <div className="etl-year-pipeline-stat">
                        <span>⭐ Datamart</span>
                        <strong>{ys.fact_count.toLocaleString()}</strong>
                        {ys.fact_exists && <CheckCircle2 size={12} color="#4ade80" />}
                      </div>
                    </div>
                    <button
                      className="etl-year-pipeline-continue"
                      onClick={() =>
                        continuePipeline(
                          ys.year,
                          !ys.raw_exists ? "raw" : !ys.clean_exists ? "clean" : "datamart"
                        )
                      }
                      disabled={continuingYear === ys.year}
                    >
                      {continuingYear === ys.year ? (
                        <Loader size={12} className="etl-spin" />
                      ) : (
                        <Play size={12} />
                      )}
                      Continuer (
                      {!ys.raw_exists
                        ? "Load Raw"
                        : !ys.clean_exists
                        ? "Build Clean"
                        : "Build Datamart"}
                      )
                    </button>
                  </div>
                ))}
            </div>
          ) : null}

          <div className="etl-grid">
            {/* Upload card */}
            <div className="etl-card">
              <div className="etl-card-title">Étape 1 — Importer et analyser le CSV</div>
              <div className="etl-card-desc">Jeu de données des accidents routiers aux États-Unis</div>

              <div
                className={`etl-upload-zone ${
                  colErrors.length > 0 ? "zone-invalid" : colOk ? "zone-valid" : ""
                }`}
                onClick={() => fileRef.current?.click()}
              >
                <Upload
                  size={24}
                  color={colErrors.length > 0 ? "#f87171" : colOk ? "#4ade80" : "#3b82f6"}
                />
                <div className="etl-upload-label" style={{ marginTop: 8 }}>
                  Cliquez pour parcourir
                </div>
                <div className="etl-upload-label" style={{ fontSize: 11 }}>
                  fichiers .csv seulement
                </div>
                {file && <div className="etl-file-name">{file.name}</div>}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />

              {colErrors.length > 0 && (
                <div className="etl-col-errors">
                  <strong>Colonnes requises manquantes:</strong> {colErrors.join(", ")}
                </div>
              )}

              {uploadStatus === "loading" && (
                <div>
                  <div className="etl-progress-bar">
                    <div
                      className="etl-progress-fill"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <div className="etl-progress-text">{uploadProgress}% téléchargé</div>
                </div>
              )}

              <button
                className="etl-btn"
                disabled={
                  !file ||
                  uploadStatus === "loading" ||
                  uploadStatus === "success" ||
                  colErrors.length > 0
                }
                onClick={handleUploadAndAnalyze}
              >
                {uploadStatus === "loading" ? (
                  <>
                    <Loader size={13} className="etl-spin" /> Téléchargement et analyse…
                  </>
                ) : uploadStatus === "success" ? (
                  <>
                    <CheckCircle2 size={13} /> Importé et analysé
                  </>
                ) : (
                  <>
                    <Upload size={13} /> Importer et analyser
                  </>
                )}
              </button>

              {uploadMsg && (
                <div
                  className={`etl-result ${
                    uploadStatus === "success" ? "res-ok" : "res-err"
                  }`}
                >
                  {uploadStatus === "success" ? (
                    <CheckCircle2 size={13} />
                  ) : (
                    <AlertCircle size={13} />
                  )}
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
                      <div className="etl-year-stat-val">
                        {fmt(csvAnalysis.total_rows_scanned)}
                      </div>
                    </div>
                    <div className="etl-year-stat">
                      <div className="etl-year-stat-lbl">Années trouvées</div>
                      <div className="etl-year-stat-val">
                        {csvAnalysis.available_years?.length ?? 0}
                      </div>
                    </div>
                  </div>
                  <div className="etl-year-btns">
                    <button
                      className={`etl-year-btn ${selectedYear === "all" ? "active" : ""}`}
                      onClick={() => setSelectedYear("all")}
                    >
                      tout ({fmt(csvAnalysis.total_rows_scanned)})
                    </button>
                    {csvAnalysis.available_years?.map((y) => (
                      <button
                        key={y}
                        className={`etl-year-btn ${selectedYear === y ? "active" : ""}`}
                        onClick={() => setSelectedYear(y)}
                      >
                        {y} ({fmt(csvAnalysis.year_counts?.[y])})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Jobs card */}
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
                    <div
                      key={job.id}
                      className={`etl-job-row ${!unlocked ? "job-locked" : ""} ${
                        isDone ? "job-done" : ""
                      } ${isError ? "job-error" : ""}`}
                    >
                      <div className="etl-job-info">
                        <div className="etl-job-name">
                          {job.icon} {idx + 1}. {job.label}
                          {isError && (
                            <span
                              className="etl-job-badge badge-error"
                              style={{
                                fontSize: 9,
                                padding: "2px 8px",
                                borderRadius: 12,
                                background: "rgba(239,68,68,.15)",
                                color: "#f87171",
                              }}
                            >
                              Échec
                            </span>
                          )}
                        </div>
                        <div className="etl-job-desc">{job.description}</div>
                        {!unlocked && (
                          <div className="etl-job-lock">
                            <Lock size={10} /> {job.lockHint}
                          </div>
                        )}
                        {isError && result?.message && (
                          <div
                            className="etl-job-error-msg"
                            style={{ fontSize: 11, color: "#f87171", marginTop: 4 }}
                          >
                            ✕ {result.message}
                          </div>
                        )}
                        {isDone && result && (
                          <div className="etl-job-pills">
                            {result.rows_inserted != null && (
                              <span className="etl-pill pill-green">
                                {fmt(result.rows_inserted)} inséré
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="etl-job-actions">
                        {statusIcon(st)}
                        <button
                          className="etl-run-btn"
                          disabled={!unlocked || isLoading}
                          onClick={() => runJob(job)}
                        >
                          {isLoading ? (
                            <>
                              <Loader size={11} className="etl-spin" /> Running…
                            </>
                          ) : isDone ? (
                            <>
                              <RefreshCw size={11} /> Re-run
                            </>
                          ) : (
                            <>
                              <Play size={11} /> Run
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                className="etl-reset-btn"
                onClick={resetAllJobs}
                style={{
                  marginTop: 16,
                  width: "100%",
                  padding: "8px",
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: "8px",
                  color: "#f87171",
                  fontSize: "12px",
                  fontWeight: "500",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                <RotateCcw size={13} /> Réinitialiser toutes les tâches
              </button>
            </div>
          </div>

          {/* Job history */}
          <button
            className="etl-history-toggle"
            onClick={() => {
              if (!showHistory) fetchJobHistory();
              setShowHistory(!showHistory);
            }}
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
              marginBottom: "12px",
            }}
          >
            <History size={15} />
            <span>Historique des exécutions ETL</span>
            <span
              className="hd-count"
              style={{
                marginLeft: "auto",
                fontSize: "10px",
                padding: "2px 10px",
                borderRadius: "20px",
                background: "var(--surface2)",
              }}
            >
              {jobHistory.length} tâches
            </span>
            {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showHistory && (
            <div
              className="etl-history-panel"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                marginBottom: "20px",
                overflow: "hidden",
              }}
            >
              <div
                className="etl-history-hd"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "14px 20px",
                  background: "var(--surface2)",
                  borderBottom: "1px solid var(--border)",
                  fontWeight: 600,
                  color: "#93c5fd",
                  textTransform: "uppercase",
                  fontSize: "11px",
                }}
              >
                <History size={14} />
                <span>Exécutions récentes</span>
                <button
                  className="etl-history-refresh"
                  onClick={fetchJobHistory}
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
                    fontSize: "11px",
                  }}
                >
                  {isLoadingHistory ? (
                    <Loader size={12} className="etl-spin" />
                  ) : (
                    <>
                      <RefreshCw size={12} /> Actualiser
                    </>
                  )}
                </button>
              </div>

              {isLoadingHistory ? (
                <div
                  className="etl-history-empty"
                  style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}
                >
                  <Loader size={22} className="etl-spin" />
                  <span>Chargement de l'historique...</span>
                </div>
              ) : jobHistory.length === 0 ? (
                <div
                  className="etl-history-empty"
                  style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}
                >
                  <CheckCircle2 size={22} color="#4ade80" />
                  <span>Aucune tâche ETL n'a encore été exécutée</span>
                </div>
              ) : (
                <div
                  className="etl-history-list"
                  style={{ maxHeight: "420px", overflowY: "auto" }}
                >
                  {jobHistory.map((job) => (
                    <div
                      key={job.id}
                      className="etl-history-item"
                      style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}
                    >
                      <div
                        className="etl-history-item-hd"
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "8px",
                        }}
                      >
                        <div
                          className="etl-history-item-name"
                          style={{ display: "flex", alignItems: "center", gap: "8px" }}
                        >
                          <span style={{ fontWeight: 600 }}>{job.name}</span>
                          <span
                            style={{
                              padding: "2px 10px",
                              borderRadius: "20px",
                              fontSize: "10px",
                              fontWeight: 600,
                              background:
                                job.status === "success"
                                  ? "rgba(74,222,128,.12)"
                                  : "rgba(239,68,68,.12)",
                              color:
                                job.status === "success" ? "#4ade80" : "#f87171",
                            }}
                          >
                            {job.status === "success" ? "Succès" : "Échec"}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: "10px",
                            color: "var(--text-faint)",
                            fontFamily: "monospace",
                          }}
                        >
                          {new Date(job.created_at).toLocaleString("fr-FR")}
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: "16px",
                          flexWrap: "wrap",
                          marginBottom: "8px",
                        }}
                      >
                        {job.rows_inserted > 0 && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "5px",
                              fontSize: "11px",
                              color: "var(--text-muted)",
                            }}
                          >
                            <CheckCircle2 size={11} color="#4ade80" />
                            <span>{job.rows_inserted.toLocaleString()} insérés</span>
                          </div>
                        )}
                        {job.rows_processed > 0 && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "5px",
                              fontSize: "11px",
                              color: "var(--text-muted)",
                            }}
                          >
                            <RefreshCw size={11} />
                            <span>{job.rows_processed.toLocaleString()} traités</span>
                          </div>
                        )}
                        {job.duration_seconds > 0 && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "5px",
                              fontSize: "11px",
                              color: "var(--text-muted)",
                            }}
                          >
                            ⏱ <span>{fmtDuration(job.duration_seconds)}</span>
                          </div>
                        )}
                      </div>
                      {job.error_message && (
                        <div
                          style={{
                            marginTop: "8px",
                            padding: "8px 12px",
                            borderRadius: "6px",
                            background: "rgba(239,68,68,.08)",
                            color: "#f87171",
                            fontSize: "11px",
                          }}
                        >
                          <AlertCircle
                            size={12}
                            style={{ display: "inline", marginRight: 6 }}
                          />
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

      {/* ── Tab 2: Manage years ── */}
      {activeTab === "manage" && (
        <YearManager
          yearsData={yearsData}
          loadingYears={loadingYears}
          importingYear={importingYear}
          onImportYear={importYear}
          onDeleteYear={handleDeleteClick}
        />
      )}

      {/* Confirm delete modal */}
      <ConfirmDialog
        isOpen={confirmDialog.show}
        year={confirmDialog.year}
        rawCount={confirmDialog.rawCount}
        cleanCount={confirmDialog.cleanCount}
        factCount={confirmDialog.factCount}
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
  );
}