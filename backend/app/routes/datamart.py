"""
build_datamart.py  —  ETL Step 3 (INCREMENTAL)
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
    "Northeast": {"CT", "ME", "MA", "NH", "NJ", "NY", "PA", "RI", "VT"},
    "South": {"AL", "AR", "DE", "FL", "GA", "KY", "LA", "MD", "MS",
              "NC", "OK", "SC", "TN", "TX", "VA", "WV", "DC"},
    "Midwest": {"IL", "IN", "IA", "KS", "MI", "MN", "MO", "NE", "ND", "OH", "SD", "WI"},
    "West": {"AK", "AZ", "CA", "CO", "HI", "ID", "MT", "NV", "NM", "OR", "UT", "WA", "WY"},
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
    if c is None:
        return "Unknown"
    if c < 0:
        return "Freezing"
    if c < 10:
        return "Cold"
    if c < 20:
        return "Cool"
    if c < 30:
        return "Warm"
    return "Hot"


def _visibility_bucket(km: Optional[float]) -> str:
    if km is None:
        return "Unknown"
    if km < 1.6:
        return "Poor"
    if km < 8.0:
        return "Moderate"
    return "Good"


def _to_bool(val) -> bool:
    if val is None:
        return False
    if isinstance(val, bool):
        return val
    return str(val).strip().lower() in ("true", "1", "yes", "t")


def _season(month: int) -> str:
    return {12: "Winter", 1: "Winter", 2: "Winter",
            3: "Spring", 4: "Spring", 5: "Spring",
            6: "Summer", 7: "Summer", 8: "Summer",
            9: "Fall", 10: "Fall", 11: "Fall"}.get(month, "Unknown")


def _time_of_day(hour: int) -> str:
    if 5 <= hour < 12:
        return "Morning"
    if 12 <= hour < 17:
        return "Afternoon"
    if 17 <= hour < 21:
        return "Evening"
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
        print(f"[datamart] Warning: could not update job row: {exc}")


# ── Road flags loader ──────────────────────────────────────────────────────────

ROAD_COLS = [
    "Amenity", "Bump", "Crossing", "Give_Way", "Junction",
    "No_Exit", "Railway", "Roundabout", "Station", "Stop",
    "Traffic_Calming", "Traffic_Signal", "Turning_Loop",
]


def _load_road_flags(csv_path: str) -> dict[str, dict[str, bool]]:
    flags = {}

    if not os.path.exists(csv_path):
        print("[datamart] CSV not found — road flags default to False")
        return flags

    try:
        sample = pd.read_csv(csv_path, nrows=1)
        available = [c for c in ROAD_COLS if c in sample.columns]

        if not available:
            print("[datamart] No road feature columns — defaults to False")
            return flags

        usecols = ["ID"] + available
        print(f"[datamart] Loading road flags: {available}")

        for chunk in pd.read_csv(csv_path, usecols=usecols, chunksize=50_000, on_bad_lines="skip"):
            for row in chunk.itertuples(index=False):
                flags[str(row.ID)] = {col: _to_bool(getattr(row, col, False)) for col in available}

        print(f"[datamart] Road flags loaded for {len(flags):,} accidents")
    except Exception as exc:
        print(f"[datamart] Warning: road flag loading failed: {exc}")

    return flags


# ── Step 3 — Build Datamart (INCREMENTAL) ──────────────────────────────────────

@datamart_bp.route("/build-datamart", methods=["POST"])
@jwt_required()
def build_datamart():
    t0 = time.time()
    etl_job = _create_etl_job("build-datamart")
    job_name = "build-datamart"

    total_new_facts = 0
    total_skipped = 0
    new_dim_time = 0
    new_dim_location = 0
    new_dim_weather = 0
    new_dim_road = 0
    error_msg = None
    status = "failed"

    print(f"[{job_name}] ========== INCREMENTAL DATAMART BUILD ==========")

    try:
        JobManager.register(etl_job.id, job_name)

        # =========================================================
        # 1. RÉCUPÉRER LES IDS DÉJÀ DANS LE DATAMART
        # =========================================================
        print(f"[{job_name}] Loading existing accident IDs from fact table...")
        existing_fact_ids = set()
        result = db.session.execute(text("SELECT accident_id FROM fact_accident"))
        for row in result:
            existing_fact_ids.add(row[0])
        print(f"[{job_name}] {len(existing_fact_ids):,} accidents already in datamart")

        # =========================================================
        # 2. TROUVER LES NOUVEAUX ACCIDENTS
        # =========================================================
        print(f"[{job_name}] Finding new accidents from clean data...")
        new_accidents = db.session.query(AccidentClean).filter(
            ~AccidentClean.accident_id.in_(existing_fact_ids)
        ).all()

        print(f"[{job_name}] {len(new_accidents):,} NEW accidents to process")

        if len(new_accidents) == 0:
            print(f"[{job_name}] Datamart is already up to date!")
            return jsonify({
                "message": "Datamart is already up to date.",
                "rows_inserted": 0,
                "rows_processed": 0,
                "rows_skipped": 0,
                "duration_seconds": round(time.time() - t0, 2),
            }), 200

        # =========================================================
        # 3. CHARGER LES CACHES DES DIMENSIONS EXISTANTES
        # =========================================================
        print(f"[{job_name}] Loading dimension caches...")

        time_cache = {}
        for dim in db.session.query(DimTime).all():
            key = (dim.year, dim.month, dim.day, dim.hour)
            time_cache[key] = dim.time_id

        location_cache = {}
        for dim in db.session.query(DimLocation).all():
            key = ((dim.city or "").strip().lower(),
                   (dim.state or "").strip().upper(),
                   round(dim.latitude or 0.0, 6),
                   round(dim.longitude or 0.0, 6))
            location_cache[key] = dim.location_id

        weather_cache = {}
        for dim in db.session.query(DimWeather).all():
            key = ((dim.weather_condition or "Unknown").strip().lower(),
                   round(dim.temperature_c or 0.0, 1),
                   round(dim.visibility_km or 0.0, 1))
            weather_cache[key] = dim.weather_id

        road_cache = {}
        for dim in db.session.query(DimRoad).all():
            key = (dim.amenity, dim.bump, dim.crossing, dim.give_way, dim.junction,
                   dim.no_exit, dim.railway, dim.roundabout, dim.station, dim.stop,
                   dim.traffic_calming, dim.traffic_signal, dim.turning_loop)
            road_cache[key] = dim.road_id

        print(f"[{job_name}] Caches ready: time={len(time_cache)}, loc={len(location_cache)}, weather={len(weather_cache)}, road={len(road_cache)}")

        # =========================================================
        # 4. CHARGER LES ROAD FLAGS
        # =========================================================
        road_flags = _load_road_flags(_csv_path())

        # =========================================================
        # 5. TRAITER LES NOUVEAUX ACCIDENTS
        # =========================================================
        print(f"[{job_name}] Processing {len(new_accidents):,} new accidents...")

        fact_batch = []
        seen_in_run = set()

        for idx, row in enumerate(new_accidents):
            if idx % 5000 == 0 and idx > 0:
                print(f"[{job_name}] Progress: {idx}/{len(new_accidents)} ({total_new_facts} new facts)")

            if row.start_time is None or row.severity is None:
                total_skipped += 1
                continue

            aid = str(row.accident_id)
            if aid in seen_in_run:
                total_skipped += 1
                continue
            seen_in_run.add(aid)

            dt = row.start_time
            dow = dt.weekday()

            # DimTime
            t_key = (dt.year, dt.month, dt.day, dt.hour)
            if t_key not in time_cache:
                dim_t = DimTime(
                    year=dt.year, month=dt.month, day=dt.day, hour=dt.hour,
                    day_of_week=dow, week_of_year=dt.isocalendar()[1],
                    season=row.season or _season(dt.month),
                    time_of_day=row.time_of_day or _time_of_day(dt.hour),
                    is_weekend=dow >= 5,
                    month_name=calendar.month_name[dt.month],
                    day_name=calendar.day_name[dow],
                )
                db.session.add(dim_t)
                db.session.flush()
                time_cache[t_key] = dim_t.time_id
                new_dim_time += 1

            # DimLocation
            loc_key = ((row.city or "").strip().lower(),
                       (row.state or "").strip().upper(),
                       round(row.latitude or 0.0, 6),
                       round(row.longitude or 0.0, 6))
            if loc_key not in location_cache:
                dim_l = DimLocation(
                    city=row.city, state=row.state,
                    latitude=row.latitude, longitude=row.longitude,
                    us_region=_us_region(row.state),
                )
                db.session.add(dim_l)
                db.session.flush()
                location_cache[loc_key] = dim_l.location_id
                new_dim_location += 1

            # DimWeather
            wc = (row.weather_condition or "Unknown").strip()
            w_key = (wc.lower(),
                     round(row.temperature_c or 0.0, 1),
                     round(row.visibility_km or 0.0, 1))
            if w_key not in weather_cache:
                dim_w = DimWeather(
                    weather_condition=wc,
                    temperature_c=row.temperature_c,
                    visibility_km=row.visibility_km,
                    temp_bucket=_temp_bucket(row.temperature_c),
                    visibility_bucket=_visibility_bucket(row.visibility_km),
                )
                db.session.add(dim_w)
                db.session.flush()
                weather_cache[w_key] = dim_w.weather_id
                new_dim_weather += 1

            # DimRoad
            flags = road_flags.get(aid, {})
            r_key = (flags.get("Amenity", False), flags.get("Bump", False),
                     flags.get("Crossing", False), flags.get("Give_Way", False),
                     flags.get("Junction", False), flags.get("No_Exit", False),
                     flags.get("Railway", False), flags.get("Roundabout", False),
                     flags.get("Station", False), flags.get("Stop", False),
                     flags.get("Traffic_Calming", False), flags.get("Traffic_Signal", False),
                     flags.get("Turning_Loop", False))
            if r_key not in road_cache:
                dim_r = DimRoad(
                    amenity=r_key[0], bump=r_key[1], crossing=r_key[2],
                    give_way=r_key[3], junction=r_key[4], no_exit=r_key[5],
                    railway=r_key[6], roundabout=r_key[7], station=r_key[8],
                    stop=r_key[9], traffic_calming=r_key[10],
                    traffic_signal=r_key[11], turning_loop=r_key[12],
                    feature_count=sum(r_key),
                )
                db.session.add(dim_r)
                db.session.flush()
                road_cache[r_key] = dim_r.road_id
                new_dim_road += 1

            # FactAccident
            fact_batch.append(FactAccident(
                accident_id=aid,
                time_id=time_cache[t_key],
                location_id=location_cache[loc_key],
                weather_id=weather_cache[w_key],
                road_id=road_cache[r_key],
                severity=row.severity,
                severity_label=row.severity_label,
                duration_min=row.duration_min,
                start_time=row.start_time,
                end_time=row.end_time,
            ))

            if len(fact_batch) >= FLUSH_SIZE:
                db.session.bulk_save_objects(fact_batch)
                db.session.commit()
                total_new_facts += len(fact_batch)
                fact_batch = []
                print(f"[{job_name}] Flushed {total_new_facts:,} new facts")

        # Final flush
        if fact_batch:
            db.session.bulk_save_objects(fact_batch)
            db.session.commit()
            total_new_facts += len(fact_batch)

        status = "success"
        elapsed = round(time.time() - t0, 2)

        print(f"[{job_name}] ✅ COMPLETED in {elapsed}s")
        print(f"[{job_name}] New facts: {total_new_facts:,}")
        print(f"[{job_name}] New dimensions: time={new_dim_time}, loc={new_dim_location}, weather={new_dim_weather}, road={new_dim_road}")

        return jsonify({
            "message": f"Added {total_new_facts:,} new accidents to datamart.",
            "rows_inserted": total_new_facts,
            "rows_skipped": total_skipped,
            "rows_processed": len(new_accidents),
            "new_dimensions": {
                "time": new_dim_time,
                "location": new_dim_location,
                "weather": new_dim_weather,
                "road": new_dim_road
            },
            "duration_seconds": elapsed,
        }), 201

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
            rows_processed=len(new_accidents) if 'new_accidents' in locals() else 0,
            rows_inserted=total_new_facts,
            rows_skipped=total_skipped,
            error_message=error_msg,
            duration_seconds=time.time() - t0,
        )