# backend/app/api/datamart.py
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
from .datamart_builder import DatamartBuilder

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
    """Retourne la distribution des années présentes dans raw, clean ET datamart"""
    try:
        # Récupérer les compteurs par année
        raw_result = db.session.execute(text("""
            SELECT 
                EXTRACT(YEAR FROM start_time_raw::timestamp)::INTEGER as year,
                COUNT(*) as count
            FROM accidents_raw
            WHERE start_time_raw IS NOT NULL
            GROUP BY year
        """)).fetchall()
        
        clean_result = db.session.execute(text("""
            SELECT 
                EXTRACT(YEAR FROM start_time)::INTEGER as year,
                COUNT(*) as count
            FROM accidents_clean
            WHERE start_time IS NOT NULL
            GROUP BY year
        """)).fetchall()
        
        fact_result = db.session.execute(text("""
            SELECT 
                EXTRACT(YEAR FROM start_time)::INTEGER as year,
                COUNT(*) as count
            FROM fact_accident
            WHERE start_time IS NOT NULL
            GROUP BY year
        """)).fetchall()
        
        # Créer les mappings
        raw_map = {r[0]: r[1] for r in raw_result}
        clean_map = {r[0]: r[1] for r in clean_result}
        fact_map = {r[0]: r[1] for r in fact_result}
        
        # Union de toutes les années
        all_years = sorted(set(raw_map.keys()) | set(clean_map.keys()) | set(fact_map.keys()), reverse=True)
        
        years_data = []
        for year in all_years:
            raw_count = raw_map.get(year, 0)
            clean_count = clean_map.get(year, 0)
            fact_count = fact_map.get(year, 0)
            
            years_data.append({
                "year": year,
                "count": max(raw_count, clean_count, fact_count),
                "raw_count": raw_count,
                "clean_count": clean_count,
                "fact_count": fact_count,
                "has_raw": raw_count > 0,
                "has_clean": clean_count > 0,
                "has_fact": fact_count > 0,
                "status": "complete" if fact_count > 0 else "partial"
            })
        
        return jsonify({"years": years_data}), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Endpoints modulaires pour le datamart ─────────────────────────────────

@datamart_bp.route("/build-dim-time", methods=["POST"])
@jwt_required()
def build_dim_time():
    """Construit uniquement la dimension temporelle pour une année"""
    data = request.get_json() or {}
    year = data.get("year")
    
    if not year:
        return jsonify({"error": "Année requise"}), 400
    
    builder = DatamartBuilder(int(year))
    result = builder.build_dim_time()
    
    return jsonify({
        "message": f"dim_time construit pour {year}",
        "year": year,
        "entries": len(result)
    }), 200


@datamart_bp.route("/build-dim-location", methods=["POST"])
@jwt_required()
def build_dim_location():
    """Construit uniquement la dimension géographique"""
    data = request.get_json() or {}
    year = data.get("year")
    
    if not year:
        return jsonify({"error": "Année requise"}), 400
    
    builder = DatamartBuilder(int(year))
    result = builder.build_dim_location()
    
    return jsonify({
        "message": f"dim_location construit pour {year}",
        "year": year,
        "entries": len(result)
    }), 200


@datamart_bp.route("/build-dim-weather", methods=["POST"])
@jwt_required()
def build_dim_weather():
    """Construit uniquement la dimension météo"""
    data = request.get_json() or {}
    year = data.get("year")
    
    if not year:
        return jsonify({"error": "Année requise"}), 400
    
    builder = DatamartBuilder(int(year))
    result = builder.build_dim_weather()
    
    return jsonify({
        "message": f"dim_weather construit pour {year}",
        "year": year,
        "entries": len(result)
    }), 200


@datamart_bp.route("/build-fact", methods=["POST"])
@jwt_required()
def build_fact():
    """Construit uniquement la table de faits (les dimensions doivent exister)"""
    data = request.get_json() or {}
    year = data.get("year")
    
    if not year:
        return jsonify({"error": "Année requise"}), 400
    
    builder = DatamartBuilder(int(year))
    
    # Charger les mappings existants
    builder.build_dim_time()
    builder.build_dim_location()
    builder.build_dim_weather()
    builder.build_dim_road()
    
    result = builder.build_fact_accident()
    
    return jsonify({
        "message": f"fact_accident construit pour {year}",
        "year": year,
        "rows_inserted": result["rows_inserted"],
        "total_expected": result["total"],
        "batches": result["batches"]
    }), 200


@datamart_bp.route("/build-datamart-full", methods=["POST"])
@jwt_required()
def build_datamart_full():
    """Exécute TOUTES les étapes séquentiellement (complet)"""
    data = request.get_json() or {}
    year = data.get("year")
    
    if not year:
        return jsonify({"error": "Année requise"}), 400
    
    builder = DatamartBuilder(int(year))
    result = builder.run_all()
    
    return jsonify({
        "message": f"Datamart complet construit pour {year}",
        "result": result
    }), 200



# ── Endpoint 3: Delete year ──────────────────────────────────────────────────

@datamart_bp.route("/delete-year", methods=["POST"])
@jwt_required()
def delete_year():
    data = request.get_json()
    year = data.get("year")
    
    if not year:
        return jsonify({"message": "Year required"}), 400
    
    try:
        year_int = int(year)
    except (ValueError, TypeError):
        return jsonify({"error": f"Invalid year value: {year!r}"}), 400
    
    try:
        # Pré-suppression - récupérer les compteurs
        raw_count_before = db.session.execute(
            text("SELECT COUNT(*) FROM accidents_raw WHERE EXTRACT(YEAR FROM start_time_raw::timestamp)::INTEGER = :year"),
            {"year": year_int},
        ).scalar()
        
        clean_count_before = db.session.execute(
            text("SELECT COUNT(*) FROM accidents_clean WHERE EXTRACT(YEAR FROM start_time)::INTEGER = :year"),
            {"year": year_int},
        ).scalar()
        
        fact_count_before = db.session.execute(
            text("SELECT COUNT(*) FROM fact_accident WHERE EXTRACT(YEAR FROM start_time)::INTEGER = :year"),
            {"year": year_int},
        ).scalar()
        
        # Suppression - ordre inverse des dépendances
        fact_deleted = db.session.execute(
            text("DELETE FROM fact_accident WHERE EXTRACT(YEAR FROM start_time)::INTEGER = :year"),
            {"year": year_int},
        ).rowcount
        
        clean_deleted = db.session.execute(
            text("DELETE FROM accidents_clean WHERE EXTRACT(YEAR FROM start_time)::INTEGER = :year"),
            {"year": year_int},
        ).rowcount
        
        raw_deleted = db.session.execute(
            text("DELETE FROM accidents_raw WHERE EXTRACT(YEAR FROM start_time_raw::timestamp)::INTEGER = :year"),
            {"year": year_int},
        ).rowcount
        
        db.session.commit()
        
        return jsonify({
            "message": f"Année {year_int} supprimée avec succès",
            "year": year_int,
            "deleted": {
                "fact_accident": fact_deleted,
                "accidents_clean": clean_deleted,
                "accidents_raw": raw_deleted,
            },
            "before": {
                "fact_accident": fact_count_before,
                "accidents_clean": clean_count_before,
                "accidents_raw": raw_count_before,
            }
        }), 200
        
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ── Endpoint 4: Year pipeline status ──────────────────────────────────────────

@datamart_bp.route("/year-status", methods=["GET"])
@jwt_required()
def year_status():
    """Retourne l'état de chaque année dans le pipeline - VERSION OPTIMISÉE"""
    try:
        # ✅ Limiter aux années qui ont des données (pas besoin de toutes)
        # Utiliser des requêtes groupées plutôt que des CTE complexes
        
        # Récupérer les années distinctes depuis clean (la source principale)
        clean_years = db.session.execute(text("""
            SELECT DISTINCT EXTRACT(YEAR FROM start_time)::INTEGER as year
            FROM accidents_clean
            WHERE start_time IS NOT NULL
            ORDER BY year DESC
        """)).fetchall()
        
        if not clean_years:
            # Si clean est vide, essayer raw
            clean_years = db.session.execute(text("""
                SELECT DISTINCT EXTRACT(YEAR FROM start_time_raw::timestamp)::INTEGER as year
                FROM accidents_raw
                WHERE start_time_raw IS NOT NULL
                ORDER BY year DESC
            """)).fetchall()
        
        years_status = []
        for row in clean_years:
            year = row[0]
            
            # Compter pour cette année seulement (requêtes ciblées avec index)
            raw_count = db.session.execute(
                text("SELECT COUNT(*) FROM accidents_raw WHERE EXTRACT(YEAR FROM start_time_raw::timestamp)::INTEGER = :year"),
                {"year": year}
            ).scalar() or 0
            
            clean_count = db.session.execute(
                text("SELECT COUNT(*) FROM accidents_clean WHERE EXTRACT(YEAR FROM start_time)::INTEGER = :year"),
                {"year": year}
            ).scalar() or 0
            
            fact_count = db.session.execute(
                text("SELECT COUNT(*) FROM fact_accident WHERE EXTRACT(YEAR FROM start_time)::INTEGER = :year"),
                {"year": year}
            ).scalar() or 0
            
            years_status.append({
                "year": year,
                "raw_exists": raw_count > 0,
                "clean_exists": clean_count > 0,
                "fact_exists": fact_count > 0,
                "raw_count": raw_count,
                "clean_count": clean_count,
                "fact_count": fact_count,
            })
        
        return jsonify({"years_status": years_status}), 200
        
    except Exception as e:
        print(f"[year-status] Error: {str(e)}")
        return jsonify({"error": str(e)}), 500
    
# ── Endpoint 5: Pipeline status global ─────────────────────────────────────────

@datamart_bp.route("/pipeline-status", methods=["GET"])
@jwt_required()
def pipeline_status():
    """Retourne l'état global du pipeline ETL - VERSION OPTIMISÉE"""
    try:
        # ✅ Utiliser des compteurs rapides avec des requêtes simples
        # et éviter les COUNT(*) sur des millions de lignes si possible
        
        # Utiliser des requêtes avec index (si les tables ont des indexes sur start_time)
        raw_count = db.session.execute(text("""
            SELECT reltuples::bigint AS estimate 
            FROM pg_class 
            WHERE relname = 'accidents_raw'
        """)).scalar() or 0
        
        clean_count = db.session.execute(text("""
            SELECT reltuples::bigint AS estimate 
            FROM pg_class 
            WHERE relname = 'accidents_clean'
        """)).scalar() or 0
        
        fact_count = db.session.execute(text("""
            SELECT reltuples::bigint AS estimate 
            FROM pg_class 
            WHERE relname = 'fact_accident'
        """)).scalar() or 0
        
        # Si les estimations sont trop imprécises, faire un vrai COUNT une seule fois
        if raw_count < 1000:  # Seulement pour les petites tables
            raw_count = db.session.execute(text("SELECT COUNT(*) FROM accidents_raw")).scalar() or 0
            clean_count = db.session.execute(text("SELECT COUNT(*) FROM accidents_clean")).scalar() or 0
            fact_count = db.session.execute(text("SELECT COUNT(*) FROM fact_accident")).scalar() or 0
        
        print(f"[Pipeline] raw: {raw_count}, clean: {clean_count}, fact: {fact_count}")
        
        # Vérifier si clean est complet
        clean_complete = clean_count > 0 and clean_count == raw_count
        
        # Calculer le pourcentage de complétion du datamart
        completion_percentage = round(100.0 * fact_count / clean_count, 2) if clean_count > 0 else 0
        datamart_complete = fact_count >= clean_count and clean_count > 0
        
        csv_exists = raw_count > 0
        
        return jsonify({
            "csv_exists": csv_exists,
            "raw": {
                "exists": raw_count > 0,
                "count": raw_count,
                "is_complete": raw_count > 0
            },
            "clean": {
                "exists": clean_count > 0,
                "count": clean_count,
                "is_complete": clean_complete
            },
            "datamart": {
                "exists": fact_count > 0,
                "count": fact_count,
                "expected_count": clean_count,
                "completion_percentage": completion_percentage,
                "is_complete": datamart_complete
            }
        }), 200
        
    except Exception as e:
        print(f"[Pipeline] Error: {str(e)}")
        return jsonify({"error": str(e)}), 500
    

