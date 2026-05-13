# backend/app/api/datamart.py
"""
build_datamart.py  —  ETL Step 3
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


# ── Migration helper : contraintes UNIQUE requises par les UPSERT ─────────────
#
# ✅ NOUVEAU : les UPSERT (ON CONFLICT DO NOTHING) dans DatamartBuilder
# nécessitent des contraintes UNIQUE en base. Cette fonction les crée
# si elles n'existent pas encore. À appeler au démarrage de l'app
# ou depuis un endpoint d'initialisation.

def ensure_dimension_constraints():
    """
    Crée les contraintes UNIQUE sur les tables de dimension si elles
    n'existent pas. Idempotent — peut être appelé plusieurs fois sans risque.

    Contraintes créées :
      - dim_location  : UNIQUE (city, state)
      - dim_weather   : UNIQUE (weather_condition, temperature_c, visibility_km)
    """
    constraints = [
        (
            "uq_dim_location_city_state",
            "ALTER TABLE dim_location ADD CONSTRAINT uq_dim_location_city_state "
            "UNIQUE (city, state)"
        ),
        (
            "uq_dim_weather_condition_temp_vis",
            "ALTER TABLE dim_weather ADD CONSTRAINT uq_dim_weather_condition_temp_vis "
            "UNIQUE (weather_condition, temperature_c, visibility_km)"
        ),
    ]
    for constraint_name, ddl in constraints:
        try:
            db.session.execute(text(ddl))
            db.session.commit()
            print(f"[datamart] ✅ Contrainte créée : {constraint_name}")
        except Exception:
            # La contrainte existe déjà → rollback et on continue
            db.session.rollback()


# ── Endpoint 0 : Initialisation des contraintes ───────────────────────────────

@datamart_bp.route("/init-constraints", methods=["POST"])
@jwt_required()
def init_constraints():
    """
    Crée les contraintes UNIQUE nécessaires aux UPSERT du DatamartBuilder.
    À appeler une seule fois après la création des tables (ou au premier
    lancement). Idempotent.
    """
    try:
        ensure_dimension_constraints()
        return jsonify({"message": "Contraintes UNIQUE vérifiées / créées avec succès."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Endpoint 1: Distribution des années ───────────────────────────────────────

@datamart_bp.route("/years-distribution", methods=["GET"])
@jwt_required()
def years_distribution():
    """Retourne la distribution des années présentes dans raw, clean ET datamart"""
    try:
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

        raw_map   = {r[0]: r[1] for r in raw_result}
        clean_map = {r[0]: r[1] for r in clean_result}
        fact_map  = {r[0]: r[1] for r in fact_result}

        all_years = sorted(
            set(raw_map.keys()) | set(clean_map.keys()) | set(fact_map.keys()),
            reverse=True
        )

        years_data = []
        for year in all_years:
            raw_count   = raw_map.get(year, 0)
            clean_count = clean_map.get(year, 0)
            fact_count  = fact_map.get(year, 0)

            years_data.append({
                "year":        year,
                "count":       max(raw_count, clean_count, fact_count),
                "raw_count":   raw_count,
                "clean_count": clean_count,
                "fact_count":  fact_count,
                "has_raw":     raw_count > 0,
                "has_clean":   clean_count > 0,
                "has_fact":    fact_count > 0,
                "status":      "complete" if fact_count > 0 else "partial",
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
        "year":    year,
        "entries": len(result),
    }), 200


@datamart_bp.route("/build-dim-location", methods=["POST"])
@jwt_required()
def build_dim_location():
    """Construit uniquement la dimension géographique"""
    data = request.get_json() or {}
    year = data.get("year")

    if not year:
        return jsonify({"error": "Année requise"}), 400

    # ✅ S'assurer que la contrainte UNIQUE existe avant le premier UPSERT
    ensure_dimension_constraints()

    builder = DatamartBuilder(int(year))
    result = builder.build_dim_location()

    return jsonify({
        "message": f"dim_location construit pour {year}",
        "year":    year,
        "entries": len(result),
    }), 200


@datamart_bp.route("/build-dim-weather", methods=["POST"])
@jwt_required()
def build_dim_weather():
    """Construit uniquement la dimension météo"""
    data = request.get_json() or {}
    year = data.get("year")

    if not year:
        return jsonify({"error": "Année requise"}), 400

    # ✅ S'assurer que la contrainte UNIQUE existe avant le premier UPSERT
    ensure_dimension_constraints()

    builder = DatamartBuilder(int(year))
    result = builder.build_dim_weather()

    return jsonify({
        "message": f"dim_weather construit pour {year}",
        "year":    year,
        "entries": len(result),
    }), 200


@datamart_bp.route("/build-fact", methods=["POST"])
@jwt_required()
def build_fact():
    """
    Construit uniquement la table de faits.
    Les dimensions doivent déjà exister en base — on les charge depuis la DB
    sans les reconstruire (contrairement à l'ancienne version qui appelait
    build_dim_* et effaçait tout).
    """
    data = request.get_json() or {}
    year = data.get("year")

    if not year:
        return jsonify({"error": "Année requise"}), 400

    year_int = int(year)
    builder = DatamartBuilder(year_int)

    # ✅ BUG CORRIGÉ : l'ancienne version appelait build_dim_time/location/weather/road
    # ce qui déclenchait les DELETE globaux et écrasait les dimensions existantes.
    # On charge maintenant directement depuis la base sans modifier les tables.

    # Charger time_map depuis la DB (cette année seulement)
    rows = db.session.execute(
        text("SELECT year, month, day, hour, time_id FROM dim_time WHERE year = :year"),
        {"year": year_int}
    ).fetchall()
    builder.time_map = {(int(r[0]), int(r[1]), int(r[2]), int(r[3])): r[4] for r in rows}

    if not builder.time_map:
        return jsonify({
            "error": f"dim_time vide pour {year}. Lancez d'abord /build-dim-time."
        }), 400

    # Charger loc_map depuis la DB (toute la table — les villes peuvent être partagées)
    rows = db.session.execute(
        text("SELECT city, state, location_id FROM dim_location")
    ).fetchall()
    builder.loc_map = {(r[0] or 'Inconnu', r[1] or 'Inconnu'): r[2] for r in rows}

    if not builder.loc_map:
        return jsonify({
            "error": f"dim_location vide. Lancez d'abord /build-dim-location."
        }), 400

    # Charger weather_map depuis la DB (toute la table)
    rows = db.session.execute(
        text("SELECT weather_condition, temperature_c, visibility_km, weather_id FROM dim_weather")
    ).fetchall()
    builder.weather_map = {
        (
            r[0] or 'Inconnu',
            int(r[1]) if r[1] is not None else None,
            int(r[2]) if r[2] is not None else None,
        ): r[3]
        for r in rows
    }

    if not builder.weather_map:
        return jsonify({
            "error": f"dim_weather vide. Lancez d'abord /build-dim-weather."
        }), 400

    # Charger road_map depuis la DB
    row = db.session.execute(text("SELECT road_id FROM dim_road LIMIT 1")).fetchone()
    if not row:
        return jsonify({
            "error": "dim_road vide. Lancez d'abord /build-datamart-full ou créez l'entrée par défaut."
        }), 400
    builder.road_map = {tuple([False] * 13): row[0]}

    # Construire les faits
    result = builder.build_fact_accident()

    return jsonify({
        "message":       f"fact_accident construit pour {year}",
        "year":          year,
        "rows_inserted": result["rows_inserted"],
        "total_expected": result["total"],
        "batches":       result["batches"],
    }), 200


@datamart_bp.route("/build-datamart-full", methods=["POST"])
@jwt_required()
def build_datamart_full():
    """Exécute TOUTES les étapes séquentiellement (complet)"""
    data = request.get_json() or {}
    year = data.get("year")

    if not year:
        return jsonify({"error": "Année requise"}), 400

    # ✅ S'assurer que les contraintes UNIQUE existent avant les UPSERT
    ensure_dimension_constraints()

    builder = DatamartBuilder(int(year))
    result = builder.run_all()

    return jsonify({
        "message": f"Datamart complet construit pour {year}",
        "result":  result,
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
        raw_count_before = db.session.execute(
            text("SELECT COUNT(*) FROM accidents_raw WHERE EXTRACT(YEAR FROM start_time_raw::timestamp)::INTEGER = :year"),
            {"year": year_int},
        ).scalar()

        clean_count_before = db.session.execute(
            text("SELECT COUNT(*) FROM accidents_clean WHERE EXTRACT(YEAR FROM start_time)::INTEGER = :year"),
            {"year": year_int},
        ).scalar()

        fact_count_before = db.session.execute(
            text("""
                SELECT COUNT(*) FROM fact_accident
                WHERE start_time IS NOT NULL
                  AND EXTRACT(YEAR FROM start_time)::INTEGER = :year
            """),
            {"year": year_int},
        ).scalar()

        # Suppression dans l'ordre inverse des dépendances
        fact_deleted = db.session.execute(
            text("""
                DELETE FROM fact_accident
                WHERE start_time IS NOT NULL
                  AND EXTRACT(YEAR FROM start_time)::INTEGER = :year
            """),
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
            "year":    year_int,
            "deleted": {
                "fact_accident":   fact_deleted,
                "accidents_clean": clean_deleted,
                "accidents_raw":   raw_deleted,
            },
            "before": {
                "fact_accident":   fact_count_before,
                "accidents_clean": clean_count_before,
                "accidents_raw":   raw_count_before,
            },
        }), 200

    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ── Endpoint 4: Year pipeline status ──────────────────────────────────────────

@datamart_bp.route("/year-status", methods=["GET"])
@jwt_required()
def year_status():
    """Retourne l'état de chaque année dans le pipeline"""
    try:
        clean_years = db.session.execute(text("""
            SELECT DISTINCT EXTRACT(YEAR FROM start_time)::INTEGER as year
            FROM accidents_clean
            WHERE start_time IS NOT NULL
            ORDER BY year DESC
        """)).fetchall()

        if not clean_years:
            clean_years = db.session.execute(text("""
                SELECT DISTINCT EXTRACT(YEAR FROM start_time_raw::timestamp)::INTEGER as year
                FROM accidents_raw
                WHERE start_time_raw IS NOT NULL
                ORDER BY year DESC
            """)).fetchall()

        years_status = []
        for row in clean_years:
            year = row[0]

            raw_count = db.session.execute(
                text("SELECT COUNT(*) FROM accidents_raw WHERE EXTRACT(YEAR FROM start_time_raw::timestamp)::INTEGER = :year"),
                {"year": year}
            ).scalar() or 0

            clean_count = db.session.execute(
                text("SELECT COUNT(*) FROM accidents_clean WHERE EXTRACT(YEAR FROM start_time)::INTEGER = :year"),
                {"year": year}
            ).scalar() or 0

            # ✅ BUG 4 CORRIGÉ ici aussi : filtre sur start_time IS NOT NULL
            fact_count = db.session.execute(
                text("""
                    SELECT COUNT(*) FROM fact_accident
                    WHERE start_time IS NOT NULL
                      AND EXTRACT(YEAR FROM start_time)::INTEGER = :year
                """),
                {"year": year}
            ).scalar() or 0

            years_status.append({
                "year":         year,
                "raw_exists":   raw_count > 0,
                "clean_exists": clean_count > 0,
                "fact_exists":  fact_count > 0,
                "raw_count":    raw_count,
                "clean_count":  clean_count,
                "fact_count":   fact_count,
            })

        return jsonify({"years_status": years_status}), 200

    except Exception as e:
        print(f"[year-status] Error: {str(e)}")
        return jsonify({"error": str(e)}), 500


# ── Endpoint 5: Pipeline status global ─────────────────────────────────────────

@datamart_bp.route("/pipeline-status", methods=["GET"])
@jwt_required()
def pipeline_status():
    """Retourne l'état global du pipeline ETL"""
    try:
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

        if raw_count < 1000:
            raw_count   = db.session.execute(text("SELECT COUNT(*) FROM accidents_raw")).scalar() or 0
            clean_count = db.session.execute(text("SELECT COUNT(*) FROM accidents_clean")).scalar() or 0
            fact_count  = db.session.execute(text("SELECT COUNT(*) FROM fact_accident")).scalar() or 0

        print(f"[Pipeline] raw: {raw_count}, clean: {clean_count}, fact: {fact_count}")

        clean_complete        = clean_count > 0 and clean_count == raw_count
        completion_percentage = round(100.0 * fact_count / clean_count, 2) if clean_count > 0 else 0
        datamart_complete     = fact_count >= clean_count and clean_count > 0
        csv_exists            = raw_count > 0

        return jsonify({
            "csv_exists": csv_exists,
            "raw": {
                "exists":      raw_count > 0,
                "count":       raw_count,
                "is_complete": raw_count > 0,
            },
            "clean": {
                "exists":      clean_count > 0,
                "count":       clean_count,
                "is_complete": clean_complete,
            },
            "datamart": {
                "exists":                fact_count > 0,
                "count":                 fact_count,
                "expected_count":        clean_count,
                "completion_percentage": completion_percentage,
                "is_complete":           datamart_complete,
            },
        }), 200

    except Exception as e:
        print(f"[Pipeline] Error: {str(e)}")
        return jsonify({"error": str(e)}), 500