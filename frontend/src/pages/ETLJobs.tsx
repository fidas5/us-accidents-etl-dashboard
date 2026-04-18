import React, { useState, useRef } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { Upload, Play, CheckCircle2, AlertCircle, Loader } from "lucide-react";

type JobStatus = "idle" | "loading" | "success" | "error";

interface JobResult {
  message: string;
  rows_inserted?: number;
  detail?: string;
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

export default function ETLPage() {
  const { token } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [jobStatus, setJobStatus] = useState<Record<string, JobStatus>>({});
  const [jobResult, setJobResult] = useState<Record<string, JobResult>>({});
  const [uploadStatus, setUploadStatus] = useState<JobStatus>("idle");
  const [uploadMsg, setUploadMsg] = useState<string>("");
  const [log, setLog] = useState<{ time: string; text: string; type: "ok" | "err" | "info" }[]>([]);

  const addLog = (text: string, type: "ok" | "err" | "info" = "info") => {
    const time = new Date().toLocaleTimeString();
    setLog(l => [{ time, text, type }, ...l].slice(0, 50));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f) addLog(`File selected: ${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)`, "info");
  };

  const handleUpload = async () => {
    if (!file || !token) return;
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
      addLog(`${job.label} done — ${res.data.rows_inserted ?? ""} rows inserted`, "ok");
    } catch (e: any) {
      setJobStatus(s => ({ ...s, [job.id]: "error" }));
      const msg = e.response?.data?.message ?? "Job failed";
      setJobResult(r => ({ ...r, [job.id]: { message: msg, detail: e.response?.data?.detail } }));
      addLog(`${job.label} error: ${msg}`, "err");
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
        .etl-title  { font-size:22px; font-weight:500; color:#e5e7eb; margin:0 0 4px; }
        .etl-sub    { font-size:12px; color:#6b7280; font-family:ui-monospace,monospace; margin:0 0 28px; }
        .etl-grid   { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px; }
        .etl-card   {
          background:rgba(15,23,42,0.7); border:1px solid rgba(30,58,138,0.25);
          border-radius:12px; padding:20px;
        }
        .etl-card-title { font-size:13px; font-weight:500; color:#93c5fd; margin:0 0 4px; text-transform:uppercase; letter-spacing:0.06em; }
        .etl-card-desc  { font-size:12px; color:#6b7280; font-family:ui-monospace,monospace; margin:0 0 16px; }
        .etl-upload-zone {
          border:1px dashed rgba(59,130,246,0.3); border-radius:10px;
          padding:24px; text-align:center; cursor:pointer;
          transition:all 0.2s; margin-bottom:12px;
        }
        .etl-upload-zone:hover { border-color:rgba(59,130,246,0.6); background:rgba(59,130,246,0.04); }
        .etl-upload-label { font-size:13px; color:#6b7280; margin-top:8px; display:block; }
        .etl-file-name { font-size:12px; color:#93c5fd; font-family:ui-monospace,monospace; margin-top:4px; }
        .etl-btn {
          width:100%; height:36px; border-radius:8px; border:none;
          font-size:13px; font-weight:500; cursor:pointer; display:flex;
          align-items:center; justify-content:center; gap:6px; transition:all 0.15s;
        }
        .etl-btn.blue  { background:#3b82f6; color:white; }
        .etl-btn.blue:hover  { background:#2563eb; }
        .etl-btn.blue:disabled  { opacity:0.45; cursor:not-allowed; }
        .etl-btn.ghost { background:transparent; color:#9ca3af; border:1px solid rgba(30,58,138,0.3); }
        .etl-btn.ghost:hover { background:rgba(255,255,255,0.04); color:#e5e7eb; }
        .etl-btn.ghost:disabled { opacity:0.45; cursor:not-allowed; }
        .etl-result {
          margin-top:10px; padding:8px 12px; border-radius:8px; font-size:12px;
          font-family:ui-monospace,monospace;
        }
        .etl-result.ok  { background:rgba(34,197,94,0.08); color:#4ade80; border:1px solid rgba(34,197,94,0.2); }
        .etl-result.err { background:rgba(239,68,68,0.08); color:#f87171; border:1px solid rgba(239,68,68,0.2); }
        .etl-jobs-list  { display:flex; flex-direction:column; gap:10px; }
        .etl-job-row {
          display:flex; align-items:center; justify-content:space-between; gap:12px;
          padding:14px 16px; background:rgba(7,14,31,0.5);
          border:1px solid rgba(30,58,138,0.2); border-radius:10px;
        }
        .etl-job-info { flex:1; min-width:0; }
        .etl-job-name { font-size:13px; font-weight:500; color:#e5e7eb; margin-bottom:2px; }
        .etl-job-desc { font-size:11px; color:#6b7280; font-family:ui-monospace,monospace; }
        .etl-job-actions { display:flex; align-items:center; gap:8px; flex-shrink:0; }
        .etl-run-btn {
          height:30px; padding:0 14px; border-radius:7px;
          background:#3b82f6; color:white; border:none;
          font-size:12px; font-weight:500; cursor:pointer; display:flex;
          align-items:center; gap:5px; transition:all 0.15s;
        }
        .etl-run-btn:hover { background:#2563eb; }
        .etl-run-btn:disabled { opacity:0.45; cursor:not-allowed; }
        .etl-log {
          background:rgba(7,14,31,0.8); border:1px solid rgba(30,58,138,0.2);
          border-radius:12px; padding:16px; margin-top:20px;
          font-family:ui-monospace,monospace; font-size:12px; max-height:220px; overflow-y:auto;
        }
        .etl-log-title { font-size:11px; color:#6b7280; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:10px; }
        .etl-log-row { display:flex; gap:10px; padding:3px 0; border-bottom:1px solid rgba(30,58,138,0.1); }
        .etl-log-row:last-child { border:none; }
        .etl-log-time { color:#4b5563; flex-shrink:0; }
        .etl-log-ok   { color:#4ade80; }
        .etl-log-err  { color:#f87171; }
        .etl-log-info { color:#93c5fd; }
        @keyframes spin { to { transform:rotate(360deg); } }
        .spin { animation:spin 1s linear infinite; }
      `}</style>

      <h1 className="etl-title">ETL Jobs</h1>
      <p className="etl-sub">Upload new data and run pipeline stages</p>

      <div className="etl-grid">
        {/* Upload card */}
        <div className="etl-card">
          <div className="etl-card-title">Upload CSV</div>
          <div className="etl-card-desc">Drop a new year's accident CSV file</div>
          <div className="etl-upload-zone" onClick={() => fileRef.current?.click()}>
            <Upload size={22} color="#3b82f6" />
            <span className="etl-upload-label">Click to browse or drag & drop</span>
            <span className="etl-upload-label" style={{ fontSize: 11 }}>.csv files only</span>
            {file && <div className="etl-file-name">{file.name}</div>}
          </div>
          <input
            ref={fileRef} type="file" accept=".csv"
            style={{ display: "none" }} onChange={handleFileChange}
          />
          <button
            className="etl-btn blue"
            disabled={!file || uploadStatus === "loading"}
            onClick={handleUpload}
          >
            {uploadStatus === "loading" ? <><Loader size={13} className="spin" /> Uploading…</> : <><Upload size={13} /> Upload file</>}
          </button>
          {uploadMsg && (
            <div className={`etl-result ${uploadStatus === "success" ? "ok" : "err"}`}>
              {uploadMsg}
            </div>
          )}
        </div>

        {/* Pipeline jobs card */}
        <div className="etl-card">
          <div className="etl-card-title">Pipeline stages</div>
          <div className="etl-card-desc">Run in order: Load Raw → Build Clean</div>
          <div className="etl-jobs-list">
            {JOBS.map((job, idx) => (
              <div key={job.id} className="etl-job-row">
                <div className="etl-job-info">
                  <div className="etl-job-name">{idx + 1}. {job.label}</div>
                  <div className="etl-job-desc">{job.description}</div>
                  {jobResult[job.id] && (
                    <div className={`etl-result ${jobStatus[job.id] === "success" ? "ok" : "err"}`}
                      style={{ marginTop: 6 }}>
                      {jobResult[job.id].message}
                      {jobResult[job.id].rows_inserted != null && ` · ${jobResult[job.id].rows_inserted} rows`}
                    </div>
                  )}
                </div>
                <div className="etl-job-actions">
                  {statusIcon(jobStatus[job.id] ?? "idle")}
                  <button
                    className="etl-run-btn"
                    disabled={jobStatus[job.id] === "loading"}
                    onClick={() => runJob(job)}
                  >
                    <Play size={11} /> Run
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Activity log */}
      <div className="etl-log">
        <div className="etl-log-title">Activity log</div>
        {log.length === 0 && <div style={{ color: "#4b5563" }}>No activity yet…</div>}
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