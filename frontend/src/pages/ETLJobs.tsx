/**
 * 📄 PAGE ETL - PIPELINE DE TRAITEMENT DES DONNÉES
 * ============================================================================
 * 
 * @version 2.0.0
 * @last_updated 2026-05-13
 * 
 * ────────────────────────────────────────────────────────────────────────────
 * 🎯 OBJECTIF PRINCIPAL
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Permettre à l'utilisateur d'importer un fichier CSV et d'exécuter les 3 étapes
 * du pipeline ETL pour préparer les données à l'analyse et aux prédictions ML.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 📋 FONCTIONNALITÉS
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 1️⃣  IMPORT DU FICHIER
 *     • Upload d'un fichier CSV
 *     • Validation automatique des colonnes requises (11 colonnes)
 *     • Analyse rapide : années disponibles, nombre de lignes par année
 *
 * 2️⃣  PIPELINE ETL (3 ÉTAPES SÉQUENTIELLES)
 *     • LOAD RAW     → Import du CSV dans accidents_raw (déduplication)
 *     • BUILD CLEAN  → Nettoyage + conversion unités (°F→°C, miles→km) → accidents_clean
 *     • BUILD DATAMART → Construction du schéma en étoile (dimensions + faits)
 *                        Utilise le builder modulaire (datamart_builder.py)
 *                        Construit : dim_time, dim_location, dim_weather, dim_road, fact_accident
 *
 * 3️⃣  SURVEILLANCE EN TEMPS RÉEL
 *     • Progression détaillée (pourcentage, lignes insérées, temps écoulé)
 *     • Polling automatique (appel backend toutes les 2-5 secondes)
 *     • États des tâches : En cours / Succès / Échec / Partiel
 *
 * 4️⃣  GESTION DES ANNÉES
 *     • Visualisation des années présentes dans raw, clean et datamart
 *     • Suppression complète (raw + clean + datamart) avec double confirmation
 *     • Affichage des statuts : ✅ Complet / ⚠️ Datamart manquant / ⚠️ Clean manquant
 *
 * 5️⃣  HISTORIQUE
 *     • Journal des dernières exécutions ETL
 *     • Métriques détaillées : durée, lignes insérées, lignes traitées
 *     • Affichage des erreurs en cas d'échec
 *

 * ────────────────────────────────────────────────────────────────────────────
 * 📡 COMMUNICATION BACKEND
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Endpoint                           Méthode   Description
 * ──────────────────────────────────────────────────────────────────────────
 * /etl/upload-and-analyze-csv        POST     Upload + analyse CSV
 * /etl/load-raw                      POST     Import des données brutes
 * /etl/build-clean                   POST     Nettoyage des données
 * /etl/build-datamart-full           POST     Construction complète du datamart
 * /etl/pipeline-status               GET      État global du pipeline
 * /etl/job-history                   GET      Historique des tâches
 * /etl/running-jobs                  GET      Tâches en cours
 * /etl/progress/<id>                 GET      Progression temps réel
 * /etl/delete-year                   POST     Suppression d'une année
 * /etl/year-status                   GET      État par année
 * /etl/years-distribution            GET     Distribution des années
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🚀 FLUX TYPIQUE D'UTILISATION
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   1. L'utilisateur upload un fichier CSV
 *         ↓
 *   2. Le backend analyse les années disponibles
 *         ↓
 *   3. L'utilisateur sélectionne une année (ex: 2022)
 *         ↓
 *   4. Clic sur "LOAD RAW" → import des données brutes (quelques secondes)
 *         ↓
 *   5. Clic sur "BUILD CLEAN" → nettoyage et conversion (2-3 minutes)
 *         ↓
 *   6. Clic sur "BUILD DATAMART" → construction du schéma en étoile (8-10 minutes)
 *         ↓
 *   7. Les données sont prêtes pour l'analyse et les prédictions ML
 *
 * ============================================================================
 */

import { useState, useRef, useEffect, useCallback } from "react";
import axios, { AxiosError } from "axios";
import { useAuth } from "../context/AuthContext";
import { AlertCircle, LayoutDashboard, Settings } from "lucide-react";
import { JobMonitor } from "../components/JobMonitor";

import type {
  JobStatus, TabType, JobResult, Job, CSVAnalysis,
  JobHistoryItem, PipelineStatus, RunningJob,
  YearData, YearPipelineStatus, JobProgress,
} from "./etl/types";
import { JOBS , REQUIRED_COLUMNS } from "./etl/constants"; 
import { ETLPipelineStatus } from "./etl/ETLPipelineStatus";
import { ETLUploadCard }     from "./etl/ETLUploadCard";
import { ETLJobsCard }       from "./etl/ETLJobsCard";
import { ETLJobHistory }     from "./etl/ETLJobHistory";
import { ETLYearManager }    from "./etl/ETLYearManager";

import "./ETLJobs.css";

const API = import.meta.env.VITE_API_URL;

function extractErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data;
    if (data?.detail) return String(data.detail);
    if (data?.message) return String(data.message);
    if (err.code === "ECONNABORTED") return "Le traitement est toujours en cours sur le serveur";
    if (!err.response) return "Impossible de joindre le serveur";
    return `Erreur serveur ${err.response.status}: ${err.response.statusText}`;
  }
  if (err instanceof Error) return err.message;
  return "Une erreur inattendue s'est produite.";
}

export default function ETLPage() {
  const { token } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>("jobs");

  // ── Upload state ────────────────────────────────────────────────────────────
  const [file,           setFile]           = useState<File | null>(null);
  const [colErrors,      setColErrors]      = useState<string[]>([]);
  const [colOk,          setColOk]          = useState(false);
  const [uploadStatus,   setUploadStatus]   = useState<JobStatus>("idle");
  const [uploadMsg,      setUploadMsg]      = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [csvAnalysis,    setCsvAnalysis]    = useState<CSVAnalysis | null>(null);
  const [selectedYear,   setSelectedYear]   = useState<number | "all">("all");
  const [isAnalyzing,    setIsAnalyzing]    = useState(false);

  // ── Job state ───────────────────────────────────────────────────────────────
  const [jobStatus,       setJobStatus]       = useState<Record<string, JobStatus>>({});
  const [jobResult,       setJobResult]       = useState<Record<string, JobResult>>({});
  const [jobProgress,     setJobProgress]     = useState<Record<string, JobProgress>>({});
  const [activeEtlJobIds, setActiveEtlJobIds] = useState<Record<string, number>>({});

  // ── Pipeline / history state ────────────────────────────────────────────────
  const [pipelineStatus,   setPipelineStatus]   = useState<PipelineStatus | null>(null);
  const [checkingStatus,   setCheckingStatus]   = useState(false);
  const [runningJobs,      setRunningJobs]      = useState<RunningJob[]>([]);
  const [jobHistory,       setJobHistory]       = useState<JobHistoryItem[]>([]);
  const [showHistory,      setShowHistory]      = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // ── Year management state ───────────────────────────────────────────────────
  const [yearsData,             setYearsData]             = useState<YearData[]>([]);
  const [loadingYears,          setLoadingYears]          = useState(false);
  const [deletingYear,          setDeletingYear]          = useState<number | null>(null);
  const [yearsPipelineStatus,   setYearsPipelineStatus]   = useState<YearPipelineStatus[]>([]);
  const [loadingPipelineStatus, setLoadingPipelineStatus] = useState(false);
  const [continuingYear,        setContinuingYear]        = useState<number | null>(null);

  const [pipelineError, setPipelineError] = useState<string | null>(null);

  const analysisDoneRef    = useRef(false);
  const initialLoadDoneRef = useRef(false);

  const authHeaders = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);

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
        timeout: 600_000,
        onUploadProgress: (e) => {
          if (e.total) setUploadProgress(Math.round((e.loaded * 100) / e.total));
        },
      });

      const data = res.data;
      const analysis: CSVAnalysis | null =
        data.available_years
          ? { available_years: data.available_years, year_counts: data.year_counts ?? {}, total_rows_scanned: data.total_rows_scanned ?? 0, valid_dates_found: data.valid_dates_found ?? 0 }
          : data.analysis?.status === "success"
          ? { available_years: data.analysis.available_years ?? [], year_counts: data.analysis.year_counts ?? {}, total_rows_scanned: data.analysis.total_rows_scanned ?? 0, valid_dates_found: data.analysis.valid_dates_found ?? 0 }
          : null;

      if (analysis) {
        setCsvAnalysis(analysis);
        setUploadStatus("success");
        setUploadMsg(`Fichier analysé avec succès. ${analysis.total_rows_scanned.toLocaleString("fr-FR")} lignes trouvées.`);
        analysisDoneRef.current = true;
        if (analysis.available_years.length > 0) setSelectedYear(Math.max(...analysis.available_years));
        await Promise.all([checkPipelineStatus(), fetchYearsDistribution(), fetchYearsPipelineStatus()]);
      } else {
        setUploadStatus("error");
        setUploadMsg(data.message ?? data.analysis?.error ?? "Analyse échouée");
      }
    } catch (err) {
      setUploadStatus("error");
      const msg = extractErrorMessage(err);
      setUploadMsg(msg);
      setPipelineError(`Upload échoué : ${msg}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Data fetchers ───────────────────────────────────────────────────────────
  const fetchYearsDistribution = useCallback(async () => {
    if (!token) return;
    setLoadingYears(true);
    try {
      const res = await axios.get(`${API}/etl/years-distribution`, { headers: authHeaders() });
      setYearsData(res.data.years ?? []);
    } catch (err) { console.error(extractErrorMessage(err)); }
    finally { setLoadingYears(false); }
  }, [token, authHeaders]);

  const fetchYearsPipelineStatus = useCallback(async () => {
    if (!token) return;
    setLoadingPipelineStatus(true);
    try {
      const res = await axios.get(`${API}/etl/year-status`, { headers: authHeaders() });
      setYearsPipelineStatus(res.data.years_status ?? []);
    } catch (err) { console.error(err); }
    finally { setLoadingPipelineStatus(false); }
  }, [token, authHeaders]);

  const checkPipelineStatus = useCallback(async () => {
    if (!token) return;
    setCheckingStatus(true);
    try {
      const res = await axios.get(`${API}/etl/pipeline-status`, { headers: authHeaders(), timeout: 15_000 });
      const data: PipelineStatus = res.data;
      setPipelineStatus(data);
      setJobStatus((prev) => {
        const next = { ...prev };
        if (data.raw.is_complete)      next["load-raw"]       = "success"; else if (data.raw.exists)      next["load-raw"]       = "partial";
        if (data.clean.is_complete)    next["build-clean"]    = "success"; else if (data.clean.exists)    next["build-clean"]    = "partial";
        if (data.datamart.is_complete) next["build-datamart"] = "success"; else if (data.datamart.exists) next["build-datamart"] = "partial";
        return next;
      });
      if (data.csv_exists && !analysisDoneRef.current && !isAnalyzing) setUploadStatus("success");
    } catch (err) {
      if (!(err instanceof AxiosError && err.response?.status === 401))
        console.error("Pipeline status check failed:", extractErrorMessage(err));
    } finally { setCheckingStatus(false); }
  }, [token, authHeaders, isAnalyzing]);

  const fetchJobHistory = useCallback(async () => {
    if (!token) return;
    setIsLoadingHistory(true);
    try {
      const res = await axios.get(`${API}/etl/job-history`, { headers: authHeaders(), timeout: 15_000 });
      setJobHistory(res.data.jobs ?? []);
    } catch (err) { console.error(extractErrorMessage(err)); }
    finally { setIsLoadingHistory(false); }
  }, [token, authHeaders]);

  const fetchRunningJobs = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API}/etl/running-jobs`, { headers: authHeaders(), timeout: 10_000 });
      setRunningJobs(res.data.running_jobs ?? []);
    } catch { /* silent */ }
  }, [token, authHeaders]);

  const pollProgress = useCallback(async (jobKey: string, etlJobId: number) => {
    if (!token) return;
    try {
      const res = await axios.get(`${API}/etl/progress/${etlJobId}`, { headers: authHeaders(), timeout: 5_000 });
      const data: JobProgress = res.data;
      if (data.active) {
        setJobProgress((p) => ({ ...p, [jobKey]: data }));
      } else {
        setJobProgress((p) => { const n = { ...p }; delete n[jobKey]; return n; });
        setActiveEtlJobIds((p) => { const n = { ...p }; delete n[jobKey]; return n; });
      }
    } catch { /* silent */ }
  }, [token, authHeaders]);

  // ── Run a job ───────────────────────────────────────────────────────────────
  const runJob = useCallback(async (job: Job, overrideYear?: number) => {
    if (!token) return;
    setPipelineError(null);
    setJobStatus((s) => ({ ...s, [job.id]: "loading" }));
    setJobResult((r) => ({ ...r, [job.id]: { message: "" } }));
    setJobProgress((p) => ({ ...p, [job.id]: { active: true } }));

    const year = overrideYear ?? selectedYear;
    const payload: Record<string, unknown> = {};
    if (year !== "all") payload.year = year;

    try {
      const res = await axios.post(`${API}${job.endpoint}`, payload, { headers: authHeaders(), timeout: 0 });
      const etlJobId: number | undefined = res.data?.etl_job_id ?? res.data?.job_id;
      if (etlJobId) setActiveEtlJobIds((prev) => ({ ...prev, [job.id]: etlJobId }));
      setJobStatus((s) => ({ ...s, [job.id]: "success" }));
      setJobResult((r) => ({ ...r, [job.id]: res.data }));
      await Promise.all([fetchJobHistory(), checkPipelineStatus(), fetchYearsDistribution(), fetchYearsPipelineStatus()]);
    } catch (err) {
      setJobStatus((s) => ({ ...s, [job.id]: "error" }));
      const msg = extractErrorMessage(err);
      const detail = err instanceof AxiosError ? err.response?.data?.detail : undefined;
      setJobResult((r) => ({ ...r, [job.id]: { message: msg, detail } }));
      setPipelineError(`"${job.label}" a échoué : ${msg}${detail ? ` — ${detail}` : ""}`);
    } finally {
      setJobProgress((p) => { const n = { ...p }; delete n[job.id]; return n; });
    }
  }, [token, authHeaders, selectedYear, fetchJobHistory, checkPipelineStatus, fetchYearsDistribution, fetchYearsPipelineStatus]);

  // ── Continue pipeline for a year ────────────────────────────────────────────
  const continuePipeline = async (year: number, step: string) => {
    setContinuingYear(year);
    setPipelineError(null);
    try {
      const jobId = step === "raw" ? "load-raw" : step === "clean" ? "build-clean" : "build-datamart";
      await runJob(JOBS.find((j) => j.id === jobId)!, year);
    } finally {
      setContinuingYear(null);
    }
  };

  // ── Delete year ─────────────────────────────────────────────────────────────
  const deleteYear = async (year: number) => {
    if (!token) return;
    setDeletingYear(year);
    setPipelineError(null);
    try {
      await axios.post(`${API}/etl/delete-year`, { year }, { headers: authHeaders(), timeout: 60_000 });
      await Promise.all([fetchYearsDistribution(), fetchYearsPipelineStatus(), checkPipelineStatus()]);
    } catch (err) {
      setPipelineError(`Suppression de ${year} échouée : ${extractErrorMessage(err)}`);
    } finally {
      setDeletingYear(null);
    }
  };

  // ── Reset all jobs ──────────────────────────────────────────────────────────
  const resetAllJobs = () => {
    setJobStatus({});
    setJobResult({});
    setJobProgress({});
    setActiveEtlJobIds({});
    setPipelineError(null);
    checkPipelineStatus();
  };

  // ── Unlock logic ────────────────────────────────────────────────────────────
  const isJobUnlocked = (job: Job): boolean => {
    if (!job.dependsOn) return true;
    if (job.dependsOn === "__upload__")
      return (uploadStatus === "success" && csvAnalysis !== null) || pipelineStatus?.csv_exists === true;
    const dep = jobStatus[job.dependsOn];
    return dep === "success" || dep === "partial";
  };

  // ── Effects ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    fetchRunningJobs();
    const id = setInterval(fetchRunningJobs, 5_000);
    return () => clearInterval(id);
  }, [token, fetchRunningJobs]);

  useEffect(() => {
    if (!token) return;
    const anyLoading = Object.values(jobStatus).some((s) => s === "loading");
    const id = setInterval(() => {
      checkPipelineStatus();
      if (anyLoading) fetchJobHistory();
    }, anyLoading ? 5_000 : 20_000);
    return () => clearInterval(id);
  }, [token, jobStatus, checkPipelineStatus, fetchJobHistory]);

  useEffect(() => {
    if (!token) return;
    const entries = Object.entries(activeEtlJobIds);
    if (entries.length === 0) return;
    const id = setInterval(() => entries.forEach(([key, etlId]) => pollProgress(key, etlId)), 2_000);
    return () => clearInterval(id);
  }, [token, activeEtlJobIds, pollProgress]);

  useEffect(() => {
    if (token && !initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      checkPipelineStatus();
      fetchJobHistory();
      fetchYearsDistribution();
      fetchYearsPipelineStatus();
    }
  }, [token, checkPipelineStatus, fetchJobHistory, fetchYearsDistribution, fetchYearsPipelineStatus]);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="etl-page">
      <div className="etl-header">
        <h1 className="etl-title">Pipeline ETL</h1>
        <p className="etl-sub">Import, transformation et gestion des données d'accidents</p>
      </div>

      {/* Tabs */}
      <div className="etl-tabs">
        <button className={`etl-tab ${activeTab === "jobs" ? "active" : ""}`} onClick={() => setActiveTab("jobs")}>
          <LayoutDashboard size={16} /> Exécution des tâches
        </button>
        <button className={`etl-tab ${activeTab === "manage" ? "active" : ""}`} onClick={() => setActiveTab("manage")}>
          <Settings size={16} /> Gestion des années
        </button>
      </div>

      {/* Error banner */}
      {pipelineError && (
        <div className="etl-error-banner">
          <AlertCircle size={14} />
          <span>{pipelineError}</span>
          <button className="etl-error-dismiss" onClick={() => setPipelineError(null)}>×</button>
        </div>
      )}

      {/* ── Tab: Jobs ── */}
      {activeTab === "jobs" && (
        <>
          <ETLPipelineStatus
            pipelineStatus={pipelineStatus}
            checkingStatus={checkingStatus}
            onRefresh={checkPipelineStatus}
            yearsPipelineStatus={yearsPipelineStatus}
            loadingPipelineStatus={loadingPipelineStatus}
            continuingYear={continuingYear}
            onContinueYear={continuePipeline}
          />

          <div className="etl-grid">
            <ETLUploadCard
              file={file}
              colErrors={colErrors}
              colOk={colOk}
              uploadStatus={uploadStatus}
              uploadMsg={uploadMsg}
              uploadProgress={uploadProgress}
              csvAnalysis={csvAnalysis}
              isAnalyzing={isAnalyzing}
              selectedYear={selectedYear}
              onFileChange={handleFileChange}
              onUpload={handleUploadAndAnalyze}
              onSelectYear={setSelectedYear}
            />

            <ETLJobsCard
              jobStatus={jobStatus}
              jobResult={jobResult}
              jobProgress={jobProgress}
              selectedYear={selectedYear} 
              isJobUnlocked={isJobUnlocked}
              onRunJob={runJob}
              
              onResetAll={resetAllJobs}
            />
          </div>

          <ETLJobHistory
            jobHistory={jobHistory}
            showHistory={showHistory}
            isLoadingHistory={isLoadingHistory}
            onToggle={() => { if (!showHistory) fetchJobHistory(); setShowHistory(!showHistory); }}
            onRefresh={fetchJobHistory}
          />
        </>
      )}

      {/* ── Tab: Manage years ── */}
      {activeTab === "manage" && (
        <ETLYearManager
          yearsData={yearsData}
          loadingYears={loadingYears}
          deletingYear={deletingYear}
          onDeleteYear={deleteYear}
        />
      )}

      <JobMonitor
        runningJobs={runningJobs}
        onJobCancelled={() => { fetchRunningJobs(); checkPipelineStatus(); fetchJobHistory(); }}
      />
    </div>
  );
}