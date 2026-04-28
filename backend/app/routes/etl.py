"""
etl.py  — Flask blueprint for ETL steps 0-2
"""

import os
import time
import traceback
from datetime import datetime, timedelta

import pandas as pd
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import inspect as sa_inspect, text

from .. import db
from ..models import AccidentRaw, AccidentClean, ETLJob
from .job_manager import JobManager, JobManagerError

etl_bp = Blueprint("etl", __name__, url_prefix="/etl")

# ── Configuration ──────────────────────────────────────────────────────────────

BATCH_SIZE = 50_000
DB_BATCH = 5_000

_analysis_cache: dict[str, dict] = {}
_cache_ts: dict[str, float] = {}
CACHE_TTL = 3_600


# ── Helpers ────────────────────────────────────────────────────────────────────

def _csv_path() -> str:
    base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return os.path.join(base, "data", "us_accidents_sample.csv")


def _safe_float(val) -> float | None:
    try:
        f = float(val)
        return None if pd.isna(f) else f
    except (TypeError, ValueError):
        return None


def _safe_int(val) -> int | None:
    try:
        f = float(val)
        return None if pd.isna(f) else int(f)
    except (TypeError, ValueError):
        return None


def _f_to_c(f_val: float | None) -> float | None:
    return None if f_val is None else round((f_val - 32) * 5.0 / 9.0, 2)


def _mi_to_km(mi: float | None) -> float | None:
    return None if mi is None else round(mi * 1.60934, 2)


def _season(month: int) -> str:
    return {
        12: "Winter", 1: "Winter", 2: "Winter",
        3: "Spring", 4: "Spring", 5: "Spring",
        6: "Summer", 7: "Summer", 8: "Summer",
        9: "Fall", 10: "Fall", 11: "Fall",
    }.get(month, "Unknown")


def _time_of_day(hour: int) -> str:
    if 5 <= hour < 12: return "Morning"
    if 12 <= hour < 17: return "Afternoon"
    if 17 <= hour < 21: return "Evening"
    return "Night"


def _severity_label(sev: int) -> str:
    return {1: "Low", 2: "Moderate", 3: "High", 4: "Critical"}.get(sev, "Unknown")


def _parse_dt(raw: str) -> datetime | None:
    if not raw or str(raw).strip() in ("NaT", "None", "nan", ""):
        return None
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "").strip())
    except (ValueError, TypeError):
        return None


def _cache_key(path: str) -> str:
    mtime = os.path.getmtime(path)
    return f"{path}::{mtime}"


def _get_cached_analysis(path: str) -> dict | None:
    key = _cache_key(path)
    if key in _analysis_cache:
        if time.time() - _cache_ts.get(key, 0) < CACHE_TTL:
            return _analysis_cache[key]
    return None


def _set_cached_analysis(path: str, result: dict) -> None:
    key = _cache_key(path)
    _analysis_cache[key] = result
    _cache_ts[key] = time.time()


def _invalidate_cache() -> None:
    _analysis_cache.clear()
    _cache_ts.clear()


COLS_MAP = {
    "ID": "accident_id",
    "Start_Time": "start_time_raw",
    "End_Time": "end_time_raw",
    "City": "city_raw",
    "State": "state_raw",
    "Severity": "severity_raw",
    "Temperature(F)": "temperature_raw",
    "Visibility(mi)": "visibility_raw",
    "Weather_Condition": "weather_condition_raw",
    "Start_Lat": "latitude_raw",
    "Start_Lng": "longitude_raw",
}


def _create_etl_job(name: str) -> ETLJob:
    job = ETLJob(
        name=name,
        job_type="manuel",
        status="pending",
        started_at=datetime.utcnow(),
    )
    db.session.add(job)
    db.session.commit()
    return job


def _finish_etl_job(
    job: ETLJob,
    *,
    status: str,
    rows_processed: int = 0,
    rows_inserted: int = 0,
    rows_skipped: int = 0,
    error_message: str | None = None,
    duration_seconds: float = 0.0,
) -> None:
    try:
        job.status = status
        job.rows_processed = rows_processed
        job.rows_inserted = rows_inserted
        job.rows_skipped = rows_skipped
        job.error_message = error_message
        job.duration_seconds = round(duration_seconds, 2)
        job.last_run_at = datetime.utcnow()
        job.completed_at = datetime.utcnow()
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        print(f"[ETL] Warning: could not update job row: {exc}")


# ── Step 0 — Analyze CSV ───────────────────────────────────────────────────────

@etl_bp.route("/analyze-csv", methods=["GET"])
@jwt_required()
def analyze_csv():
    path = _csv_path()

    if not os.path.exists(path):
        return jsonify({"message": "CSV file not found. Please upload it first.", "csv_path": path}), 404

    cached = _get_cached_analysis(path)
    if cached:
        return jsonify({**cached, "from_cache": True}), 200

    try:
        years_count: dict[int, int] = {}
        total_rows = 0
        valid_rows = 0

        for chunk in pd.read_csv(path, usecols=["Start_Time"], chunksize=50_000, on_bad_lines="skip"):
            total_rows += len(chunk)
            parsed = pd.to_datetime(chunk["Start_Time"], errors="coerce")
            years = parsed.dt.year.dropna().astype(int)
            valid_rows += len(years)
            for y in years:
                years_count[int(y)] = years_count.get(int(y), 0) + 1

        if not years_count:
            return jsonify({"message": "No valid dates found in the Start_Time column."}), 422

        result = {
            "available_years": sorted(years_count.keys()),
            "year_counts": {str(k): v for k, v in sorted(years_count.items())},
            "total_rows_scanned": total_rows,
            "valid_dates_found": valid_rows,
            "from_cache": False,
        }
        _set_cached_analysis(path, result)
        return jsonify(result), 200

    except pd.errors.ParserError as exc:
        return jsonify({"message": "CSV parsing error.", "detail": str(exc)}), 422
    except MemoryError:
        return jsonify({"message": "Server ran out of memory while scanning CSV."}), 500
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"message": "Unexpected error during CSV analysis.", "detail": str(exc)}), 500


# ── Step 0.5 — Upload CSV ─────────────────────────────────────────────────────

@etl_bp.route("/upload-csv", methods=["POST"])
@jwt_required()
def upload_csv():
    if "file" not in request.files:
        return jsonify({"message": "No file field in request."}), 400

    f = request.files["file"]

    if not f.filename:
        return jsonify({"message": "No file selected."}), 400

    if not f.filename.lower().endswith(".csv"):
        return jsonify({"message": "Only .csv files are accepted."}), 415

    save_path = _csv_path()

    try:
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        f.save(save_path)
    except OSError as exc:
        return jsonify({"message": "Could not save file to disk.", "detail": str(exc)}), 500

    if not os.path.exists(save_path):
        return jsonify({"message": "File was not saved correctly."}), 500

    _invalidate_cache()

    size_mb = os.path.getsize(save_path) / 1_048_576
    return jsonify({"message": f"{f.filename} uploaded successfully ({size_mb:.1f} MB).", "size_mb": round(size_mb, 2)}), 200


# ── Step 1 — Load Raw (INCREMENTAL) ────────────────────────────────────────────

@etl_bp.route("/load-raw", methods=["POST"])
@jwt_required()
def load_raw():
    t0 = time.time()
    etl_job = _create_etl_job("load-raw")

    rows_inserted = 0
    rows_processed = 0
    rows_skipped = 0
    error_msg = None
    status = "failed"

    try:
        JobManager.register(etl_job.id, "load-raw")
    except JobManagerError as exc:
        _finish_etl_job(etl_job, status="failed", error_message=str(exc))
        return jsonify({"message": str(exc)}), 409

    try:
        path = _csv_path()
        if not os.path.exists(path):
            raise FileNotFoundError(f"CSV not found at '{path}'. Please upload first.")

        body = request.get_json(silent=True) or {}
        raw_year = body.get("year")
        target_year = int(raw_year) if raw_year and raw_year != "all" else None
        filter_desc = f"year = {target_year}" if target_year else "all years"

        # Charger les IDs existants
        print("[load-raw] Loading existing accident IDs...")
        existing_ids = set()
        result = db.session.execute(text("SELECT accident_id FROM accidents_raw WHERE accident_id IS NOT NULL"))
        for row in result:
            existing_ids.add(row[0])
        print(f"[load-raw] {len(existing_ids):,} existing records found")

        year_stats = {}
        missing_cols_reported = False

        for chunk_idx, chunk in enumerate(pd.read_csv(path, chunksize=BATCH_SIZE, on_bad_lines="skip")):
            if not missing_cols_reported:
                missing = [c for c in COLS_MAP if c not in chunk.columns]
                if missing:
                    raise ValueError(f"Missing required columns: {missing}")
                missing_cols_reported = True

            chunk = chunk[list(COLS_MAP.keys())].rename(columns=COLS_MAP)
            chunk["_dt"] = pd.to_datetime(chunk["start_time_raw"], errors="coerce")
            chunk = chunk.dropna(subset=["_dt"])
            if chunk.empty:
                continue

            chunk["_year"] = chunk["_dt"].dt.year.astype(int)
            if target_year:
                chunk = chunk[chunk["_year"] == target_year]
                if chunk.empty:
                    continue

            for y, cnt in chunk["_year"].value_counts().items():
                year_stats[int(y)] = year_stats.get(int(y), 0) + int(cnt)

            chunk["start_time_raw"] = chunk["_dt"].dt.strftime("%Y-%m-%d %H:%M:%S")
            chunk["end_time_raw"] = pd.to_datetime(chunk["end_time_raw"], errors="coerce").dt.strftime("%Y-%m-%d %H:%M:%S")

            records = []
            for row in chunk.itertuples(index=False):
                rows_processed += 1
                aid = str(row.accident_id) if pd.notna(row.accident_id) else None
                if not aid or aid in existing_ids:
                    rows_skipped += 1
                    continue
                existing_ids.add(aid)

                records.append(AccidentRaw(
                    accident_id=aid,
                    start_time_raw=row.start_time_raw if pd.notna(row.start_time_raw) else None,
                    end_time_raw=row.end_time_raw if pd.notna(row.end_time_raw) else None,
                    city_raw=str(row.city_raw) if pd.notna(row.city_raw) else None,
                    state_raw=str(row.state_raw) if pd.notna(row.state_raw) else None,
                    severity_raw=_safe_int(row.severity_raw),
                    temperature_raw=_safe_float(row.temperature_raw),
                    visibility_raw=_safe_float(row.visibility_raw),
                    weather_condition_raw=str(row.weather_condition_raw) if pd.notna(row.weather_condition_raw) else None,
                    latitude_raw=_safe_float(row.latitude_raw),
                    longitude_raw=_safe_float(row.longitude_raw),
                ))

            if records:
                db.session.bulk_save_objects(records)
                db.session.commit()
                rows_inserted += len(records)
                print(f"[load-raw] Chunk {chunk_idx + 1}: inserted {len(records):,} new")

        status = "success"
        return jsonify({
            "message": f"Raw data appended ({filter_desc})",
            "filter_applied": filter_desc,
            "rows_inserted": rows_inserted,
            "rows_processed": rows_processed,
            "rows_skipped": rows_skipped,
            "year_distribution": year_stats,
        }), 201

    except Exception as exc:
        error_msg = str(exc)
        traceback.print_exc()
        db.session.rollback()
        return jsonify({"message": "Unexpected error during load-raw.", "detail": error_msg}), 500
    finally:
        JobManager.unregister(etl_job.id)
        _finish_etl_job(etl_job, status=status, rows_processed=rows_processed, rows_inserted=rows_inserted, rows_skipped=rows_skipped, error_message=error_msg, duration_seconds=time.time() - t0)


# ── Step 2 — Build Clean (INCREMENTAL AVEC CONTRAINTE UNIQUE) ───────────────────

@etl_bp.route("/build-clean", methods=["POST"])
@jwt_required()
def build_clean():
    t0 = time.time()
    etl_job = _create_etl_job("build-clean")

    rows_inserted = 0
    rows_processed = 0
    rows_skipped = 0
    error_msg = None
    status = "failed"

    try:
        JobManager.register(etl_job.id, "build-clean")
    except JobManagerError as exc:
        _finish_etl_job(etl_job, status="failed", error_message=str(exc))
        return jsonify({"message": str(exc)}), 409

    try:
        raw_count = db.session.query(AccidentRaw).count()
        if raw_count == 0:
            raise ValueError("No raw data found — run /etl/load-raw first.")

        # Charger les IDs existants dans clean
        print("[build-clean] Loading existing clean accident IDs...")
        existing_clean_ids = set()
        result = db.session.execute(text("SELECT accident_id FROM accidents_clean"))
        for row in result:
            existing_clean_ids.add(row[0])
        print(f"[build-clean] {len(existing_clean_ids):,} existing clean records found")

        print("[build-clean] Starting incremental load...")

        offset = 0
        clean_batch = []
        seen_in_run = set()

        while True:
            batch = db.session.query(AccidentRaw).offset(offset).limit(DB_BATCH).all()
            if not batch:
                break

            new_rows = [row for row in batch if row.accident_id not in existing_clean_ids and row.accident_id not in seen_in_run]
            for row in new_rows:
                seen_in_run.add(row.accident_id)

            if new_rows:
                print(f"[build-clean] Batch at offset {offset}: {len(batch)} read, {len(new_rows)} new")

            for row in new_rows:
                rows_processed += 1

                start_dt = _parse_dt(row.start_time_raw)
                if start_dt is None or row.severity_raw is None:
                    rows_skipped += 1
                    continue

                end_dt = _parse_dt(row.end_time_raw)
                duration_min = None
                if end_dt and start_dt:
                    delta = (end_dt - start_dt).total_seconds() / 60
                    duration_min = round(delta, 1) if 0 < delta < 10_000 else None

                clean_batch.append(AccidentClean(
                    accident_id=row.accident_id,
                    start_time=start_dt,
                    end_time=end_dt,
                    severity=row.severity_raw,
                    severity_label=_severity_label(row.severity_raw),
                    city=row.city_raw,
                    state=row.state_raw,
                    temperature_c=_f_to_c(row.temperature_raw),
                    visibility_km=_mi_to_km(row.visibility_raw),
                    weather_condition=row.weather_condition_raw,
                    latitude=row.latitude_raw,
                    longitude=row.longitude_raw,
                    season=_season(start_dt.month),
                    time_of_day=_time_of_day(start_dt.hour),
                    duration_min=duration_min,
                ))

                if len(clean_batch) >= 1000:
                    db.session.bulk_save_objects(clean_batch)
                    db.session.commit()
                    rows_inserted += len(clean_batch)
                    clean_batch = []

            if clean_batch:
                db.session.bulk_save_objects(clean_batch)
                db.session.commit()
                rows_inserted += len(clean_batch)
                clean_batch = []

            offset += DB_BATCH

        # Ajouter contrainte UNIQUE
        try:
            db.session.execute(text("ALTER TABLE accidents_clean ADD CONSTRAINT unique_accident_id_clean UNIQUE (accident_id)"))
            db.session.commit()
            print("[build-clean] ✅ Added UNIQUE constraint")
        except Exception:
            db.session.rollback()
            print("[build-clean] UNIQUE constraint already exists")

        status = "success"
        elapsed = time.time() - t0
        print(f"[build-clean] ✅ Completed in {elapsed:.2f}s - Inserted: {rows_inserted:,}")

        return jsonify({
            "message": "Clean data built successfully.",
            "rows_inserted": rows_inserted,
            "rows_processed": rows_processed,
            "rows_skipped": rows_skipped,
            "duration_seconds": round(elapsed, 2),
        }), 201

    except Exception as exc:
        error_msg = str(exc)
        traceback.print_exc()
        db.session.rollback()
        return jsonify({"message": "Unexpected error during build-clean.", "detail": error_msg}), 500
    finally:
        JobManager.unregister(etl_job.id)
        _finish_etl_job(etl_job, status=status, rows_processed=rows_processed, rows_inserted=rows_inserted, rows_skipped=rows_skipped, error_message=error_msg, duration_seconds=time.time() - t0)


# ── Pipeline Status ────────────────────────────────────────────────────────────

@etl_bp.route("/pipeline-status", methods=["GET"])
@jwt_required()
def pipeline_status():
    from ..models import FactAccident

    path = _csv_path()
    csv_exists = os.path.exists(path)

    try:
        raw_count = db.session.query(AccidentRaw).count() if csv_exists else 0
        clean_count = db.session.query(AccidentClean).count() if raw_count else 0
        fact_count = db.session.query(FactAccident).count() if clean_count else 0
    except Exception as exc:
        return jsonify({"message": "Database error.", "detail": str(exc)}), 500

    def _last_job(name: str):
        j = ETLJob.query.filter_by(name=name).order_by(ETLJob.created_at.desc()).first()
        if not j:
            return None
        return {
            "status": j.status,
            "rows_inserted": j.rows_inserted or 0,
            "completed_at": j.completed_at.isoformat() if j.completed_at else None,
            "duration_seconds": j.duration_seconds or 0,
        }

    missing_dm = max(0, clean_count - fact_count)
    pct_dm = round(fact_count / clean_count * 100, 2) if clean_count else 0

    def _recommended():
        if not csv_exists:
            return "upload"
        if raw_count == 0:
            return "load-raw"
        if clean_count == 0:
            return "build-clean"
        if fact_count != clean_count:
            return "build-datamart"
        return "complete"

    return jsonify({
        "csv_exists": csv_exists,
        "raw": {"exists": raw_count > 0, "count": raw_count, "is_complete": raw_count > 0, "last_job": _last_job("load-raw")},
        "clean": {"exists": clean_count > 0, "count": clean_count, "is_complete": clean_count > 0, "last_job": _last_job("build-clean")},
        "datamart": {"exists": fact_count > 0, "count": fact_count, "expected_count": clean_count, "is_complete": fact_count == clean_count, "missing_records": missing_dm, "completion_percentage": pct_dm, "last_job": _last_job("build-datamart")},
        "recommended_action": _recommended(),
    }), 200


# ── Datamart Status ────────────────────────────────────────────────────────────

@etl_bp.route("/datamart-status", methods=["GET"])
@jwt_required()
def datamart_status():
    from ..models import FactAccident, DimTime, DimLocation, DimWeather, DimRoad

    try:
        return jsonify({
            "dim_time": db.session.query(DimTime).count(),
            "dim_location": db.session.query(DimLocation).count(),
            "dim_weather": db.session.query(DimWeather).count(),
            "dim_road": db.session.query(DimRoad).count(),
            "fact_accident": db.session.query(FactAccident).count(),
        }), 200
    except Exception as exc:
        return jsonify({"message": "Database error.", "detail": str(exc)}), 500


# ── Job History ────────────────────────────────────────────────────────────────

@etl_bp.route("/job-history", methods=["GET"])
@jwt_required()
def get_job_history():
    try:
        jobs = ETLJob.query.order_by(ETLJob.created_at.desc()).limit(50).all()
        return jsonify({
            "total_jobs": len(jobs),
            "jobs": [
                {
                    "id": j.id,
                    "name": j.name,
                    "status": j.status,
                    "rows_processed": j.rows_processed or 0,
                    "rows_inserted": j.rows_inserted or 0,
                    "rows_skipped": j.rows_skipped or 0,
                    "error_message": j.error_message,
                    "duration_seconds": j.duration_seconds or 0,
                    "created_at": j.created_at.isoformat() if j.created_at else None,
                }
                for j in jobs
            ],
        }), 200
    except Exception as exc:
        return jsonify({"message": "Failed to fetch job history.", "detail": str(exc)}), 500


# ── Running Jobs ───────────────────────────────────────────────────────────────

@etl_bp.route("/running-jobs", methods=["GET"])
@jwt_required()
def get_running_jobs():
    live = JobManager.get_running()
    return jsonify({"running_jobs": live}), 200


# ── Debug ──────────────────────────────────────────────────────────────────────

@etl_bp.route("/check-db", methods=["GET"])
@jwt_required()
def check_db():
    inspector = sa_inspect(db.engine)
    tables = inspector.get_table_names()
    result = {"tables": tables}

    for model, key in [(AccidentRaw, "raw_count"), (AccidentClean, "clean_count")]:
        if model.__tablename__ in tables:
            try:
                result[key] = db.session.query(model).count()
            except Exception as exc:
                result[key] = f"Error: {exc}"

    return jsonify(result), 200