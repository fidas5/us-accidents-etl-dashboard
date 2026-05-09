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
from flask import Blueprint, jsonify, request
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


# ── Endpoint 1: Distribution des années ───────────────────────────────────────

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


# ── Endpoint 2: Build Datamart (version année par année) ──────────────────────
@datamart_bp.route("/build-datamart", methods=["POST"])
@jwt_required()
def build_datamart():
    """
    Version ULTRA-RAPIDE - Traite TOUTES les années si year non spécifié
    """
    data = request.get_json() or {}
    target_year = data.get("year")
    
    # ✅ Si year est None, undefined, ou "all" -> traiter TOUTES les années
    if target_year is None or target_year == "all":
        # Appeler la version qui traite toutes les années
        return build_datamart_all_years()
    
    # Sinon, traiter l'année spécifique
    t0 = time.time()
    etl_job = _create_etl_job(f"build-datamart-{target_year}")
    job_name = f"build-datamart-{target_year}"

    error_msg = None
    status = "failed"
    total_facts_inserted = 0

    print(f"[{job_name}] ========== IMPORT UNIQUEMENT {target_year} ==========")

    try:
        JobManager.register(etl_job.id, job_name)

        # Vérifier ce qui existe déjà
        existing_count = db.session.execute(
            text("SELECT COUNT(*) FROM fact_accident WHERE EXTRACT(YEAR FROM start_time) = :year"),
            {"year": target_year}
        ).scalar()
        
        total_to_import = db.session.execute(
            text("SELECT COUNT(*) FROM accidents_clean WHERE EXTRACT(YEAR FROM start_time) = :year"),
            {"year": target_year}
        ).scalar()
        
        print(f"[{job_name}] Année {target_year}: {existing_count:,} / {total_to_import:,} déjà dans datamart")
        
        if existing_count >= total_to_import and total_to_import > 0:
            return jsonify({
                "message": f"Année {target_year} déjà complète",
                "year": target_year,
                "current": existing_count,
                "total": total_to_import,
                "percentage": 100
            }), 200

        # Supprimer les données existantes pour cette année
        if existing_count > 0:
            db.session.execute(
                text("DELETE FROM fact_accident WHERE EXTRACT(YEAR FROM start_time) = :year"),
                {"year": target_year}
            )
            db.session.commit()

        # Insérer uniquement l'année sélectionnée
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
            WHERE EXTRACT(YEAR FROM c.start_time) = :year
            AND NOT EXISTS (
                SELECT 1 FROM fact_accident f 
                WHERE f.accident_id = c.accident_id
            )
            ORDER BY c.accident_id, c.start_time
            ON CONFLICT (accident_id) DO NOTHING
        """), {"year": target_year})

        total_facts_inserted = result.rowcount
        db.session.commit()

        final_count = db.session.execute(
            text("SELECT COUNT(*) FROM fact_accident WHERE EXTRACT(YEAR FROM start_time) = :year"),
            {"year": target_year}
        ).scalar()

        total_clean = db.session.execute(
            text("SELECT COUNT(*) FROM accidents_clean WHERE EXTRACT(YEAR FROM start_time) = :year"),
            {"year": target_year}
        ).scalar()

        elapsed = time.time() - t0
        status = "success"

        return jsonify({
            "message": f"Année {target_year} importée en {elapsed:.1f} secondes",
            "year": target_year,
            "rows_inserted": total_facts_inserted,
            "current": final_count,
            "total": total_clean,
            "percentage": round(100.0 * final_count / total_clean, 2) if total_clean > 0 else 0,
            "duration_seconds": round(elapsed, 2)
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
            rows_processed=total_clean if 'total_clean' in locals() else 0,
            rows_inserted=total_facts_inserted,
            rows_skipped=0,
            error_message=error_msg,
            duration_seconds=time.time() - t0,
        )


def build_datamart_all_years():
    """Version qui traite TOUTES les années (comportement original)"""
    t0 = time.time()
    etl_job = _create_etl_job("build-datamart-all")
    job_name = "build-datamart-all"

    try:
        JobManager.register(etl_job.id, job_name)
        
        # Insérer TOUS les faits (sans filtre d'année)
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

        total_inserted = result.rowcount
        db.session.commit()

        total_facts = db.session.execute(text("SELECT COUNT(*) FROM fact_accident")).scalar()
        total_clean = db.session.execute(text("SELECT COUNT(*) FROM accidents_clean")).scalar()
        elapsed = time.time() - t0

        return jsonify({
            "message": f"Datamart construit en {elapsed:.1f} secondes",
            "rows_inserted": total_inserted,
            "total_facts": total_facts,
            "total_clean_records": total_clean,
            "completion_percentage": round(100.0 * total_facts / total_clean, 2) if total_clean > 0 else 0,
            "duration_seconds": round(elapsed, 2)
        }), 200

    except Exception as exc:
        db.session.rollback()
        return jsonify({"message": "Datamart build failed.", "detail": str(exc)}), 500

    finally:
        JobManager.unregister(etl_job.id)


# ── Endpoint 3: Supprimer une année (uniquement du datamart) ──────────────────
@datamart_bp.route("/delete-year", methods=["POST"])
@jwt_required()
def delete_year():
    data = request.get_json()
    year = data.get("year")

    print(f"[delete-year] ========== START year={year!r} (type={type(year).__name__}) ==========")

    if not year:
        return jsonify({"message": "Year required"}), 400

    # Normalize: EXTRACT() returns float (e.g. 2021.0), so a raw int param
    # like 2021 will silently match nothing without the ::INTEGER cast below.
    try:
        year_int = int(year)
    except (ValueError, TypeError) as e:
        print(f"[delete-year] ❌ Cannot cast year to int: {e}")
        return jsonify({"error": f"Invalid year value: {year!r}"}), 400

    print(f"[delete-year] year normalized → {year_int}")

    try:
        # ── 1. PRE-DELETION COUNTS ────────────────────────────────────────────
        raw_count = db.session.execute(
            text("""
                SELECT COUNT(*) FROM accidents_raw
                WHERE EXTRACT(YEAR FROM start_time_raw::timestamp)::INTEGER = :year
            """),
            {"year": year_int},
        ).scalar()

        clean_count = db.session.execute(
            text("SELECT COUNT(*) FROM accidents_clean WHERE EXTRACT(YEAR FROM start_time)::INTEGER = :year"),
            {"year": year_int},
        ).scalar()

        fact_count = db.session.execute(
            text("SELECT COUNT(*) FROM fact_accident WHERE EXTRACT(YEAR FROM start_time)::INTEGER = :year"),
            {"year": year_int},
        ).scalar()

        print(
            f"[delete-year] PRE-DELETE → "
            f"fact={fact_count:,}  clean={clean_count:,}  raw={raw_count:,}"
        )

        # ⚠️  Zero counts = the cast on start_time_raw is probably wrong
        if raw_count == 0 and clean_count == 0 and fact_count == 0:
            samples = db.session.execute(
                text("SELECT start_time_raw FROM accidents_raw LIMIT 5")
            ).fetchall()
            print(f"[delete-year] ⚠️  Nothing found — sample start_time_raw values: {[r[0] for r in samples]}")
            return jsonify({
                "message": f"No data found for year {year_int}",
                "debug": {"raw_count": 0, "clean_count": 0, "fact_count": 0},
            }), 404

        # ── 2. DELETIONS — child tables first (FK order) ──────────────────────
        print("[delete-year] Step 1/3 — fact_accident …")
        r1 = db.session.execute(
            text("DELETE FROM fact_accident WHERE EXTRACT(YEAR FROM start_time)::INTEGER = :year"),
            {"year": year_int},
        )
        print(f"[delete-year]   → {r1.rowcount:,} rows")

        print("[delete-year] Step 2/3 — accidents_clean …")
        r2 = db.session.execute(
            text("DELETE FROM accidents_clean WHERE EXTRACT(YEAR FROM start_time)::INTEGER = :year"),
            {"year": year_int},
        )
        print(f"[delete-year]   → {r2.rowcount:,} rows")

        print("[delete-year] Step 3/3 — accidents_raw …")
        r3 = db.session.execute(
            text("""
                DELETE FROM accidents_raw
                WHERE EXTRACT(YEAR FROM start_time_raw::timestamp)::INTEGER = :year
            """),
            {"year": year_int},
        )
        print(f"[delete-year]   → {r3.rowcount:,} rows")

        # ── 3. COMMIT ─────────────────────────────────────────────────────────
        print("[delete-year] Committing …")
        db.session.commit()
        print("[delete-year] ✅ Commit OK")

        # ── 4. POST-DELETION SANITY CHECK ─────────────────────────────────────
        after_raw   = db.session.execute(text("SELECT COUNT(*) FROM accidents_raw   WHERE EXTRACT(YEAR FROM start_time_raw::timestamp)::INTEGER = :year"), {"year": year_int}).scalar()
        after_clean = db.session.execute(text("SELECT COUNT(*) FROM accidents_clean WHERE EXTRACT(YEAR FROM start_time)::INTEGER = :year"),                  {"year": year_int}).scalar()
        after_fact  = db.session.execute(text("SELECT COUNT(*) FROM fact_accident   WHERE EXTRACT(YEAR FROM start_time)::INTEGER = :year"),                  {"year": year_int}).scalar()

        print(f"[delete-year] POST-DELETE → fact={after_fact}  clean={after_clean}  raw={after_raw}")

        if after_raw > 0 or after_clean > 0 or after_fact > 0:
            print("[delete-year] ⚠️  Rows still present after commit — possible FK violation or autocommit mode issue")

        return jsonify({
            "message": f"Année {year_int} supprimée",
            "deleted": {
                "fact_accident":  r1.rowcount,
                "accidents_clean": r2.rowcount,
                "accidents_raw":   r3.rowcount,
            },
            "remaining": {
                "fact_accident":  after_fact,
                "accidents_clean": after_clean,
                "accidents_raw":   after_raw,
            },
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"[delete-year] ❌ EXCEPTION {type(e).__name__}: {e}")
        traceback.print_exc()
        return jsonify({"error": str(e), "type": type(e).__name__}), 500

@datamart_bp.route("/year-status", methods=["GET"])
@jwt_required()
def year_status():
    """Retourne l'état de chaque année dans le pipeline"""
    try:
        # État pour toutes les années
        result = db.session.execute(text("""
            WITH years AS (
                SELECT DISTINCT EXTRACT(YEAR FROM start_time_raw::timestamp) as year
                FROM accidents_raw
                UNION
                SELECT DISTINCT EXTRACT(YEAR FROM start_time) as year
                FROM accidents_clean
                UNION
                SELECT DISTINCT EXTRACT(YEAR FROM start_time) as year
                FROM fact_accident
            )
            SELECT 
                y.year,
                CASE WHEN r.accident_id IS NOT NULL THEN true ELSE false END as raw_exists,
                CASE WHEN c.accident_id IS NOT NULL THEN true ELSE false END as clean_exists,
                CASE WHEN f.accident_id IS NOT NULL THEN true ELSE false END as fact_exists,
                COALESCE(r.count, 0) as raw_count,
                COALESCE(c.count, 0) as clean_count,
                COALESCE(f.count, 0) as fact_count
            FROM years y
            LEFT JOIN (SELECT EXTRACT(YEAR FROM start_time_raw::timestamp) as year, COUNT(*) as count, MIN(accident_id) as accident_id FROM accidents_raw GROUP BY year) r ON y.year = r.year
            LEFT JOIN (SELECT EXTRACT(YEAR FROM start_time) as year, COUNT(*) as count, MIN(accident_id) as accident_id FROM accidents_clean GROUP BY year) c ON y.year = c.year
            LEFT JOIN (SELECT EXTRACT(YEAR FROM start_time) as year, COUNT(*) as count, MIN(accident_id) as accident_id FROM fact_accident GROUP BY year) f ON y.year = f.year
            ORDER BY y.year DESC
        """))
        
        years_status = []
        for row in result:
            years_status.append({
                "year": row[0],
                "raw_exists": row[1],
                "clean_exists": row[2],
                "fact_exists": row[3],
                "raw_count": row[4],
                "clean_count": row[5],
                "fact_count": row[6]
            })
        
        return jsonify({"years_status": years_status}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500