"""
build_datamart.py  —  ETL Step 3
=================================
Reads from accidents_clean and populates the star-schema
"""

import calendar
import os
import time
import traceback
from datetime import datetime
from typing import Optional

import pandas as pd
from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import text

from .. import db
from ..models import AccidentClean, ETLJob
from ..models import DimTime, DimLocation, DimWeather, DimRoad, FactAccident
from .job_manager import JobManager, JobManagerError

datamart_bp = Blueprint("datamart", __name__, url_prefix="/etl")

CHUNK_SIZE = 5_000
FLUSH_SIZE = 2_000


# ── Bucket helpers ─────────────────────────────────────────────────────────────

US_REGIONS: dict[str, set[str]] = {
    "Northeast": {"CT","ME","MA","NH","NJ","NY","PA","RI","VT"},
    "South":     {"AL","AR","DE","FL","GA","KY","LA","MD","MS",
                  "NC","OK","SC","TN","TX","VA","WV","DC"},
    "Midwest":   {"IL","IN","IA","KS","MI","MN","MO","NE","ND","OH","SD","WI"},
    "West":      {"AK","AZ","CA","CO","HI","ID","MT","NV","NM","OR","UT","WA","WY"},
}


def _us_region(state: Optional[str]) -> str:
    if not state:
        return "Unknown"
    s = state.strip().upper()
    for region, states in US_REGIONS.items():
        if s in states:
            return region
    return "Other"


def _temp_bucket(c: Optional[float]) -> str:
    if c is None:  return "Unknown"
    if c < 0:      return "Freezing"
    if c < 10:     return "Cold"
    if c < 20:     return "Cool"
    if c < 30:     return "Warm"
    return "Hot"


def _visibility_bucket(km: Optional[float]) -> str:
    if km is None: return "Unknown"
    if km < 1.6:   return "Poor"
    if km < 8.0:   return "Moderate"
    return "Good"


def _to_bool(val) -> bool:
    if val is None: return False
    if isinstance(val, bool): return val
    return str(val).strip().lower() in ("true", "1", "yes", "t")


def _season(month: int) -> str:
    return {12:"Winter",1:"Winter",2:"Winter",
            3:"Spring",4:"Spring",5:"Spring",
            6:"Summer",7:"Summer",8:"Summer",
            9:"Fall",10:"Fall",11:"Fall"}.get(month, "Unknown")


def _time_of_day(hour: int) -> str:
    if 5  <= hour < 12: return "Morning"
    if 12 <= hour < 17: return "Afternoon"
    if 17 <= hour < 21: return "Evening"
    return "Night"


def _csv_path() -> str:
    base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return os.path.join(base, "data", "us_accidents_sample.csv")


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
    error_message: Optional[str] = None,
    duration_seconds: float = 0.0,
) -> None:
    try:
        job.status           = status
        job.rows_processed   = rows_processed
        job.rows_inserted    = rows_inserted
        job.rows_skipped     = rows_skipped
        job.error_message    = error_message
        job.duration_seconds = round(duration_seconds, 2)
        job.last_run_at      = datetime.utcnow()
        job.completed_at     = datetime.utcnow()
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        print(f"[datamart] Warning: could not update job row: {exc}")


# ── Road flags loader ──────────────────────────────────────────────────────────

ROAD_COLS = [
    "Amenity","Bump","Crossing","Give_Way","Junction",
    "No_Exit","Railway","Roundabout","Station","Stop",
    "Traffic_Calming","Traffic_Signal","Turning_Loop",
]


def _load_road_flags(csv_path: str) -> dict[str, dict[str, bool]]:
    flags: dict[str, dict[str, bool]] = {}

    if not os.path.exists(csv_path):
        print("[datamart] CSV not found — road flags default to False")
        return flags

    try:
        sample = pd.read_csv(csv_path, nrows=1)
        available = [c for c in ROAD_COLS if c in sample.columns]

        if not available:
            print("[datamart] No road feature columns in CSV — defaults to False")
            return flags

        usecols = ["ID"] + available
        print(f"[datamart] Loading road flags: {available}")

        for chunk in pd.read_csv(
            csv_path,
            usecols=usecols,
            chunksize=50_000,
            on_bad_lines="skip",
        ):
            for row in chunk.itertuples(index=False):
                flags[str(row.ID)] = {
                    col: _to_bool(getattr(row, col, False))
                    for col in available
                }

        print(f"[datamart] Road flags loaded for {len(flags):,} accidents")
    except Exception as exc:
        print(f"[datamart] Warning: road flag loading failed: {exc} — continuing with defaults")

    return flags


# ── Step 3 — Build Datamart ────────────────────────────────────────────────────

@datamart_bp.route("/build-datamart", methods=["POST"])
@jwt_required()
def build_datamart():
    t0 = time.time()
    etl_job = _create_etl_job("build-datamart")

    total_facts   = 0
    total_skipped = 0
    error_msg: Optional[str] = None
    status = "failed"

    try:
        JobManager.register(etl_job.id)
    except JobManagerError as exc:
        _finish_etl_job(etl_job, status="failed", error_message=str(exc))
        return jsonify({"message": str(exc)}), 409

    try:
        clean_count = db.session.query(AccidentClean).count()
        if clean_count == 0:
            raise ValueError("accidents_clean is empty — run /etl/build-clean first.")

        print(f"[datamart] Starting build from {clean_count:,} clean rows")

        # Compter les accidents uniques
        unique_count = db.session.query(AccidentClean.accident_id).distinct().count()
        print(f"[datamart] {unique_count:,} unique accidents to process")

        # Vider le datamart existant
        for tbl in ("fact_accident", "dim_time", "dim_location", "dim_weather", "dim_road"):
            db.session.execute(text(f"DELETE FROM {tbl}"))
        db.session.commit()
        print("[datamart] Cleared existing datamart tables")

        road_flags = _load_road_flags(_csv_path())

        time_cache:     dict[tuple, int] = {}
        location_cache: dict[tuple, int] = {}
        weather_cache:  dict[tuple, int] = {}
        road_cache:     dict[tuple, int] = {}
        seen_accidents: set[str] = set()

        fact_batch: list[FactAccident] = []
        offset = 0
        processing_counter = 0

        while True:
            if JobManager.is_cancelled(etl_job.id):
                print(f"[datamart] Cancellation detected at offset {offset}")
                status = "cancelled"
                break

            rows = (
                db.session.query(AccidentClean)
                .order_by(AccidentClean.id)
                .offset(offset)
                .limit(CHUNK_SIZE)
                .all()
            )
            if not rows:
                break

            print(f"[datamart] Offset {offset:,} → {offset + len(rows):,}")

            for row in rows:
                processing_counter += 1

                if processing_counter % 1000 == 0 and JobManager.is_cancelled(etl_job.id):
                    print(f"[datamart] Cancellation detected at row {processing_counter}")
                    status = "cancelled"
                    break

                if row.start_time is None or row.severity is None:
                    total_skipped += 1
                    continue

                aid = str(row.accident_id) if row.accident_id else None
                if not aid or aid in seen_accidents:
                    total_skipped += 1
                    continue
                seen_accidents.add(aid)

                dt: datetime = row.start_time
                dow = dt.weekday()

                t_key = (dt.year, dt.month, dt.day, dt.hour, dt.minute)
                if t_key not in time_cache:
                    dim_t = DimTime(
                        year         = dt.year,
                        month        = dt.month,
                        day          = dt.day,
                        hour         = dt.hour,
                        day_of_week  = dow,
                        week_of_year = dt.isocalendar()[1],
                        season       = row.season or _season(dt.month),
                        time_of_day  = row.time_of_day or _time_of_day(dt.hour),
                        is_weekend   = dow >= 5,
                        month_name   = calendar.month_name[dt.month],
                        day_name     = calendar.day_name[dow],
                    )
                    db.session.add(dim_t)
                    db.session.flush()
                    time_cache[t_key] = dim_t.time_id

                loc_key = (
                    (row.city or "").strip().lower(),
                    (row.state or "").strip().upper(),
                    round(row.latitude or 0.0, 6),
                    round(row.longitude or 0.0, 6),
                )
                if loc_key not in location_cache:
                    dim_l = DimLocation(
                        city      = row.city,
                        state     = row.state,
                        latitude  = row.latitude,
                        longitude = row.longitude,
                        us_region = _us_region(row.state),
                    )
                    db.session.add(dim_l)
                    db.session.flush()
                    location_cache[loc_key] = dim_l.location_id

                wc = (row.weather_condition or "Unknown").strip()
                w_key = (
                    wc.lower(),
                    round(row.temperature_c or 0.0, 1),
                    round(row.visibility_km or 0.0, 1),
                )
                if w_key not in weather_cache:
                    dim_w = DimWeather(
                        weather_condition = wc,
                        temperature_c    = row.temperature_c,
                        visibility_km    = row.visibility_km,
                        temp_bucket      = _temp_bucket(row.temperature_c),
                        visibility_bucket= _visibility_bucket(row.visibility_km),
                    )
                    db.session.add(dim_w)
                    db.session.flush()
                    weather_cache[w_key] = dim_w.weather_id

                flags = road_flags.get(aid, {})
                amenity    = flags.get("Amenity",         False)
                bump       = flags.get("Bump",            False)
                crossing   = flags.get("Crossing",        False)
                give_way   = flags.get("Give_Way",        False)
                junction   = flags.get("Junction",        False)
                no_exit    = flags.get("No_Exit",         False)
                railway    = flags.get("Railway",         False)
                roundabout = flags.get("Roundabout",      False)
                station    = flags.get("Station",         False)
                stop       = flags.get("Stop",            False)
                tc         = flags.get("Traffic_Calming", False)
                ts         = flags.get("Traffic_Signal",  False)
                tl         = flags.get("Turning_Loop",    False)

                r_key = (amenity,bump,crossing,give_way,junction,
                         no_exit,railway,roundabout,station,stop,tc,ts,tl)
                if r_key not in road_cache:
                    dim_r = DimRoad(
                        amenity         = amenity,
                        bump            = bump,
                        crossing        = crossing,
                        give_way        = give_way,
                        junction        = junction,
                        no_exit         = no_exit,
                        railway         = railway,
                        roundabout      = roundabout,
                        station         = station,
                        stop            = stop,
                        traffic_calming = tc,
                        traffic_signal  = ts,
                        turning_loop    = tl,
                        feature_count   = sum(r_key),
                    )
                    db.session.add(dim_r)
                    db.session.flush()
                    road_cache[r_key] = dim_r.road_id

                fact_batch.append(FactAccident(
                    accident_id   = aid,
                    time_id       = time_cache[t_key],
                    location_id   = location_cache[loc_key],
                    weather_id    = weather_cache[w_key],
                    road_id       = road_cache[r_key],
                    severity      = row.severity,
                    severity_label= row.severity_label,
                    duration_min  = row.duration_min,
                    start_time    = row.start_time,
                    end_time      = row.end_time,
                ))

                if len(fact_batch) >= FLUSH_SIZE:
                    db.session.bulk_save_objects(fact_batch)
                    db.session.commit()
                    total_facts += len(fact_batch)
                    fact_batch = []
                    print(f"[datamart] Flushed → total facts: {total_facts:,}")

            if status == "cancelled":
                break

            offset += CHUNK_SIZE
            db.session.commit()

        if fact_batch:
            db.session.bulk_save_objects(fact_batch)
            db.session.commit()
            total_facts += len(fact_batch)

        if status != "cancelled":
            status = "success"

        elapsed = round(time.time() - t0, 2)
        dim_stats = {
            "dim_time":      len(time_cache),
            "dim_location":  len(location_cache),
            "dim_weather":   len(weather_cache),
            "dim_road":      len(road_cache),
            "fact_accident": total_facts,
        }
        print(f"[datamart] Done in {elapsed}s — {total_facts:,} facts, {total_skipped} skipped")

        return jsonify({
            "message":          "Datamart built successfully.",
            "rows_inserted":    total_facts,
            "rows_skipped":     total_skipped,
            "rows_processed":   total_facts + total_skipped,
            "duration_seconds": elapsed,
            "dimension_counts": dim_stats,
        }), 201

    except ValueError as exc:
        error_msg = str(exc)
        db.session.rollback()
        return jsonify({"message": error_msg}), 422
    except Exception as exc:
        error_msg = str(exc)
        traceback.print_exc()
        db.session.rollback()
        return jsonify({"message": "Datamart build failed.", "detail": error_msg}), 500
    finally:
        JobManager.unregister(etl_job.id)
        _finish_etl_job(
            etl_job,
            status=status,
            rows_processed=total_facts + total_skipped,
            rows_inserted=total_facts,
            rows_skipped=total_skipped,
            error_message=error_msg,
            duration_seconds=time.time() - t0,
        )