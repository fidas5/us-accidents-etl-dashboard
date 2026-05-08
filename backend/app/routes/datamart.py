"""
build_datamart.py  —  ETL Step 3 (INCREMENTAL - NO CSV)
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
from ..models import AccidentClean, AccidentRaw, ETLJob
from ..models import DimTime, DimLocation, DimWeather, DimRoad, FactAccident
from .job_manager import JobManager, JobManagerError

datamart_bp = Blueprint("datamart", __name__, url_prefix="/etl")

CHUNK_SIZE = 5_000
FLUSH_SIZE = 2_000


# ── Bucket helpers (FRENCH) ────────────────────────────────────────────────────

US_REGIONS: dict[str, set[str]] = {
    "Nord-Est": {"CT", "ME", "MA", "NH", "NJ", "NY", "PA", "RI", "VT"},
    "Sud": {"AL", "AR", "DE", "FL", "GA", "KY", "LA", "MD", "MS",
            "NC", "OK", "SC", "TN", "TX", "VA", "WV", "DC"},
    "Midwest": {"IL", "IN", "IA", "KS", "MI", "MN", "MO", "NE", "ND", "OH", "SD", "WI"},
    "Ouest": {"AK", "AZ", "CA", "CO", "HI", "ID", "MT", "NV", "NM", "OR", "UT", "WA", "WY"},
}


def _us_region(state: Optional[str]) -> str:
    if not state:
        return "Inconnue"
    s = state.strip().upper()
    for region, states in US_REGIONS.items():
        if s in states:
            return region
    return "Autre"


def _temp_bucket(c: Optional[float]) -> str:
    if c is None:
        return "Inconnu"
    if c < 0:
        return "Glacial"
    if c < 10:
        return "Froid"
    if c < 20:
        return "Frais"
    if c < 30:
        return "Chaud"
    return "Très chaud"


def _visibility_bucket(km: Optional[float]) -> str:
    if km is None:
        return "Inconnue"
    if km < 1.6:
        return "Faible"
    if km < 8.0:
        return "Modérée"
    return "Bonne"


def _to_bool(val) -> bool:
    if val is None:
        return False
    if isinstance(val, bool):
        return val
    return str(val).strip().lower() in ("true", "1", "yes", "t")


def _season(month: int) -> str:
    return {
        12: "Hiver", 1: "Hiver", 2: "Hiver",
        3: "Printemps", 4: "Printemps", 5: "Printemps",
        6: "Été", 7: "Été", 8: "Été",
        9: "Automne", 10: "Automne", 11: "Automne"
    }.get(month, "Inconnu")


def _time_of_day(hour: int) -> str:
    if 5 <= hour < 12:
        return "Matin"
    if 12 <= hour < 17:
        return "Après-midi"
    if 17 <= hour < 21:
        return "Soir"
    return "Nuit"


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


# ── Step 3 — Build Datamart (INCREMENTAL - NO CSV) ─────────────────────────────
@datamart_bp.route("/build-datamart", methods=["POST"])
@jwt_required()
def build_datamart():
    """
    Version ULTRA-RAPIDE (2-3 minutes pour 2.4M records)
    Utilise SQL pur au lieu de boucles Python
    """
    t0 = time.time()
    etl_job = _create_etl_job("build-datamart-fast")
    job_name = "build-datamart-fast"

    error_msg = None
    status = "failed"
    total_facts_inserted = 0
    total_clean = 0

    print(f"[{job_name}] ========== ULTRA FAST DATAMART BUILD ==========")

    try:
        JobManager.register(etl_job.id, job_name)

        # =========================================================
        # 1. CRÉER LES TABLES SI ELLES N'EXISTENT PAS
        # =========================================================
        print(f"[{job_name}] Creating tables if not exists...")

        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS dim_time (
                time_id SERIAL PRIMARY KEY,
                year INTEGER,
                month INTEGER,
                day INTEGER,
                hour INTEGER,
                day_of_week INTEGER,
                week_of_year INTEGER,
                season VARCHAR(20),
                time_of_day VARCHAR(20),
                is_weekend BOOLEAN,
                month_name VARCHAR(20),
                day_name VARCHAR(20)
            )
        """))

        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS dim_location (
                location_id SERIAL PRIMARY KEY,
                city VARCHAR(100),
                state VARCHAR(2),
                latitude FLOAT,
                longitude FLOAT,
                us_region VARCHAR(20)
            )
        """))

        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS dim_weather (
                weather_id SERIAL PRIMARY KEY,
                weather_condition VARCHAR(100),
                temperature_c FLOAT,
                visibility_km FLOAT,
                temp_bucket VARCHAR(20),
                visibility_bucket VARCHAR(20)
            )
        """))

        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS dim_road (
                road_id SERIAL PRIMARY KEY,
                amenity BOOLEAN DEFAULT FALSE,
                bump BOOLEAN DEFAULT FALSE,
                crossing BOOLEAN DEFAULT FALSE,
                give_way BOOLEAN DEFAULT FALSE,
                junction BOOLEAN DEFAULT FALSE,
                no_exit BOOLEAN DEFAULT FALSE,
                railway BOOLEAN DEFAULT FALSE,
                roundabout BOOLEAN DEFAULT FALSE,
                station BOOLEAN DEFAULT FALSE,
                stop BOOLEAN DEFAULT FALSE,
                traffic_calming BOOLEAN DEFAULT FALSE,
                traffic_signal BOOLEAN DEFAULT FALSE,
                turning_loop BOOLEAN DEFAULT FALSE,
                feature_count INTEGER DEFAULT 0
            )
        """))

        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS fact_accident (
                fact_id SERIAL PRIMARY KEY,
                accident_id VARCHAR(50) UNIQUE NOT NULL,
                time_id INTEGER REFERENCES dim_time(time_id),
                location_id INTEGER REFERENCES dim_location(location_id),
                weather_id INTEGER REFERENCES dim_weather(weather_id),
                road_id INTEGER REFERENCES dim_road(road_id),
                severity INTEGER,
                severity_label VARCHAR(20),
                duration_min FLOAT,
                start_time TIMESTAMP,
                end_time TIMESTAMP
            )
        """))

        db.session.commit()
        print(f"[{job_name}] Tables ready")

        # =========================================================
        # 2. S'ASSURER QU'IL Y A UNE LIGNE PAR DÉFAUT DANS DIM_ROAD
        # =========================================================
        road_exists = db.session.execute(text("SELECT COUNT(*) FROM dim_road")).scalar()
        if road_exists == 0:
            db.session.execute(text("""
                INSERT INTO dim_road (road_id, feature_count) VALUES (1, 0)
            """))
            db.session.commit()

        # =========================================================
        # 3. AJOUTER LES NOUVELLES DIMENSIONS (SQL SEULEMENT)
        # =========================================================
        print(f"[{job_name}] Adding new dimensions...")

        # DimTime
        db.session.execute(text("""
            INSERT INTO dim_time (
                year, month, day, hour, day_of_week, week_of_year,
                season, time_of_day, is_weekend, month_name, day_name
            )
            SELECT DISTINCT 
                EXTRACT(YEAR FROM c.start_time)::INTEGER,
                EXTRACT(MONTH FROM c.start_time)::INTEGER,
                EXTRACT(DAY FROM c.start_time)::INTEGER,
                EXTRACT(HOUR FROM c.start_time)::INTEGER,
                EXTRACT(DOW FROM c.start_time)::INTEGER,
                EXTRACT(WEEK FROM c.start_time)::INTEGER,
                CASE EXTRACT(MONTH FROM c.start_time)
                    WHEN 12 THEN 'Hiver' WHEN 1 THEN 'Hiver' WHEN 2 THEN 'Hiver'
                    WHEN 3 THEN 'Printemps' WHEN 4 THEN 'Printemps' WHEN 5 THEN 'Printemps'
                    WHEN 6 THEN 'Été' WHEN 7 THEN 'Été' WHEN 8 THEN 'Été'
                    WHEN 9 THEN 'Automne' WHEN 10 THEN 'Automne' WHEN 11 THEN 'Automne'
                END,
                CASE 
                    WHEN EXTRACT(HOUR FROM c.start_time) BETWEEN 5 AND 11 THEN 'Matin'
                    WHEN EXTRACT(HOUR FROM c.start_time) BETWEEN 12 AND 16 THEN 'Après-midi'
                    WHEN EXTRACT(HOUR FROM c.start_time) BETWEEN 17 AND 20 THEN 'Soir'
                    ELSE 'Nuit'
                END,
                EXTRACT(DOW FROM c.start_time) IN (0, 6),
                CASE EXTRACT(MONTH FROM c.start_time)
                    WHEN 1 THEN 'Janvier' WHEN 2 THEN 'Février' WHEN 3 THEN 'Mars'
                    WHEN 4 THEN 'Avril' WHEN 5 THEN 'Mai' WHEN 6 THEN 'Juin'
                    WHEN 7 THEN 'Juillet' WHEN 8 THEN 'Août' WHEN 9 THEN 'Septembre'
                    WHEN 10 THEN 'Octobre' WHEN 11 THEN 'Novembre' WHEN 12 THEN 'Décembre'
                END,
                CASE EXTRACT(DOW FROM c.start_time)
                    WHEN 0 THEN 'Dimanche' WHEN 1 THEN 'Lundi' WHEN 2 THEN 'Mardi'
                    WHEN 3 THEN 'Mercredi' WHEN 4 THEN 'Jeudi' WHEN 5 THEN 'Vendredi'
                    WHEN 6 THEN 'Samedi'
                END
            FROM accidents_clean c
            WHERE NOT EXISTS (
                SELECT 1 FROM dim_time d 
                WHERE d.year = EXTRACT(YEAR FROM c.start_time)::INTEGER
                  AND d.month = EXTRACT(MONTH FROM c.start_time)::INTEGER
                  AND d.day = EXTRACT(DAY FROM c.start_time)::INTEGER
                  AND d.hour = EXTRACT(HOUR FROM c.start_time)::INTEGER
            )
        """))
        db.session.commit()

        # DimLocation
        db.session.execute(text("""
            INSERT INTO dim_location (city, state, latitude, longitude, us_region)
            SELECT DISTINCT 
                c.city, c.state, c.latitude, c.longitude,
                CASE 
                    WHEN c.state IN ('CT','ME','MA','NH','NJ','NY','PA','RI','VT') THEN 'Nord-Est'
                    WHEN c.state IN ('AL','AR','DE','FL','GA','KY','LA','MD','MS','NC','OK','SC','TN','TX','VA','WV','DC') THEN 'Sud'
                    WHEN c.state IN ('IL','IN','IA','KS','MI','MN','MO','NE','ND','OH','SD','WI') THEN 'Midwest'
                    WHEN c.state IN ('AK','AZ','CA','CO','HI','ID','MT','NV','NM','OR','UT','WA','WY') THEN 'Ouest'
                    ELSE 'Autre'
                END
            FROM accidents_clean c
            WHERE NOT EXISTS (
                SELECT 1 FROM dim_location d 
                WHERE d.city = c.city 
                  AND d.state = c.state
                  AND COALESCE(d.latitude, 0) = COALESCE(c.latitude, 0)
                  AND COALESCE(d.longitude, 0) = COALESCE(c.longitude, 0)
            )
            AND c.city IS NOT NULL 
            AND c.state IS NOT NULL
        """))
        db.session.commit()

        # DimWeather
        db.session.execute(text("""
            INSERT INTO dim_weather (
                weather_condition, temperature_c, visibility_km,
                temp_bucket, visibility_bucket
            )
            SELECT DISTINCT 
                COALESCE(c.weather_condition, 'Inconnu'),
                c.temperature_c,
                c.visibility_km,
                CASE 
                    WHEN c.temperature_c < 0 THEN 'Glacial'
                    WHEN c.temperature_c < 10 THEN 'Froid'
                    WHEN c.temperature_c < 20 THEN 'Frais'
                    WHEN c.temperature_c < 30 THEN 'Chaud'
                    ELSE 'Très chaud'
                END,
                CASE 
                    WHEN c.visibility_km < 1.6 THEN 'Faible'
                    WHEN c.visibility_km < 8.0 THEN 'Modérée'
                    ELSE 'Bonne'
                END
            FROM accidents_clean c
            WHERE NOT EXISTS (
                SELECT 1 FROM dim_weather w 
                WHERE w.weather_condition = COALESCE(c.weather_condition, 'Inconnu')
                  AND COALESCE(w.temperature_c, 0) = COALESCE(c.temperature_c, 0)
                  AND COALESCE(w.visibility_km, 0) = COALESCE(c.visibility_km, 0)
            )
        """))
        db.session.commit()

        print(f"[{job_name}] Dimensions added")

        # =========================================================
        # 4. INSÉRER LES FAITS MANQUANTS — DISTINCT ON pour éviter
        #    les doublons dans accidents_clean + ON CONFLICT safety net
        # =========================================================
        print(f"[{job_name}] Inserting facts...")

        result = db.session.execute(text("""
            INSERT INTO fact_accident (
                accident_id, time_id, location_id, weather_id, road_id,
                severity, severity_label, duration_min, start_time, end_time
            )
            SELECT DISTINCT ON (c.accident_id)
                c.accident_id,
                t.time_id,
                l.location_id,
                w.weather_id,
                1 as road_id,
                c.severity,
                c.severity_label,
                c.duration_min,
                c.start_time,
                c.end_time
            FROM accidents_clean c
            INNER JOIN dim_time t ON 
                t.year = EXTRACT(YEAR FROM c.start_time)::INTEGER
                AND t.month = EXTRACT(MONTH FROM c.start_time)::INTEGER
                AND t.day = EXTRACT(DAY FROM c.start_time)::INTEGER
                AND t.hour = EXTRACT(HOUR FROM c.start_time)::INTEGER
            INNER JOIN dim_location l ON 
                COALESCE(c.city, '') = COALESCE(l.city, '')
                AND COALESCE(c.state, '') = COALESCE(l.state, '')
                AND COALESCE(c.latitude, 0) = COALESCE(l.latitude, 0)
                AND COALESCE(c.longitude, 0) = COALESCE(l.longitude, 0)
            INNER JOIN dim_weather w ON 
                COALESCE(c.weather_condition, 'Inconnu') = w.weather_condition
                AND COALESCE(c.temperature_c, 0) = COALESCE(w.temperature_c, 0)
                AND COALESCE(c.visibility_km, 0) = COALESCE(w.visibility_km, 0)
            WHERE NOT EXISTS (
                SELECT 1 FROM fact_accident f 
                WHERE f.accident_id = c.accident_id
            )
            ORDER BY c.accident_id, c.start_time
            ON CONFLICT (accident_id) DO NOTHING
        """))

        total_facts_inserted = result.rowcount
        db.session.commit()

        # =========================================================
        # 5. STATISTIQUES
        # =========================================================
        total_facts = db.session.execute(text("SELECT COUNT(*) FROM fact_accident")).scalar()
        total_clean = db.session.execute(text("SELECT COUNT(*) FROM accidents_clean")).scalar()

        elapsed = time.time() - t0
        status = "success"

        print(f"[{job_name}] ========== COMPLETED ==========")
        print(f"[{job_name}] ✅ Duration: {elapsed:.1f} seconds")
        print(f"[{job_name}] 📊 Inserted: {total_facts_inserted:,} new facts")
        print(f"[{job_name}] 📊 Total facts: {total_facts:,} / {total_clean:,}")

        return jsonify({
            "message": f"Datamart construit en {elapsed:.1f} secondes",
            "rows_inserted": total_facts_inserted,
            "total_facts": total_facts,
            "total_clean_records": total_clean,
            "completion_percentage": round(100.0 * total_facts / total_clean, 2) if total_clean > 0 else 0,
            "duration_seconds": round(elapsed, 2),
            "french_labels": True,
            "fast_version": True
        }), 200

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
            rows_processed=total_clean,
            rows_inserted=total_facts_inserted,
            rows_skipped=0,
            error_message=error_msg,
            duration_seconds=time.time() - t0,
        )

        
@datamart_bp.route("/build-datamarff", methods=["POST"])
@jwt_required()
def build_datamartt():
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

    print(f"[{job_name}] ========== INCREMENTAL DATAMART BUILD (NO CSV) ==========")

    try:
        JobManager.register(etl_job.id, job_name)

        # =========================================================
        # 1. RÉCUPÉRER LES IDS DÉJÀ DANS LE DATAMART
        # =========================================================
        print(f"[{job_name}] Loading existing accident IDs...")
        existing_fact_ids = {
            row[0] for row in db.session.execute(text("SELECT accident_id FROM fact_accident"))
        }
        print(f"[{job_name}] {len(existing_fact_ids):,} already in datamart")

        # =========================================================
        # 2. TROUVER LES NOUVEAUX ACCIDENTS
        # =========================================================
        print(f"[{job_name}] Finding new accidents...")
        new_accidents = db.session.query(AccidentClean).filter(
            ~AccidentClean.accident_id.in_(existing_fact_ids)
        ).all()

        print(f"[{job_name}] {len(new_accidents):,} NEW accidents to process")

        if not new_accidents:
            print(f"[{job_name}] Datamart is already up to date!")
            return jsonify({"message": "Datamart is already up to date.", "rows_inserted": 0}), 200

        # =========================================================
        # 3. CHARGER LES CACHES DES DIMENSIONS EXISTANTES
        # =========================================================
        print(f"[{job_name}] Loading dimension caches...")

        time_cache = {
            (d.year, d.month, d.day, d.hour): d.time_id
            for d in db.session.query(DimTime).all()
        }

        location_cache = {
            ((d.city or "").strip().lower(),
             (d.state or "").strip().upper(),
             round(d.latitude or 0.0, 6),
             round(d.longitude or 0.0, 6)): d.location_id
            for d in db.session.query(DimLocation).all()
        }

        weather_cache = {
            ((d.weather_condition or "Inconnu").strip().lower(),
             round(d.temperature_c or 0.0, 1),
             round(d.visibility_km or 0.0, 1)): d.weather_id
            for d in db.session.query(DimWeather).all()
        }

        road_cache = {
            (d.amenity, d.bump, d.crossing, d.give_way, d.junction,
             d.no_exit, d.railway, d.roundabout, d.station, d.stop,
             d.traffic_calming, d.traffic_signal, d.turning_loop): d.road_id
            for d in db.session.query(DimRoad).all()
        }

        print(f"[{job_name}] Caches ready: time={len(time_cache)}, loc={len(location_cache)}, weather={len(weather_cache)}, road={len(road_cache)}")

        # =========================================================
        # 4. CHARGER LES ROAD FLAGS DEPUIS LA DB (NO CSV)
        # =========================================================
        print(f"[{job_name}] Loading road flags from database...")
        
        road_flags = {}
        for r in db.session.query(AccidentRaw).all():
            road_flags[str(r.accident_id)] = {
                "Amenity": getattr(r, "amenity", False) or False,
                "Bump": getattr(r, "bump", False) or False,
                "Crossing": getattr(r, "crossing", False) or False,
                "Give_Way": getattr(r, "give_way", False) or False,
                "Junction": getattr(r, "junction", False) or False,
                "No_Exit": getattr(r, "no_exit", False) or False,
                "Railway": getattr(r, "railway", False) or False,
                "Roundabout": getattr(r, "roundabout", False) or False,
                "Station": getattr(r, "station", False) or False,
                "Stop": getattr(r, "stop", False) or False,
                "Traffic_Calming": getattr(r, "traffic_calming", False) or False,
                "Traffic_Signal": getattr(r, "traffic_signal", False) or False,
                "Turning_Loop": getattr(r, "turning_loop", False) or False,
            }
        
        print(f"[{job_name}] Road flags loaded for {len(road_flags):,} accidents")

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

            # --- DimTime ---
            t_key = (dt.year, dt.month, dt.day, dt.hour)
            if t_key not in time_cache:
                dim_t = DimTime(
                    year=dt.year, month=dt.month, day=dt.day, hour=dt.hour,
                    day_of_week=dow,
                    week_of_year=dt.isocalendar()[1],
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

            # --- DimLocation ---
            loc_key = (
                (row.city or "").strip().lower(),
                (row.state or "").strip().upper(),
                round(row.latitude or 0.0, 6),
                round(row.longitude or 0.0, 6)
            )

            if loc_key not in location_cache:
                dim_l = DimLocation(
                    city=row.city,
                    state=row.state,
                    latitude=row.latitude,
                    longitude=row.longitude,
                    us_region=_us_region(row.state),
                )
                db.session.add(dim_l)
                db.session.flush()
                location_cache[loc_key] = dim_l.location_id
                new_dim_location += 1

            # --- DimWeather ---
            wc = (row.weather_condition or "Inconnu").strip()
            w_key = (
                wc.lower(),
                round(row.temperature_c or 0.0, 1),
                round(row.visibility_km or 0.0, 1)
            )

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

            # --- DimRoad ---
            flags = road_flags.get(aid, {})
            r_key = (
                flags.get("Amenity", False),
                flags.get("Bump", False),
                flags.get("Crossing", False),
                flags.get("Give_Way", False),
                flags.get("Junction", False),
                flags.get("No_Exit", False),
                flags.get("Railway", False),
                flags.get("Roundabout", False),
                flags.get("Station", False),
                flags.get("Stop", False),
                flags.get("Traffic_Calming", False),
                flags.get("Traffic_Signal", False),
                flags.get("Turning_Loop", False),
            )

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

            # --- FactAccident ---
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
                print(f"[{job_name}] Flushed {total_new_facts:,} new facts")
                fact_batch = []

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
        print(f"[{job_name}] 🎨 French labels: ACTIVE")
        print(f"[{job_name}] 📁 NO CSV used - road flags from database")

        return jsonify({
            "message": f"Added {total_new_facts:,} new accidents to datamart (NO CSV).",
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
            "french_labels": True,
            "no_csv": True
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