// src/pages/ETLJobs.tsx
import React, { useState, useRef, useEffect, useCallback } from "react";
import axios, { AxiosError } from "axios";
import { useAuth } from "../context/AuthContext";
import {
  Upload, Play, CheckCircle2, AlertCircle, Loader,
  Lock, BarChart3, RefreshCw, PlayCircle, History,
  ChevronDown, ChevronUp, Database, Zap, RotateCcw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type JobStatus = "idle" | "loading" | "success" | "error" | "partial";

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

// ─── Constants ────────────────────────────────────────────────────────────────

const API = "http://127.0.0.1:5050";

const REQUIRED_COLUMNS = [
  "ID", "Start_Time", "End_Time", "City", "State", "Severity",
  "Temperature(F)", "Visibility(mi)", "Weather_Condition", "Start_Lat", "Start_Lng",
];

const JOBS: Job[] = [
  {
    id: "load-raw",
    label: "Load Raw",
    description: "Ingest CSV → accidents_raw staging table (appends new years, skips duplicates)",
    endpoint: "/etl/load-raw",
    dependsOn: "__upload__",
    lockHint: "Upload and analyze a valid CSV file first",
    icon: <Database size={14} />,
  },
  {
    id: "build-clean",
    label: "Build Clean",
    description: "Validate, convert units (°C / km) and enrich → accidents_clean",
    endpoint: "/etl/build-clean",
    dependsOn: "load-raw",
    lockHint: 'Complete "Load Raw" first',
    icon: <Zap size={14} />,
  },
  {
    id: "build-datamart",
    label: "Build Datamart",
    description: "Create star schema dimensions and fact table for analytics (incremental)",
    endpoint: "/etl/build-datamart",
    dependsOn: "build-clean",
    lockHint: 'Complete "Build Clean" first',
    icon: <BarChart3 size={14} />,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data;
    if (data?.detail) return String(data.detail);
    if (data?.message) return String(data.message);
    if (err.code === "ECONNABORTED") return "Request timed out — the job is still running on the server.";
    if (!err.response) return "Cannot reach the server. Is the backend running?";
    return `Server error ${err.response.status}: ${err.response.statusText}`;
  }
  if (err instanceof Error) return err.message;
  return "An unexpected error occurred.";
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

// ─── Helper: should we show the pipeline panel? ───────────────────────────────
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function ETLPage() {
  const { token } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [colErrors, setColErrors] = useState<string[]>([]);
  const [colOk, setColOk] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<JobStatus>("idle");
  const [uploadMsg, setUploadMsg] = useState("");

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

  // Pipeline-level error banner
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  // Dedupe refs
  const analysisDoneRef = useRef(false);
  const analysisInProgressRef = useRef(false);
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
    setCsvAnalysis(null);
    analysisDoneRef.current = false;
    setPipelineError(null);
    if (!f) return;

    const { ok, missing } = await validateColumns(f);
    if (!ok) setColErrors(missing);
    else setColOk(true);
  };

  // ── Upload ──────────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!file || !token || colErrors.length > 0) return;
    setUploadStatus("loading");
    setUploadMsg("");
    setPipelineError(null);

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await axios.post(`${API}/etl/upload-csv`, form, {
        headers: { ...authHeaders(), "Content-Type": "multipart/form-data" },
        timeout: 120_000,
      });
      setUploadStatus("success");
      setUploadMsg(res.data.message ?? "Uploaded successfully");
      
      analysisDoneRef.current = false;
      await new Promise(resolve => setTimeout(resolve, 1000));
      await analyzeCSV(true);
      await checkPipelineStatus();
      
    } catch (err) {
      setUploadStatus("error");
      const msg = extractErrorMessage(err);
      setUploadMsg(msg);
    }
  };

  // ── CSV Analysis ────────────────────────────────────────────────────────────
  const analyzeCSV = useCallback(
    async (forceRefresh = false) => {
      if (!token) return;
      
      if (!forceRefresh && analysisDoneRef.current && csvAnalysis) return;
      
      if (analysisInProgressRef.current) {
        console.log("Analysis already in progress, skipping...");
        return;
      }

      analysisInProgressRef.current = true;
      setIsAnalyzing(true);
      setPipelineError(null);

      try {
        const res = await axios.get(`${API}/etl/analyze-csv`, {
          headers: authHeaders(),
          timeout: 300_000,
        });
        const data: CSVAnalysis = res.data;
        setCsvAnalysis(data);
        analysisDoneRef.current = true;

        if (data.available_years?.length > 0) {
          const maxYear = Math.max(...data.available_years);
          setSelectedYear(maxYear);
        }
      } catch (err) {
        const msg = extractErrorMessage(err);
        if (!(err instanceof AxiosError && err.response?.status === 401)) {
          setPipelineError(`CSV analysis failed: ${msg}`);
          analysisDoneRef.current = false;
        }
      } finally {
        setIsAnalyzing(false);
        analysisInProgressRef.current = false;
      }
    },
    [token, csvAnalysis, authHeaders]
  );

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

      if (data.csv_exists && !analysisDoneRef.current && !analysisInProgressRef.current) {
        setTimeout(() => {
          analyzeCSV(false);
        }, 500);
        setUploadStatus("success");
      }
    } catch (err) {
      if (!(err instanceof AxiosError && err.response?.status === 401)) {
        console.error("Pipeline status check failed:", extractErrorMessage(err));
      }
    } finally {
      setCheckingStatus(false);
    }
  }, [token, authHeaders, analyzeCSV]);

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
      console.error("Failed to fetch job history:", extractErrorMessage(err));
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

    const timeout = 0;

    try {
      const res = await axios.post(`${API}${job.endpoint}`, payload, {
        headers: authHeaders(),
        timeout,
      });
      setJobStatus((s) => ({ ...s, [job.id]: "success" }));
      setJobResult((r) => ({ ...r, [job.id]: res.data }));
      await fetchJobHistory();
      await checkPipelineStatus();
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

        const timeout = 0;

        try {
          const res = await axios.post(`${API}${job.endpoint}`, payload, {
            headers: authHeaders(),
            timeout,
          });
          setJobStatus((s) => ({ ...s, [stepId]: "success" }));
          setJobResult((r) => ({ ...r, [stepId]: res.data }));
          await checkPipelineStatus();
        } catch (err) {
          throw err;
        }
      }

      await fetchJobHistory();
    } catch (err) {
      const msg = extractErrorMessage(err);
      setPipelineError(`Pipeline resume failed: ${msg}`);
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
    }
  }, [token, checkPipelineStatus, fetchJobHistory]);

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
        /* ── Reset / base ─────────────────────────────────────────── */
        .etl-page { font-family: var(--font-sans, 'DM Sans', system-ui, sans-serif); }

        /* ── Header ───────────────────────────────────────────────── */
        .etl-header { margin-bottom: 28px; }
        .etl-title  { font-size: 22px; font-weight: 600; color: var(--text-main); margin: 0 0 4px; letter-spacing: -0.3px; }
        .etl-sub    { font-size: 12px; color: var(--text-muted); font-family: var(--mono, monospace); margin: 0; }

        /* ── Error banner ─────────────────────────────────────────── */
        .etl-error-banner {
          display: flex; align-items: flex-start; gap: 10px;
          padding: 12px 16px; border-radius: 10px;
          background: rgba(239,68,68,.08); border: 1px solid rgba(239,68,68,.25);
          color: #f87171; font-size: 12px; line-height: 1.5; margin-bottom: 18px;
        }
        .etl-error-banner svg { flex-shrink: 0; margin-top: 1px; }
        .etl-error-dismiss {
          margin-left: auto; background: transparent; border: none;
          cursor: pointer; color: #f87171; opacity: .7; font-size: 18px; line-height: 1;
          padding: 0 2px; flex-shrink: 0;
        }
        .etl-error-dismiss:hover { opacity: 1; }

        /* ── Pipeline Status (Compact) ──────────────────────────────────────── */
        .etl-pipeline {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 10px; padding: 12px 14px; margin-bottom: 16px;
        }
        .etl-pipeline-hd {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 12px;
        }
        .etl-pipeline-title {
          display: flex; align-items: center; gap: 6px;
          font-size: 10px; font-weight: 600; text-transform: uppercase;
          letter-spacing: .05em; color: var(--text-main);
        }
        .etl-pipeline-refresh {
          background: transparent; border: 1px solid var(--border);
          border-radius: 5px; padding: 3px 7px; cursor: pointer;
          color: var(--text-muted); transition: all .15s;
          display: flex; align-items: center; gap: 3px; font-size: 10px;
        }
        .etl-pipeline-refresh:hover { border-color: #3b82f6; color: #3b82f6; }
        .etl-pipeline-refresh:disabled { opacity: .4; cursor: not-allowed; }

        .etl-pipeline-steps {
          display: flex; flex-wrap: wrap;
          gap: 6px; margin-bottom: 12px;
        }
        .etl-ps {
          display: flex; align-items: center;
          gap: 6px; padding: 5px 8px;
          border-radius: 6px; border: 1px solid var(--border);
          background: var(--surface2); transition: border-color .2s;
          flex: 1 0 auto; min-width: 0;
        }
        .etl-ps.ps-done    { border-color: rgba(74,222,128,.4); background: rgba(74,222,128,.04); }
        .etl-ps.ps-partial { border-color: rgba(251,191,36,.4); background: rgba(251,191,36,.04); }
        .etl-ps-icon  { font-size: 16px; flex-shrink: 0; }
        .etl-ps-name  { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); white-space: nowrap; }
        .etl-ps.ps-done    .etl-ps-name { color: #4ade80; }
        .etl-ps.ps-partial .etl-ps-name { color: #fbbf24; }
        .etl-ps-count { font-size: 10px; color: var(--text-muted); font-family: monospace; flex-shrink: 0; }
        .etl-ps-warn  { font-size: 8px; color: #fbbf24; flex-shrink: 0; display: inline-flex; align-items: center; gap: 2px; }
        .etl-ps-prog  { width: 40px; flex-shrink: 0; }
        .etl-ps-bar   { height: 2px; background: #fbbf24; border-radius: 1px; transition: width .4s; }
        .etl-ps-pct   { font-size: 7px; color: var(--text-muted); display: block; margin-top: 1px; line-height: 1; }

        .etl-resume-btn {
          width: 100%; padding: 8px; border: none; border-radius: 7px; cursor: pointer;
          font-size: 12px; font-weight: 500; color: white;
          background: linear-gradient(135deg, #3b82f6, #6366f1);
          display: flex; align-items: center; justify-content: center; gap: 6px;
          transition: all .2s; margin-top: 2px;
        }
        .etl-resume-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 3px 10px rgba(59,130,246,.3); }
        .etl-resume-btn:disabled { opacity: .5; cursor: not-allowed; }

        .etl-pipeline-warn {
          display: flex; align-items: center; gap: 6px;
          margin-top: 6px; padding: 5px 10px; border-radius: 5px;
          background: rgba(251,191,36,.08); color: #fbbf24; font-size: 10px;
        }

        /* ── Running jobs toast ───────────────────────────────────── */
        .etl-running {
          position: fixed; bottom: 24px; right: 24px; width: 300px;
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.35);
          z-index: 1000; overflow: hidden;
        }
        .etl-running-hd {
          padding: 10px 14px; background: var(--surface2);
          border-bottom: 1px solid var(--border);
          display: flex; align-items: center; gap: 8px;
          font-size: 11px; font-weight: 600; color: var(--text-main);
        }
        .etl-running-item {
          display: flex; justify-content: space-between;
          padding: 10px 14px;
          border-bottom: 1px solid var(--border);
        }
        .etl-running-item:last-child { border-bottom: none; }
        .etl-running-info { display: flex; flex-direction: column; gap: 3px; }
        .etl-running-name { font-size: 12px; font-weight: 500; color: var(--text-main); }
        .etl-running-dur  { font-size: 10px; color: var(--text-muted); font-family: monospace; }

        /* ── Main grid ────────────────────────────────────────────── */
        .etl-grid {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 16px; margin-bottom: 20px;
        }
        .etl-card {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 12px; padding: 20px;
        }
        .etl-card-title {
          font-size: 10px; font-weight: 600; color: #93c5fd;
          text-transform: uppercase; letter-spacing: .08em; margin: 0 0 4px;
        }
        .etl-card-desc { font-size: 12px; color: var(--text-muted); margin: 0 0 16px; font-family: monospace; }

        /* ── Upload zone ──────────────────────────────────────────── */
        .etl-upload-zone {
          border: 1px dashed rgba(59,130,246,.3); border-radius: 10px;
          padding: 24px; text-align: center; cursor: pointer;
          transition: all .2s; margin-bottom: 12px;
          display: flex; flex-direction: column; align-items: center; gap: 6px;
        }
        .etl-upload-zone:hover { border-color: rgba(59,130,246,.6); background: rgba(59,130,246,.04); }
        .etl-upload-zone.zone-invalid { border-color: rgba(239,68,68,.4); background: rgba(239,68,68,.04); }
        .etl-upload-zone.zone-valid   { border-color: rgba(34,197,94,.4);  background: rgba(34,197,94,.04); }
        .etl-upload-label { font-size: 12px; color: var(--text-muted); }
        .etl-file-name    { font-size: 11px; font-family: monospace; color: var(--text-main); margin-top: 4px; }

        .etl-col-errors {
          padding: 8px 12px; border-radius: 6px; margin-bottom: 10px;
          background: rgba(239,68,68,.08); border: 1px solid rgba(239,68,68,.2);
          font-size: 11px; color: #f87171;
        }
        .etl-col-errors strong { display: block; margin-bottom: 4px; }

        .etl-btn {
          width: 100%; height: 36px; border-radius: 8px; border: none;
          font-size: 13px; font-weight: 500; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          background: var(--primary-color, #3b82f6); color: white; transition: all .15s;
        }
        .etl-btn:hover:not(:disabled) { filter: brightness(1.1); }
        .etl-btn:disabled { opacity: .45; cursor: not-allowed; }

        .etl-reset-btn {
          margin-top: 12px;
          width: 100%; height: 36px; border-radius: 8px;
          font-size: 12px; font-weight: 500; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          background: rgba(239,68,68,0.1); color: #f87171;
          border: 1px solid rgba(239,68,68,0.3);
          transition: all .15s;
        }
        .etl-reset-btn:hover {
          background: rgba(239,68,68,0.2);
          border-color: #f87171;
        }

        .etl-result {
          margin-top: 10px; padding: 8px 12px; border-radius: 8px; font-size: 12px;
          display: flex; align-items: flex-start; gap: 8px;
        }
        .etl-result.res-ok  { background: rgba(34,197,94,.08);  color: #4ade80; border: 1px solid rgba(34,197,94,.2); }
        .etl-result.res-err { background: rgba(239,68,68,.08);  color: #f87171; border: 1px solid rgba(239,68,68,.2); }

        /* ── Year selector ────────────────────────────────────────── */
        .etl-year-sel {
          margin-top: 14px; padding: 14px; background: var(--surface2);
          border-radius: 10px; border: 1px solid var(--border);
        }
        .etl-year-hd {
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 12px; font-size: 11px; font-weight: 600; color: #93c5fd;
          text-transform: uppercase; letter-spacing: .06em;
        }
        .etl-year-stats {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 8px; margin-bottom: 12px;
        }
        .etl-year-stat {
          padding: 8px; background: var(--surface); border-radius: 6px;
          text-align: center; border: 1px solid var(--border);
        }
        .etl-year-stat-lbl { font-size: 9px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }
        .etl-year-stat-val { font-size: 16px; font-weight: 600; color: #4ade80; font-family: monospace; }
        .etl-year-btns { display: flex; gap: 6px; flex-wrap: wrap; }
        .etl-year-btn {
          padding: 5px 12px; border-radius: 6px; font-size: 11px; font-weight: 500;
          background: var(--surface); border: 1px solid var(--border);
          cursor: pointer; transition: all .15s; color: var(--text-main);
        }
        .etl-year-btn.active { background: #3b82f6; color: white; border-color: #3b82f6; }
        .etl-year-btn:hover:not(.active) { border-color: #3b82f6; color: #93c5fd; }
        .etl-year-refresh-btn {
          margin-left: auto;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 4px 8px;
          cursor: pointer;
          font-size: 10px;
          display: flex;
          align-items: center;
          gap: 4px;
          transition: all .15s;
        }
        .etl-year-refresh-btn:hover { border-color: #3b82f6; color: #93c5fd; }

        /* ── Job rows ─────────────────────────────────────────────── */
        .etl-jobs-list { display: flex; flex-direction: column; gap: 10px; }
        .etl-job-row {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; padding: 14px 16px; background: var(--surface2);
          border: 1px solid var(--border); border-radius: 10px; transition: border-color .2s;
        }
        .etl-job-row.job-locked  { opacity: .5; }
        .etl-job-row.job-done    { border-color: rgba(34,197,94,.3); }
        .etl-job-row.job-partial { border-color: rgba(251,191,36,.3); background: rgba(251,191,36,.03); }
        .etl-job-row.job-error   { border-color: rgba(239,68,68,.3); }

        .etl-job-info { flex: 1; min-width: 0; }
        .etl-job-name {
          font-size: 13px; font-weight: 500; margin-bottom: 2px;
          display: flex; align-items: center; gap: 7px;
        }
        .etl-job-badge {
          font-size: 9px; padding: 2px 7px; border-radius: 20px; font-weight: 600;
        }
        .badge-partial  { background: rgba(251,191,36,.15); color: #fbbf24; }
        .badge-error    { background: rgba(239,68,68,.15);  color: #f87171; }

        .etl-job-desc    { font-size: 11px; color: var(--text-muted); margin-bottom: 4px; }
        .etl-job-lock    { font-size: 10px; color: #f87171; display: flex; align-items: center; gap: 4px; margin-top: 3px; }
        .etl-job-warning { font-size: 10px; color: #fbbf24; margin-top: 4px; }
        .etl-job-error-msg { font-size: 11px; color: #f87171; margin-top: 4px; }

        .etl-job-pills { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
        .etl-pill {
          font-size: 10px; padding: 2px 8px; border-radius: 20px; font-weight: 500;
        }
        .pill-green  { background: rgba(34,197,94,.1);  color: #4ade80; }
        .pill-yellow { background: rgba(251,191,36,.1); color: #fbbf24; }
        .pill-blue   { background: rgba(59,130,246,.1); color: #93c5fd; }

        .etl-job-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .etl-run-btn {
          height: 30px; padding: 0 14px; border-radius: 7px;
          background: var(--primary-color, #3b82f6); color: white;
          border: none; font-size: 12px; font-weight: 500; cursor: pointer;
          display: flex; align-items: center; gap: 5px; transition: all .15s;
          white-space: nowrap;
        }
        .etl-run-btn:hover:not(:disabled) { filter: brightness(1.1); }
        .etl-run-btn:disabled { opacity: .45; cursor: not-allowed; }

        /* ── History panel ────────────────────────────────────────── */
        .etl-history-toggle {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 14px; background: var(--surface);
          border: 1px solid var(--border); border-radius: 10px;
          cursor: pointer; font-size: 12px; font-weight: 500;
          color: var(--text-muted); transition: all .15s; width: 100%;
          margin-bottom: 8px;
        }
        .etl-history-toggle:hover { border-color: #3b82f6; color: #93c5fd; }
        .etl-history-toggle .hd-count {
          margin-left: auto; font-size: 10px; padding: 2px 8px;
          border-radius: 20px; background: var(--surface2); color: var(--text-muted);
        }

        .etl-history-panel {
          padding: 16px; background: var(--surface);
          border: 1px solid var(--border); border-radius: 10px; margin-bottom: 20px;
        }
        .etl-history-hd {
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 14px; font-size: 11px; font-weight: 600;
          color: #93c5fd; text-transform: uppercase; letter-spacing: .06em;
        }
        .etl-history-refresh {
          margin-left: auto; background: transparent; border: 1px solid var(--border);
          border-radius: 6px; padding: 4px 8px; cursor: pointer;
          color: var(--text-muted); transition: all .15s;
          display: flex; align-items: center; gap: 4px;
        }
        .etl-history-refresh:hover { border-color: #3b82f6; color: #93c5fd; }
        .etl-history-list { max-height: 360px; overflow-y: auto; }
        .etl-history-item {
          padding: 10px 12px; border-bottom: 1px solid var(--border);
          font-size: 11px;
        }
        .etl-history-item:last-child { border-bottom: none; }
        .etl-history-item-hd {
          display: flex; justify-content: space-between;
          align-items: center; margin-bottom: 6px;
          font-size: 12px; font-weight: 500;
        }
        .hist-status {
          padding: 2px 8px; border-radius: 4px;
          font-size: 10px; font-weight: 600; text-transform: uppercase;
        }
        .hist-ok       { background: rgba(74,222,128,.1);  color: #4ade80; }
        .hist-fail     { background: rgba(239,68,68,.1);   color: #f87171; }
        .hist-cancelled{ background: rgba(251,191,36,.1);  color: #fbbf24; }
        .etl-history-metrics {
          display: flex; gap: 10px; flex-wrap: wrap;
          color: var(--text-muted); margin-bottom: 4px;
        }
        .etl-history-date { font-size: 10px; color: var(--text-muted); font-family: monospace; }
        .etl-history-err  {
          margin-top: 6px; padding: 4px 8px; border-radius: 4px;
          background: rgba(239,68,68,.08); color: #f87171; font-size: 10px;
        }
        .etl-history-empty { text-align: center; padding: 24px; color: var(--text-muted); font-size: 12px; }

        /* ── Analyzing indicator ──────────────────────────────────── */
        .etl-analyzing {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 12px; margin-top: 12px; border-radius: 8px;
          background: rgba(59,130,246,.06); border: 1px solid rgba(59,130,246,.2);
          font-size: 12px; color: #93c5fd;
        }
        .etl-analyzing button {
          margin-left: auto;
          background: transparent;
          border: 1px solid rgba(59,130,246,.3);
          border-radius: 4px;
          padding: 4px 8px;
          cursor: pointer;
          font-size: 11px;
          transition: all .15s;
        }
        .etl-analyzing button:hover {
          border-color: #3b82f6;
          color: white;
          background: rgba(59,130,246,.2);
        }

        /* ── Spinner ──────────────────────────────────────────────── */
        @keyframes etl-spin { to { transform: rotate(360deg); } }
        .etl-spin { animation: etl-spin 1s linear infinite; }

        /* ── Responsive ───────────────────────────────────────────── */
        @media (max-width: 680px) {
          .etl-grid { grid-template-columns: 1fr; }
          .etl-pipeline-steps { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>

      <div className="etl-page">
        <div className="etl-header">
          <h1 className="etl-title">ETL Pipeline</h1>
          <p className="etl-sub">Upload dataset → analyze → select year → run pipeline</p>
        </div>

        {pipelineError && (
          <div className="etl-error-banner">
            <AlertCircle size={14} />
            <span>{pipelineError}</span>
            <button className="etl-error-dismiss" onClick={() => setPipelineError(null)}>×</button>
          </div>
        )}

        {pipelineStatus && shouldShowPipeline(pipelineStatus) && (
          <PipelineStatusPanel
            status={pipelineStatus}
            checking={checkingStatus}
            resuming={resuming}
            uploadDone={uploadStatus === "success"}
            onRefresh={checkPipelineStatus}
            onResume={resumePipeline}
          />
        )}

        {runningJobs.length > 0 && (
          <div className="etl-running">
            <div className="etl-running-hd">
              <Loader size={13} className="etl-spin" />
              Running Jobs ({runningJobs.length})
            </div>
            {runningJobs.map((j) => (
              <div key={j.job_id} className="etl-running-item">
                <div className="etl-running-info">
                  <div className="etl-running-name">{j.name}</div>
                  <div className="etl-running-dur">{fmtDuration(j.duration_seconds)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="etl-grid">
          {/* Upload card */}
          <div className="etl-card">
            <div className="etl-card-title">Step 1 — Upload CSV</div>
            <div className="etl-card-desc">US Accidents dataset (any year range)</div>

            <div
              className={`etl-upload-zone ${colErrors.length > 0 ? "zone-invalid" : colOk ? "zone-valid" : ""}`}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={22} color={colErrors.length > 0 ? "#f87171" : colOk ? "#4ade80" : "#3b82f6"} />
              <span className="etl-upload-label">Click to browse or drag & drop</span>
              <span className="etl-upload-label" style={{ fontSize: 10 }}>.csv files only</span>
              {file && <div className="etl-file-name">{file.name}</div>}
            </div>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleFileChange} />

            {colErrors.length > 0 && (
              <div className="etl-col-errors">
                <strong>Missing required columns:</strong> {colErrors.join(", ")}
              </div>
            )}

            <button
              className="etl-btn"
              disabled={!file || uploadStatus === "loading" || uploadStatus === "success" || colErrors.length > 0}
              onClick={handleUpload}
            >
              {uploadStatus === "loading" ? <><Loader size={13} className="etl-spin" /> Uploading…</> : uploadStatus === "success" ? <><CheckCircle2 size={13} /> Uploaded</> : <><Upload size={13} /> Upload File</>}
            </button>

            {uploadMsg && (
              <div className={`etl-result ${uploadStatus === "success" ? "res-ok" : "res-err"}`}>
                {uploadStatus === "success" ? <CheckCircle2 size={13} style={{ flexShrink: 0 }} /> : <AlertCircle size={13} style={{ flexShrink: 0 }} />}
                {uploadMsg}
              </div>
            )}

            {isAnalyzing && (
              <div className="etl-analyzing">
                <Loader size={13} className="etl-spin" />
                Scanning CSV for year distribution…
              </div>
            )}

            {uploadStatus === "success" && !csvAnalysis && !isAnalyzing && (
              <div className="etl-analyzing" style={{ marginTop: '12px' }}>
                <AlertCircle size={13} />
                CSV uploaded but analysis not available. 
                <button onClick={() => analyzeCSV(true)}>Retry Analysis</button>
              </div>
            )}

            {csvAnalysis && !isAnalyzing && (
              <div className="etl-year-sel">
                <div className="etl-year-hd">
                  <BarChart3 size={13} />
                  Data Summary &amp; Year Filter
                  <button className="etl-year-refresh-btn" onClick={() => analyzeCSV(true)}>
                    <RefreshCw size={10} /> Refresh
                  </button>
                </div>
                <div className="etl-year-stats">
                  <div className="etl-year-stat">
                    <div className="etl-year-stat-lbl">Total Rows</div>
                    <div className="etl-year-stat-val">{fmt(csvAnalysis.total_rows_scanned)}</div>
                  </div>
                  <div className="etl-year-stat">
                    <div className="etl-year-stat-lbl">Years Found</div>
                    <div className="etl-year-stat-val">{csvAnalysis.available_years?.length ?? 0}</div>
                  </div>
                </div>
                <div className="etl-year-btns">
                  <button className={`etl-year-btn ${selectedYear === "all" ? "active" : ""}`} onClick={() => setSelectedYear("all")}>
                    All ({fmt(csvAnalysis.total_rows_scanned)})
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

          {/* Pipeline card */}
          <div className="etl-card">
            <div className="etl-card-title">Step 2 — Run Pipeline</div>
            <div className="etl-card-desc">Execute ETL jobs in sequence</div>

            <div className="etl-jobs-list">
              {JOBS.map((job, idx) => {
                const unlocked = isJobUnlocked(job);
                const st = jobStatus[job.id] ?? "idle";
                const isLoading = st === "loading";
                const isDone = st === "success";
                const isPartial = st === "partial";
                const isError = st === "error";
                const result = jobResult[job.id];
                const dmInfo = job.id === "build-datamart" ? pipelineStatus?.datamart : null;

                return (
                  <div key={job.id} className={`etl-job-row ${!unlocked ? "job-locked" : ""} ${isDone ? "job-done" : ""} ${isPartial ? "job-partial" : ""} ${isError ? "job-error" : ""}`}>
                    <div className="etl-job-info">
                      <div className="etl-job-name">
                        {job.icon} {idx + 1}. {job.label}
                        {isPartial && <span className="etl-job-badge badge-partial">Incomplete</span>}
                        {isError && <span className="etl-job-badge badge-error">Failed</span>}
                      </div>
                      <div className="etl-job-desc">{job.description}</div>
                      {!unlocked && <div className="etl-job-lock"><Lock size={10} /> {job.lockHint}</div>}
                      {isPartial && dmInfo && dmInfo.missing_records > 0 && (
                        <div className="etl-job-warning">⚠ {fmt(dmInfo.missing_records)} missing records — {dmInfo.completion_percentage}% complete</div>
                      )}
                      {!isDone && !isPartial && dmInfo?.exists && !dmInfo.is_complete && (
                        <div className="etl-job-warning">⚠ Datamart needs rebuild — {fmt(dmInfo.missing_records)} missing</div>
                      )}
                      {isError && result?.message && <div className="etl-job-error-msg">✕ {result.message}</div>}
                      {(isDone || isPartial) && result && (
                        <div className="etl-job-pills">
                          {result.rows_inserted != null && <span className="etl-pill pill-green">{fmt(result.rows_inserted)} inserted</span>}
                          {result.rows_skipped != null && result.rows_skipped > 0 && <span className="etl-pill pill-yellow">{fmt(result.rows_skipped)} skipped</span>}
                          {result.filter_applied && <span className="etl-pill pill-blue">{result.filter_applied}</span>}
                        </div>
                      )}
                    </div>
                    <div className="etl-job-actions">
                      {statusIcon(st)}
                      <button className="etl-run-btn" disabled={!unlocked || isLoading} onClick={() => runJob(job)}>
                        {isLoading ? <><Loader size={11} className="etl-spin" /> Running…</> : (isDone || isPartial) ? <><RefreshCw size={11} /> Re-run</> : <><Play size={11} /> Run</>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button className="etl-reset-btn" onClick={resetAllJobs}>
              <RotateCcw size={13} /> Reset All Jobs
            </button>
          </div>
        </div>

        <button className="etl-history-toggle" onClick={() => { setShowHistory((v) => { if (!v) fetchJobHistory(); return !v; }); }}>
          <History size={14} /> Job History <span className="hd-count">{jobHistory.length} runs</span>
          {showHistory ? <ChevronUp size={13} style={{ marginLeft: 4 }} /> : <ChevronDown size={13} style={{ marginLeft: 4 }} />}
        </button>

        {showHistory && (
          <div className="etl-history-panel">
            <div className="etl-history-hd">
              <History size={13} /> Recent ETL Runs
              <button className="etl-history-refresh" onClick={fetchJobHistory} disabled={isLoadingHistory}>
                {isLoadingHistory ? <Loader size={12} className="etl-spin" /> : <><RefreshCw size={12} /> Refresh</>}
              </button>
            </div>
            {isLoadingHistory && <div className="etl-history-empty"><Loader size={16} className="etl-spin" style={{ margin: "0 auto" }} /></div>}
            {!isLoadingHistory && jobHistory.length === 0 && <div className="etl-history-empty">No ETL jobs have been run yet.</div>}
            {!isLoadingHistory && jobHistory.length > 0 && (
              <div className="etl-history-list">
                {jobHistory.map((j) => (
                  <div key={j.id} className="etl-history-item">
                    <div className="etl-history-item-hd">
                      <span>{j.name}</span>
                      <span className={`hist-status ${j.status === "success" ? "hist-ok" : j.status === "cancelled" ? "hist-cancelled" : "hist-fail"}`}>{j.status}</span>
                    </div>
                    <div className="etl-history-metrics">
                      {j.rows_inserted > 0 && <span>📥 {fmt(j.rows_inserted)} inserted</span>}
                      {j.rows_processed > 0 && <span>🔄 {fmt(j.rows_processed)} processed</span>}
                      {j.rows_skipped > 0 && <span>⏭ {fmt(j.rows_skipped)} skipped</span>}
                      {j.duration_seconds > 0 && <span>⏱ {fmtDuration(j.duration_seconds)}</span>}
                    </div>
                    <div className="etl-history-date">{new Date(j.created_at).toLocaleString()}</div>
                    {j.error_message && <div className="etl-history-err">{j.error_message}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Pipeline Status sub-component ───────────────────────────────────────────

interface PSProps {
  status: PipelineStatus;
  checking: boolean;
  resuming: boolean;
  uploadDone: boolean;
  onRefresh: () => void;
  onResume: () => void;
}

function PipelineStatusPanel({ status, checking, resuming, uploadDone, onRefresh, onResume }: PSProps) {
  const steps = [
    { key: "upload", icon: "📁", name: "CSV Upload", isComplete: status.csv_exists, exists: status.csv_exists, count: 0 },
    { key: "load-raw", icon: "💾", name: "Load Raw", isComplete: status.raw.is_complete, exists: status.raw.exists, count: status.raw.count },
    { key: "build-clean", icon: "🧹", name: "Build Clean", isComplete: status.clean.is_complete, exists: status.clean.exists, count: status.clean.count },
    { key: "build-datamart", icon: "⭐", name: "Datamart", isComplete: status.datamart.is_complete, exists: status.datamart.exists, count: status.datamart.count, expectedCount: status.datamart.expected_count, missingRecords: status.datamart.missing_records, completionPct: status.datamart.completion_percentage },
  ];

  const needsResume = uploadDone &&
    ((!status.raw.is_complete && status.csv_exists) ||
     (!status.clean.is_complete && status.raw.exists) ||
     (!status.datamart.is_complete && status.clean.exists));

  return (
    <div className="etl-pipeline">
      <div className="etl-pipeline-hd">
        <div className="etl-pipeline-title">
          <RefreshCw size={13} className={checking ? "etl-spin" : ""} />
          Pipeline Status — incomplete steps
        </div>
        <button className="etl-pipeline-refresh" onClick={onRefresh} disabled={checking}>
          {checking ? <Loader size={12} className="etl-spin" /> : <><RefreshCw size={12} /> Refresh</>}
        </button>
      </div>
      <div className="etl-pipeline-steps">
        {steps.map((s) => {
          const cls = s.isComplete ? "ps-done" : s.exists ? "ps-partial" : "";
          return (
            <div key={s.key} className={`etl-ps ${cls}`}>
              <div className="etl-ps-icon">{s.icon}</div>
              <div className="etl-ps-name">{s.name}</div>
              {s.count > 0 && <div className="etl-ps-count">{s.count.toLocaleString()}</div>}
              {s.missingRecords != null && s.missingRecords > 0 && <div className="etl-ps-warn">⚠ {s.missingRecords.toLocaleString()} missing</div>}
              {s.completionPct != null && s.completionPct < 100 && s.completionPct > 0 && (
                <div className="etl-ps-prog">
                  <div className="etl-ps-bar" style={{ width: `${s.completionPct}%` }} />
                  <span className="etl-ps-pct">{s.completionPct}%</span>
                </div>
              )}
              {s.isComplete ? <CheckCircle2 size={13} color="#4ade80" /> : s.exists ? <AlertCircle size={13} color="#fbbf24" /> : <span style={{ fontSize: 13, opacity: .4 }}>○</span>}
            </div>
          );
        })}
      </div>
      {needsResume && (
        <button className="etl-resume-btn" onClick={onResume} disabled={resuming}>
          {resuming ? <><Loader size={13} className="etl-spin" /> Resuming pipeline…</> : <><PlayCircle size={13} /> Resume Pipeline — fix incomplete steps</>}
        </button>
      )}
    </div>
  );
}