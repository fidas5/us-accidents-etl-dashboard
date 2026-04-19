// src/pages/ETLJobs.tsx
import React, { useState, useRef } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { Upload, Play, CheckCircle2, AlertCircle, Loader, Lock } from "lucide-react";

type JobStatus = "idle" | "loading" | "success" | "error";

interface JobResult {
  message: string;
  rows_inserted?: number;
  detail?: string;
  missing?: string[];
}

interface Job {
  id: string;
  label: string;
  description: string;
  endpoint: string;
  method: "POST";
}

const JOBS: Job[] = [
  {
    id: "load-raw",
    label: "Load Raw",
    description: "Ingest CSV into accidents_raw staging table",
    endpoint: "/etl/load-raw",
    method: "POST",
  },
  {
    id: "build-clean",
    label: "Build Clean",
    description: "Transform raw → accidents_clean with validation",
    endpoint: "/etl/build-clean",
    method: "POST",
  },
];

const REQUIRED_COLUMNS = [
  "ID",
  "Start_Time",
  "End_Time",
  "City",
  "State",
  "Severity",
  "Temperature(F)",
  "Visibility(mi)",
  "Weather_Condition",
  "Start_Lat",
  "Start_Lng",
];

export default function ETLPage() {
  const { token } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile]                 = useState<File | null>(null);
  const [jobStatus, setJobStatus]       = useState<Record<string, JobStatus>>({});
  const [jobResult, setJobResult]       = useState<Record<string, JobResult>>({});
  const [uploadStatus, setUploadStatus] = useState<JobStatus>("idle");
  const [uploadMsg, setUploadMsg]       = useState<string>("");
  const [colErrors, setColErrors]       = useState<string[]>([]);
  const [colOk, setColOk]               = useState(false);
  const [log, setLog]                   = useState<{ time: string; text: string; type: "ok" | "err" | "info" }[]>([]);

  const rawLoaded = jobStatus["load-raw"] === "success";

  const addLog = (text: string, type: "ok" | "err" | "info" = "info") => {
    const time = new Date().toLocaleTimeString();
    setLog(l => [{ time, text, type }, ...l].slice(0, 50));
  };

  // ── CSV column pre-validation in browser ──
  const validateColumns = (f: File): Promise<{ ok: boolean; missing: string[] }> => {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        const firstLine = (e.target?.result as string).split("\n")[0] ?? "";
        const headers   = firstLine.split(",").map(h => h.trim().replace(/^"|"$/g, ""));
        const missing   = REQUIRED_COLUMNS.filter(c => !headers.includes(c));
        resolve({ ok: missing.length === 0, missing });
      };
      reader.readAsText(f.slice(0, 2048));
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setColErrors([]);
    setColOk(false);
    setUploadStatus("idle");
    setUploadMsg("");

    if (!f) return;
    addLog(`File selected: ${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)`, "info");

    const { ok, missing } = await validateColumns(f);
    if (!ok) {
      setColErrors(missing);
      addLog(`Column mismatch — missing: ${missing.join(", ")}`, "err");
    } else {
      setColOk(true);
      addLog(`Column check passed — all ${REQUIRED_COLUMNS.length} required columns found`, "ok");
    }
  };

  const handleUpload = async () => {
    if (!file || !token || colErrors.length > 0) return;
    setUploadStatus("loading");
    setUploadMsg("");
    addLog(`Uploading ${file.name}…`, "info");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await axios.post("http://127.0.0.1:5050/etl/upload-csv", form, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" },
      });
      setUploadStatus("success");
      setUploadMsg(res.data.message ?? "File uploaded successfully");
      addLog(`Upload success: ${res.data.message}`, "ok");
    } catch (e: any) {
      setUploadStatus("error");
      const msg = e.response?.data?.message ?? "Upload failed";
      setUploadMsg(msg);
      addLog(`Upload error: ${msg}`, "err");
    }
  };

  const runJob = async (job: Job) => {
    if (!token) return;
    if (job.id === "load-raw"    && uploadStatus !== "success") return;
    if (job.id === "build-clean" && !rawLoaded) return;

    setJobStatus(s => ({ ...s, [job.id]: "loading" }));
    addLog(`Running: ${job.label}…`, "info");
    try {
      const res = await axios.post(
        `http://127.0.0.1:5050${job.endpoint}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setJobStatus(s => ({ ...s, [job.id]: "success" }));
      setJobResult(r => ({ ...r, [job.id]: res.data }));
      addLog(`${job.label} done — ${res.data.rows_inserted?.toLocaleString() ?? ""} rows inserted`, "ok");
    } catch (e: any) {
      setJobStatus(s => ({ ...s, [job.id]: "error" }));
      const msg     = e.response?.data?.message ?? "Job failed";
      const missing = e.response?.data?.missing  ?? [];
      setJobResult(r => ({ ...r, [job.id]: { message: msg, detail: e.response?.data?.detail, missing } }));
      addLog(`${job.label} error: ${msg}`, "err");
      if (missing.length > 0) addLog(`Missing columns: ${missing.join(", ")}`, "err");
    }
  };

  const statusIcon = (status: JobStatus) => {
    if (status === "loading") return <Loader size={14} className="spin" />;
    if (status === "success") return <CheckCircle2 size={14} color="#4ade80" />;
    if (status === "error")   return <AlertCircle size={14} color="#f87171" />;
    return null;
  };

  return (
    <>
      <style>{`
        .etl-title { font-size: 22px; font-weight: 500; color: var(--text-main); margin: 0 0 4px; }
        .etl-sub   { font-size: 12px; color: var(--text-muted); font-family: var(--mono); margin: 0 0 28px; }

        .etl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }

        .etl-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 20px;
        }
        .etl-card-title {
          font-size: 13px; font-weight: 500; color: #93c5fd;
          margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.06em;
        }
        .etl-card-desc { font-size: 12px; color: var(--text-muted); font-family: var(--mono); margin: 0 0 16px; }

        .etl-upload-zone {
          border: 1px dashed rgba(59,130,246,0.3); border-radius: 10px;
          padding: 24px; text-align: center; cursor: pointer;
          transition: all 0.2s; margin-bottom: 12px;
        }
        .etl-upload-zone:hover   { border-color: rgba(59,130,246,0.6); background: var(--primary-color-soft); }
        .etl-upload-zone.invalid { border-color: rgba(239,68,68,0.4);  background: rgba(239,68,68,0.04); }
        .etl-upload-zone.valid   { border-color: rgba(34,197,94,0.4);  background: rgba(34,197,94,0.04); }

        .etl-upload-label { font-size: 13px; color: var(--text-muted); margin-top: 8px; display: block; }
        .etl-file-name    { font-size: 12px; color: #93c5fd; font-family: var(--mono); margin-top: 4px; }

        .etl-col-check { margin-bottom: 12px; padding: 10px 12px; border-radius: 8px; font-size: 11px; font-family: var(--mono); }
        .etl-col-check.ok  { background: rgba(34,197,94,0.06); border: 1px solid rgba(34,197,94,0.2);  color: #4ade80; }
        .etl-col-check.err { background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.2);  color: #f87171; }
        .etl-col-check-title { font-weight: 600; margin-bottom: 4px; }
        .etl-col-list  { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
        .etl-col-tag   { padding: 1px 7px; border-radius: 4px; font-size: 10px; background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.25); }

        .etl-mapper { margin-bottom: 12px; padding: 10px 12px; border-radius: 8px; font-size: 11px; font-family: var(--mono); background: var(--surface2); border: 1px solid var(--border); }
        .etl-mapper-title { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; }
        .etl-mapper-row   { display: flex; align-items: center; gap: 8px; padding: 3px 0; border-bottom: 1px solid var(--border); }
        .etl-mapper-row:last-child { border: none; }
        .etl-mapper-col  { flex: 1; color: var(--text-muted); font-size: 10px; }
        .etl-mapper-ok   { color: #4ade80; font-size: 11px; }
        .etl-mapper-miss { color: #f87171; font-size: 11px; }

        .etl-btn {
          width: 100%; height: 36px; border-radius: 8px; border: none;
          font-size: 13px; font-weight: 500; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          transition: all 0.15s;
        }
        .etl-btn.blue          { background: var(--primary-color); color: white; }
        .etl-btn.blue:hover    { background: #1d4ed8; }
        .etl-btn.blue:disabled { opacity: 0.45; cursor: not-allowed; }

        .etl-result { margin-top: 10px; padding: 8px 12px; border-radius: 8px; font-size: 12px; font-family: var(--mono); }
        .etl-result.ok  { background: rgba(34,197,94,0.08); color: #4ade80; border: 1px solid rgba(34,197,94,0.2); }
        .etl-result.err { background: rgba(239,68,68,0.08); color: #f87171; border: 1px solid rgba(239,68,68,0.2); }

        .etl-jobs-list { display: flex; flex-direction: column; gap: 10px; }

        .etl-job-row {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 14px 16px;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 10px;
          transition: opacity 0.2s;
        }
        .etl-job-row.locked { opacity: 0.5; }

        .etl-job-info { flex: 1; min-width: 0; }
        .etl-job-name { font-size: 13px; font-weight: 500; color: var(--text-main); margin-bottom: 2px; }
        .etl-job-desc { font-size: 11px; color: var(--text-muted); font-family: var(--mono); }
        .etl-job-lock-hint { font-size: 10px; color: #f87171; font-family: var(--mono); margin-top: 4px; display: flex; align-items: center; gap: 4px; }

        .etl-job-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

        .etl-run-btn {
          height: 30px; padding: 0 14px; border-radius: 7px;
          background: var(--primary-color); color: white; border: none;
          font-size: 12px; font-weight: 500; cursor: pointer;
          display: flex; align-items: center; gap: 5px; transition: all 0.15s;
        }
        .etl-run-btn:hover    { background: #1d4ed8; }
        .etl-run-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        .etl-log {
          background: var(--surface2); border: 1px solid var(--border);
          border-radius: 12px; padding: 16px; margin-top: 20px;
          font-family: var(--mono); font-size: 12px;
          max-height: 220px; overflow-y: auto;
        }
        .etl-log-title { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; }
        .etl-log-row   { display: flex; gap: 10px; padding: 3px 0; border-bottom: 1px solid var(--border); }
        .etl-log-row:last-child { border: none; }
        .etl-log-time { color: var(--text-muted); flex-shrink: 0; }
        .etl-log-ok   { color: #4ade80; }
        .etl-log-err  { color: #f87171; }
        .etl-log-info { color: #93c5fd; }

        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }

        @media (max-width: 640px) { .etl-grid { grid-template-columns: 1fr; } }
      `}</style>

      <h1 className="etl-title">ETL Jobs</h1>
      <p className="etl-sub">Upload new data and run pipeline stages</p>

      <div className="etl-grid">

        {/* ── Upload card ── */}
        <div className="etl-card">
          <div className="etl-card-title">Upload CSV</div>
          <div className="etl-card-desc">Drop a new year's accident CSV file</div>

          <div
            className={`etl-upload-zone ${colErrors.length > 0 ? "invalid" : colOk ? "valid" : ""}`}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={22} color={colErrors.length > 0 ? "#f87171" : colOk ? "#4ade80" : "#3b82f6"} />
            <span className="etl-upload-label">Click to browse or drag & drop</span>
            <span className="etl-upload-label" style={{ fontSize: 11 }}>.csv files only</span>
            {file && <div className="etl-file-name">{file.name}</div>}
          </div>
          <input
            ref={fileRef} type="file" accept=".csv"
            style={{ display: "none" }} onChange={handleFileChange}
          />

          {/* Column mapper */}
          {file && (
            <div className="etl-mapper">
              <div className="etl-mapper-title">Column mapper — required vs detected</div>
              {REQUIRED_COLUMNS.map(col => {
                const missing = colErrors.includes(col);
                return (
                  <div key={col} className="etl-mapper-row">
                    <span className="etl-mapper-col">{col}</span>
                    <span className={missing ? "etl-mapper-miss" : "etl-mapper-ok"}>
                      {missing ? "✗ missing" : "✓ found"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Column error summary */}
          {colErrors.length > 0 && (
            <div className="etl-col-check err">
              <div className="etl-col-check-title">
                ✗ {colErrors.length} required column{colErrors.length > 1 ? "s" : ""} missing — upload blocked
              </div>
              <div style={{ color: "#94a3b8", marginTop: 2 }}>
                This CSV does not match the US Accidents dataset schema.
              </div>
              <div className="etl-col-list">
                {colErrors.map(c => <span key={c} className="etl-col-tag">{c}</span>)}
              </div>
            </div>
          )}

          {colOk && file && (
            <div className="etl-col-check ok">
              <div className="etl-col-check-title">✓ All {REQUIRED_COLUMNS.length} required columns detected</div>
              <div style={{ color: "#86efac" }}>Schema validated — ready to upload.</div>
            </div>
          )}

          <button
            className="etl-btn blue"
            disabled={!file || uploadStatus === "loading" || colErrors.length > 0}
            onClick={handleUpload}
          >
            {uploadStatus === "loading"
              ? <><Loader size={13} className="spin" /> Uploading…</>
              : <><Upload size={13} /> Upload file</>}
          </button>

          {uploadMsg && (
            <div className={`etl-result ${uploadStatus === "success" ? "ok" : "err"}`}>
              {uploadMsg}
            </div>
          )}
        </div>

        {/* ── Pipeline jobs card ── */}
        <div className="etl-card">
          <div className="etl-card-title">Pipeline stages</div>
          <div className="etl-card-desc">Run in order: Load Raw → Build Clean</div>
          <div className="etl-jobs-list">
            {JOBS.map((job, idx) => {
              const isLocked =
                (job.id === "load-raw"    && uploadStatus !== "success") ||
                (job.id === "build-clean" && !rawLoaded);
              const isLoading = jobStatus[job.id] === "loading";
              const result    = jobResult[job.id];

              return (
                <div key={job.id} className={`etl-job-row ${isLocked ? "locked" : ""}`}>
                  <div className="etl-job-info">
                    <div className="etl-job-name">{idx + 1}. {job.label}</div>
                    <div className="etl-job-desc">{job.description}</div>

                    {isLocked && (
                      <div className="etl-job-lock-hint">
                        <Lock size={10} />
                        {job.id === "load-raw"
                          ? "Upload a valid CSV file first"
                          : "Run \"Load Raw\" first"}
                      </div>
                    )}

                    {result && (
                      <div
                        className={`etl-result ${jobStatus[job.id] === "success" ? "ok" : "err"}`}
                        style={{ marginTop: 6 }}
                      >
                        {result.message}
                        {result.rows_inserted != null && ` · ${result.rows_inserted.toLocaleString()} rows`}
                        {result.missing && result.missing.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            Missing columns: {result.missing.join(", ")}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="etl-job-actions">
                    {statusIcon(jobStatus[job.id] ?? "idle")}
                    <button
                      className="etl-run-btn"
                      disabled={isLocked || isLoading}
                      onClick={() => runJob(job)}
                      title={
                        isLocked
                          ? job.id === "load-raw"
                            ? "Upload a CSV file first"
                            : "Complete Load Raw first"
                          : `Run ${job.label}`
                      }
                    >
                      {isLoading
                        ? <><Loader size={11} className="spin" /> Running…</>
                        : isLocked
                          ? <><Lock size={11} /> Locked</>
                          : <><Play size={11} /> Run</>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Activity log ── */}
      <div className="etl-log">
        <div className="etl-log-title">Activity log</div>
        {log.length === 0 && <div style={{ color: "var(--text-muted)" }}>No activity yet…</div>}
        {log.map((l, i) => (
          <div key={i} className="etl-log-row">
            <span className="etl-log-time">{l.time}</span>
            <span className={`etl-log-${l.type}`}>{l.text}</span>
          </div>
        ))}
      </div>
    </>
  );
}