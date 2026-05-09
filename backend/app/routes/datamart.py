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
from flask import Blueprint, jsonify,request
from flask_jwt_extended import jwt_required
from sqlalchemy import text
from flask_jwt_extended import create_access_token
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


@datamart_bp.route("/years-distribution", methods=["GET"])
@jwt_required()
def years_distribution():
    """Retourne la distribution des années dans fact_accident"""
    try:
        result = db.session.execute(text("""
            SELECT 
                EXTRACT(YEAR FROM start_time)::INTEGER as year,
                COUNT(*) as count
            FROM fact_accident
            GROUP BY EXTRACT(YEAR FROM start_time)
            ORDER BY year DESC
        """))
        
        years = [{"year": row[0], "count": row[1]} for row in result]
        
        return jsonify({"years": years}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

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

        

@datamart_bp.route("/delete-year", methods=["POST"])
@jwt_required()
def delete_year():
    """⚠️ Supprime TOUTES les données d'une année (raw + clean + datamart)"""
    data = request.get_json()
    year = data.get("year")
    
    if not year:
        return jsonify({"message": "Year required"}), 400
    
    # 1. Supprimer du datamart
    db.session.execute(text("DELETE FROM fact_accident WHERE EXTRACT(YEAR FROM start_time) = :year"), {"year": year})
    
    # 2. Supprimer de accidents_clean
    db.session.execute(text("DELETE FROM accidents_clean WHERE EXTRACT(YEAR FROM start_time) = :year"), {"year": year})
    
    # 3. Supprimer de accidents_raw
    db.session.execute(text("DELETE FROM accidents_raw WHERE EXTRACT(YEAR FROM start_time_raw::timestamp) = :year"), {"year": year})
    
    # 4. Nettoyer les dimensions
    db.session.execute(text("DELETE FROM dim_time WHERE year = :year AND NOT EXISTS (SELECT 1 FROM fact_accident WHERE time_id = dim_time.time_id)"))
    db.session.execute(text("DELETE FROM dim_location WHERE NOT EXISTS (SELECT 1 FROM fact_accident WHERE location_id = dim_location.location_id)"))
    db.session.execute(text("DELETE FROM dim_weather WHERE NOT EXISTS (SELECT 1 FROM fact_accident WHERE weather_id = dim_weather.weather_id)"))
    
    db.session.commit()
    
    return jsonify({"message": f"Année {year} supprimée de TOUTES les tables"}), 200
        