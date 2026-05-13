"""
etl.py — Flask blueprint for ETL steps 0-2
"""

import os
import time
import traceback
from datetime import datetime
import csv
import io

import pandas as pd
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import inspect as sa_inspect, text

from .. import db
from ..models import AccidentRaw, AccidentClean, ETLJob
from .job_manager import JobManager, JobManagerError

etl_bp = Blueprint("etl", __name__, url_prefix="/etl")

# ── Configuration ──────────────────────────────────────────────────────────────

# CORRECTION 3 — Batches plus grands pour moins d'itérations
BATCH_SIZE = 100_000   # pandas : 50K → 100K
DB_BATCH   = 20_000    # DB     :  5K →  20K

_analysis_cache: dict[str, dict] = {}
_cache_ts:       dict[str, float] = {}
CACHE_TTL = 3_600

# CORRECTION 1 — Suivi de progression en mémoire pour le polling
# Chaque job en cours écrit sa progression ici ; le frontend lit /etl/progress/<job_id>
_job_progress: dict[int, dict] = {}


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
        12: "Hiver",  1: "Hiver",  2: "Hiver",
         3: "Printemps", 4: "Printemps", 5: "Printemps",
         6: "Été",    7: "Été",    8: "Été",
         9: "Automne",10: "Automne",11: "Automne",
    }.get(month, "Inconnu")


def _time_of_day(hour: int) -> str:
    if 5  <= hour < 12: return "Matin"
    if 12 <= hour < 17: return "Après-midi"
    if 17 <= hour < 21: return "Soir"
    return "Nuit"


def _severity_label(sev: int) -> str:
    return {1: "Faible", 2: "Modérée", 3: "Élevée", 4: "Critique"}.get(sev, "Inconnu")


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


def _update_progress(job_id: int, **kwargs) -> None:
    """Met à jour la progression d'un job en mémoire."""
    if job_id not in _job_progress:
        _job_progress[job_id] = {}
    _job_progress[job_id].update(kwargs)
    _job_progress[job_id]["updated_at"] = time.time()


def _clear_progress(job_id: int) -> None:
    _job_progress.pop(job_id, None)


COLS_MAP = {
    "ID":                 "accident_id",
    "Start_Time":         "start_time_raw",
    "End_Time":           "end_time_raw",
    "City":               "city_raw",
    "State":              "state_raw",
    "Severity":           "severity_raw",
    "Temperature(F)":     "temperature_raw",
    "Visibility(mi)":     "visibility_raw",
    "Weather_Condition":  "weather_condition_raw",
    "Start_Lat":          "latitude_raw",
    "Start_Lng":          "longitude_raw",
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
    rows_processed:  int   = 0,
    rows_inserted:   int   = 0,
    rows_skipped:    int   = 0,
    error_message:   str | None = None,
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
        print(f"[ETL] Warning: could not update job row: {exc}")


# ── Upload & Analyse CSV ───────────────────────────────────────────────────────
# 1. Vérifier que le fichier est bien un CSV
# 2. Lire le fichier ligne par ligne avec csv.reader
# 3. Localiser la colonne 'Start_Time'
# 4. Extraire l'année de 'Start_Time' par slicing (val[:4]) pour éviter le parsing complet
# 5. Compter le nombre d'accidents par année dans un dict
# 6. Retourner les années disponibles et leur distribution, ainsi que des stats sur le fichier
@etl_bp.route("/upload-and-analyze-csv", methods=["POST"])
@jwt_required()
def upload_and_analyze_csv():
    start_time = time.time()

    try:
        if "file" not in request.files:
            return jsonify({"error": "No file field in request."}), 400

        f = request.files["file"]

        if not f.filename:
            return jsonify({"error": "No file selected."}), 400

        if not f.filename.lower().endswith(".csv"):
            return jsonify({"error": "Only .csv files are accepted."}), 415

        years_count: dict[int, int] = {}
        total_rows  = 0
        valid_rows  = 0

        stream = io.TextIOWrapper(f.stream, encoding='utf-8', errors='replace')
        reader = csv.reader(stream)
        start_time_col_index = None

        for i, row in enumerate(reader):

            # Première ligne : localiser Start_Time dynamiquement
            if i == 0:
                try:
                    start_time_col_index = row.index("Start_Time")
                except ValueError:
                    return jsonify({"error": "CSV missing 'Start_Time' column"}), 400
                continue

            total_rows += 1

            try:
                val = row[start_time_col_index]
                if not val or len(val) < 4:
                    continue

                # Extraction de l'année 
                # "2021-03-15 08:30:00" → "2021" → 2021
                year = int(val[:4])

                if year < 2000 or year > 2030:
                    continue

                years_count[year] = years_count.get(year, 0) + 1
                valid_rows += 1

            except (IndexError, ValueError):
                continue

        if not years_count:
            return jsonify({
                "error":              "No valid dates found in the Start_Time column.",
                "total_rows_scanned": total_rows
            }), 422

        analysis_time = time.time() - start_time

        return jsonify({
            "available_years":       sorted(years_count.keys()),
            "year_counts":           {str(k): v for k, v in sorted(years_count.items())},
            "total_rows_scanned":    total_rows,
            "valid_dates_found":     valid_rows,
            "analysis_time_seconds": round(analysis_time, 2),
            "filename":              f.filename,
            "size_mb":               round(f.content_length / 1_048_576, 2) if f.content_length else 0
        }), 200

    except MemoryError:
        return jsonify({"error": "Server ran out of memory while processing."}), 500
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Server error: {str(e)}"}), 500


# ── Step 1 — Load Raw ──────────────────────────────────────────────────────────
# 1. Charger les IDs existants (déduplication)
# 2. Lire le CSV par CHUNKS de 100 000 lignes 
# 3. Pour chaque chunk:                                      
    # a. Valider les colonnes requises                            
    # b. Convertir les dates (start_time, end_time)              
    # c. Extraire l'année pour filtrage                                                   
    # e. Convertir unités (température, visibilité)              
    # f. Vérifier les doublons (accident_id déjà existant)       
    # g. Insérer en BATCH via bulk_insert_mappings  
#  4. Mettre à jour la progression pour le frontend   → accessible via /etl/progress/<job_id>  

@etl_bp.route("/load-raw", methods=["POST"])
@jwt_required()
def load_raw():
    t0 = time.time()
    etl_job = _create_etl_job("load-raw")

    rows_inserted  = 0
    rows_processed = 0
    rows_skipped   = 0
    error_msg      = None
    status         = "failed"

    try:
        JobManager.register(etl_job.id, "load-raw")
    except JobManagerError as exc:
        _finish_etl_job(etl_job, status="failed", error_message=str(exc))
        return jsonify({"message": str(exc)}), 409

    try:
        path = _csv_path()
        if not os.path.exists(path):
            raise FileNotFoundError(f"CSV not found at '{path}'. Please upload first.")

        body       = request.get_json(silent=True) or {}
        raw_year   = body.get("year")
        target_year = int(raw_year) if raw_year and raw_year != "all" else None
        filter_desc = f"year = {target_year}" if target_year else "all years"

        # Charger les IDs existants via un SET SQL
        print("[load-raw] Loading existing accident IDs...")
        existing_ids = set()
        result = db.session.execute(
            text("SELECT accident_id FROM accidents_raw WHERE accident_id IS NOT NULL")
        )

        existing_ids = {row[0] for row in result}
        print(f"[load-raw] {len(existing_ids):,} existing records found")

        # Initialisation de la progression pour le polling
        _update_progress(etl_job.id,
            stage="loading",
            rows_processed=0,
            rows_inserted=0,
            rows_skipped=0,
            chunk=0,
        )

        year_stats          = {}
        missing_cols_reported = False
        chunk_idx           = 0


        for chunk_idx, chunk in enumerate(pd.read_csv(
            path,
            chunksize=BATCH_SIZE,       # 100K lignes par chunk
            usecols=list(COLS_MAP.keys()),  # Lire uniquement les colonnes nécessaires
            on_bad_lines="skip",
            engine="c",                 # Parser C natif
            dtype=str,                  # Pas d'inférence de type — on cast manuellement
        )):
            if not missing_cols_reported:
                missing = [c for c in COLS_MAP if c not in chunk.columns]
                if missing:
                    raise ValueError(f"Missing required columns: {missing}")
                missing_cols_reported = True

            chunk = chunk.rename(columns=COLS_MAP)
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
            chunk["end_time_raw"]   = pd.to_datetime(
                chunk["end_time_raw"], errors="coerce"
            ).dt.strftime("%Y-%m-%d %H:%M:%S")

            # CORRECTION 7 — bulk_insert_mappings au lieu de bulk_save_objects
            # Travaille avec des dicts simples, pas d'objets SQLAlchemy → 2-3x plus rapide
            mappings = []
            for row in chunk.itertuples(index=False):
                rows_processed += 1
                aid = str(row.accident_id) if pd.notna(row.accident_id) else None
                if not aid or aid in existing_ids:
                    rows_skipped += 1
                    continue
                existing_ids.add(aid)

                mappings.append({
                    "accident_id":           aid,
                    "start_time_raw":        row.start_time_raw if pd.notna(row.start_time_raw) else None,
                    "end_time_raw":          row.end_time_raw   if pd.notna(row.end_time_raw)   else None,
                    "city_raw":              str(row.city_raw)  if pd.notna(row.city_raw)       else None,
                    "state_raw":             str(row.state_raw) if pd.notna(row.state_raw)      else None,
                    "severity_raw":          _safe_int(row.severity_raw),
                    "temperature_raw":       _safe_float(row.temperature_raw),
                    "visibility_raw":        _safe_float(row.visibility_raw),
                    "weather_condition_raw": str(row.weather_condition_raw) if pd.notna(row.weather_condition_raw) else None,
                    "latitude_raw":          _safe_float(row.latitude_raw),
                    "longitude_raw":         _safe_float(row.longitude_raw),
                })

            if mappings:
                db.session.bulk_insert_mappings(AccidentRaw, mappings)
                db.session.commit()
                rows_inserted += len(mappings)

            # CORRECTION 4 — Print uniquement tous les 10 chunks
            # au lieu de chaque chunk → moins de bruit dans les logs
            if chunk_idx % 10 == 0:
                print(f"[load-raw] Chunk {chunk_idx + 1}: {rows_inserted:,} inserted so far")

            # CORRECTION 1 — Mise à jour de la progression pour le polling
            _update_progress(etl_job.id,
                stage="loading",
                rows_processed=rows_processed,
                rows_inserted=rows_inserted,
                rows_skipped=rows_skipped,
                chunk=chunk_idx + 1,
                elapsed_seconds=round(time.time() - t0, 1),
            )

        status = "success"
        return jsonify({
            "message":          f"Raw data appended ({filter_desc})",
            "filter_applied":   filter_desc,
            "rows_inserted":    rows_inserted,
            "rows_processed":   rows_processed,
            "rows_skipped":     rows_skipped,
            "year_distribution": year_stats,
        }), 201

    except Exception as exc:
        error_msg = str(exc)
        traceback.print_exc()
        db.session.rollback()
        return jsonify({"message": "Unexpected error during load-raw.", "detail": error_msg}), 500
    finally:
        JobManager.unregister(etl_job.id)
        _clear_progress(etl_job.id)
        _finish_etl_job(etl_job, status=status,
                        rows_processed=rows_processed, rows_inserted=rows_inserted,
                        rows_skipped=rows_skipped, error_message=error_msg,
                        duration_seconds=time.time() - t0)


# ── Step 2 — Build Clean ───────────────────────────────────────────────────────
# 1. Pré-calcul des médianes pour l'imputation des NULL 
# 2. Charger les IDs clean existants en set pour éviter les doublons
# 3. Lire les données raw par BATCH de 20K lignes
# 4. Pour chaque batch :
    # a. Imputer les valeurs manquantes (température, visibilité, durée)
    # b. Convertir les unités (température en °C, visibilité en km)
    # c. Extraire les features temporelles (saison, time_of_day)
    # d. Insérer en BATCH dans la table clean via bulk_insert_mappings

@etl_bp.route("/build-clean", methods=["POST"])
@jwt_required()
def build_clean():
    t0 = time.time()
    etl_job = _create_etl_job("build-clean")

    rows_inserted  = 0
    rows_processed = 0
    rows_skipped   = 0
    error_msg      = None
    status         = "failed"

    try:
        JobManager.register(etl_job.id, "build-clean")
    except JobManagerError as exc:
        _finish_etl_job(etl_job, status="failed", error_message=str(exc))
        return jsonify({"message": str(exc)}), 409

    try:
        raw_count = db.session.query(AccidentRaw).count()
        if raw_count == 0:
            raise ValueError("No raw data found — run /etl/load-raw first.")

        # ── Pré-calcul des médianes pour l'imputation ─────────────────────────
        print("[build-clean] Calcul des médianes pour l'imputation des NULL...")

        temp_by_season = {}
        temp_rows = db.session.execute(text("""
            SELECT
                CASE
                    WHEN EXTRACT(MONTH FROM start_time_raw::timestamp) IN (3,4,5)   THEN 'Printemps'
                    WHEN EXTRACT(MONTH FROM start_time_raw::timestamp) IN (6,7,8)   THEN 'Été'
                    WHEN EXTRACT(MONTH FROM start_time_raw::timestamp) IN (9,10,11) THEN 'Automne'
                    ELSE 'Hiver'
                END AS season,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY temperature_raw) AS median_temp
            FROM accidents_raw
            WHERE temperature_raw IS NOT NULL AND start_time_raw IS NOT NULL
            GROUP BY season
        """))
        for row in temp_rows:
            temp_by_season[row[0]] = row[1]

        temp_global = db.session.execute(text(
            "SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY temperature_raw) "
            "FROM accidents_raw WHERE temperature_raw IS NOT NULL"
        )).scalar()
        print(f"[build-clean]   Médianes température (°F): {temp_by_season}")

        vis_by_weather = {}
        vis_rows = db.session.execute(text("""
            SELECT
                weather_condition_raw,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY visibility_raw) AS median_vis
            FROM accidents_raw
            WHERE visibility_raw IS NOT NULL AND weather_condition_raw IS NOT NULL
            GROUP BY weather_condition_raw
        """))
        for row in vis_rows:
            vis_by_weather[row[0]] = row[1]

        vis_global = db.session.execute(text(
            "SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY visibility_raw) "
            "FROM accidents_raw WHERE visibility_raw IS NOT NULL"
        )).scalar()
        print(f"[build-clean]   Médiane visibilité globale (miles): {vis_global:.2f}")

        duration_global_median = db.session.execute(text("""
            SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (
                ORDER BY EXTRACT(EPOCH FROM (
                    end_time_raw::timestamp - start_time_raw::timestamp
                )) / 60
            )
            FROM accidents_raw
            WHERE start_time_raw IS NOT NULL
              AND end_time_raw IS NOT NULL
              AND end_time_raw::timestamp > start_time_raw::timestamp
              AND EXTRACT(EPOCH FROM (
                    end_time_raw::timestamp - start_time_raw::timestamp
                  )) / 60 < 10000
        """)).scalar()
        print(f"[build-clean]   Médiane durée globale (min): {duration_global_median:.1f}")

        def _impute_temp(temp_raw, season):
            return temp_raw if temp_raw is not None else temp_by_season.get(season, temp_global)

        def _impute_vis(vis_raw, weather):
            return vis_raw if vis_raw is not None else vis_by_weather.get(weather, vis_global)

        # CORRECTION 2 — Charger les IDs clean existants en set
        print("[build-clean] Loading existing clean accident IDs...")
        existing_clean_ids = {
            row[0] for row in db.session.execute(
                text("SELECT accident_id FROM accidents_clean")
            )
        }
        print(f"[build-clean] {len(existing_clean_ids):,} existing clean records found")

        # Initialisation progression
        _update_progress(etl_job.id,
            stage="cleaning",
            total_raw=raw_count,
            rows_processed=0,
            rows_inserted=0,
            rows_skipped=0,
            batch=0,
        )

        last_id     = None
        clean_batch = []
        seen_in_run = set()
        query       = db.session.query(AccidentRaw).order_by(AccidentRaw.accident_id)
        batch_count = 0

        while True:
            if last_id:
                batch = query.filter(AccidentRaw.accident_id > last_id).limit(DB_BATCH).all()
            else:
                batch = query.limit(DB_BATCH).all()

            if not batch:
                break

            batch_count += 1
            last_id = batch[-1].accident_id

            new_rows = [
                row for row in batch
                if row.accident_id not in existing_clean_ids
                and row.accident_id not in seen_in_run
            ]

            for row in new_rows:
                seen_in_run.add(row.accident_id)
                rows_processed += 1

                start_dt = _parse_dt(row.start_time_raw)
                if start_dt is None or row.severity_raw is None:
                    rows_skipped += 1
                    continue

                end_dt       = _parse_dt(row.end_time_raw)
                duration_min = None
                if end_dt and start_dt:
                    delta = (end_dt - start_dt).total_seconds() / 60
                    duration_min = round(delta, 1) if 0 < delta < 10_000 else None
                if duration_min is None:
                    duration_min = round(duration_global_median, 1) if duration_global_median else None

                season           = _season(start_dt.month)
                temp_raw_imputed = _impute_temp(row.temperature_raw, season)
                vis_raw_imputed  = _impute_vis(row.visibility_raw, row.weather_condition_raw)

                # CORRECTION 7 — dict au lieu d'objet SQLAlchemy
                clean_batch.append({
                    "accident_id":       row.accident_id,
                    "start_time":        start_dt,
                    "end_time":          end_dt,
                    "severity":          row.severity_raw,
                    "severity_label":    _severity_label(row.severity_raw),
                    "city":              row.city_raw,
                    "state":             row.state_raw,
                    "temperature_c":     _f_to_c(temp_raw_imputed),
                    "visibility_km":     _mi_to_km(vis_raw_imputed),
                    "weather_condition": row.weather_condition_raw,
                    "latitude":          row.latitude_raw,
                    "longitude":         row.longitude_raw,
                    "season":            season,
                    "time_of_day":       _time_of_day(start_dt.hour),
                    "duration_min":      duration_min,
                })

                if len(clean_batch) >= 5_000:
                    db.session.bulk_insert_mappings(AccidentClean, clean_batch)
                    db.session.commit()
                    rows_inserted += len(clean_batch)
                    clean_batch    = []

            # Flush le reste du batch DB courant
            if clean_batch:
                db.session.bulk_insert_mappings(AccidentClean, clean_batch)
                db.session.commit()
                rows_inserted += len(clean_batch)
                clean_batch    = []

            # CORRECTION 4 — Log tous les 50 batches seulement
            if batch_count % 50 == 0:
                print(f"[build-clean] Batch {batch_count}: {rows_inserted:,} inserted")

            # CORRECTION 1 — Mise à jour progression
            _update_progress(etl_job.id,
                stage="cleaning",
                total_raw=raw_count,
                rows_processed=rows_processed,
                rows_inserted=rows_inserted,
                rows_skipped=rows_skipped,
                batch=batch_count,
                pct=round(rows_processed / raw_count * 100, 1) if raw_count else 0,
                elapsed_seconds=round(time.time() - t0, 1),
            )

        print(f"[build-clean] ✅ Done — {rows_inserted:,} inserted in {batch_count} batches")

        # Contrainte UNIQUE défensive
        try:
            db.session.execute(text(
                "ALTER TABLE accidents_clean "
                "ADD CONSTRAINT unique_accident_id_clean UNIQUE (accident_id)"
            ))
            db.session.commit()
        except Exception:
            db.session.rollback()

        status  = "success"
        elapsed = time.time() - t0
        return jsonify({
            "message":         "Clean data built successfully.",
            "rows_inserted":   rows_inserted,
            "rows_processed":  rows_processed,
            "rows_skipped":    rows_skipped,
            "duration_seconds": round(elapsed, 2),
        }), 201

    except Exception as exc:
        error_msg = str(exc)
        traceback.print_exc()
        db.session.rollback()
        return jsonify({"message": "Unexpected error during build-clean.", "detail": error_msg}), 500
    finally:
        JobManager.unregister(etl_job.id)
        _clear_progress(etl_job.id)
        _finish_etl_job(etl_job, status=status,
                        rows_processed=rows_processed, rows_inserted=rows_inserted,
                        rows_skipped=rows_skipped, error_message=error_msg,
                        duration_seconds=time.time() - t0)


# Endpoint de progression pour le frontend ─────────────────
# 1. Pendant l'exécution, le backend écrit dans _job_progress[etl_job.id]
# 2. Le frontend appelle /progress/<id> toutes les 2 secondes
# 3. Retourne des métriques en temps réel sans requêtes SQL lourdes

@etl_bp.route("/progress/<int:job_id>", methods=["GET"])
@jwt_required()
def get_progress(job_id: int):
    """
    Endpoint léger pour le polling frontend.
    Le frontend appelle cette route toutes les 2s pendant un ETL long
    au lieu de poller /pipeline-status qui fait 3 COUNT(*) sur des millions de lignes.
    Retourne la progression en mémoire — aucune requête SQL.
    """
    progress = _job_progress.get(job_id)
    if progress is None:
        # Job terminé ou inexistant — le frontend peut arrêter de poller
        return jsonify({"active": False}), 200
    return jsonify({"active": True, **progress}), 200


# ── Pipeline Status :Donner une vue d'ensemble complète de l'état des données.────────────────────────────────────────────────────────────

@etl_bp.route("/pipeline-status", methods=["GET"])
@jwt_required()
def pipeline_status():
    """Retourne l'état global du pipeline ETL"""
    from ..models import FactAccident
    
    # ✅ Vérification réelle : le CSV est considéré importé SI accidents_raw a des données
    raw_count = db.session.query(AccidentRaw).count()
    csv_exists = raw_count > 0  # ← Correction clé
    
    try:
        clean_count = db.session.query(AccidentClean).count() if raw_count > 0 else 0
        fact_count = db.session.query(FactAccident).count() if clean_count > 0 else 0
    except Exception as exc:
        return jsonify({"message": "Database error.", "detail": str(exc)}), 500

    def _last_job(name: str):
        j = ETLJob.query.filter_by(name=name).order_by(ETLJob.created_at.desc()).first()
        if not j:
            return None
        return {
            "status":           j.status,
            "rows_inserted":    j.rows_inserted or 0,
            "completed_at":     j.completed_at.isoformat() if j.completed_at else None,
            "duration_seconds": j.duration_seconds or 0,
        }

    def _recommended():
        if not csv_exists:   return "upload"
        if raw_count == 0:   return "load-raw"
        if clean_count == 0: return "build-clean"
        if fact_count != clean_count: return "build-datamart"
        return "complete"

    missing_dm = max(0, clean_count - fact_count)
    pct_dm     = round(fact_count / clean_count * 100, 2) if clean_count else 0

    return jsonify({
        "csv_exists": csv_exists,
        "raw": {
            "exists": raw_count > 0,
            "count": raw_count,
            "is_complete": raw_count > 0,
            "last_job": _last_job("load-raw")
        },
        "clean": {
            "exists": clean_count > 0,
            "count": clean_count,
            "is_complete": clean_count > 0,
            "last_job": _last_job("build-clean")
        },
        "datamart": {
            "exists": fact_count > 0,
            "count": fact_count,
            "expected_count": clean_count,
            "is_complete": fact_count == clean_count,
            "missing_records": missing_dm,
            "completion_percentage": pct_dm,
            "last_job": _last_job("build-datamart")
        },
        "recommended_action": _recommended(),
    }), 200





# ── Job History : Retourner les 20 dernières exécutions ETL.────────────────────────────────────────────────────────────────

@etl_bp.route("/job-history", methods=["GET"])
@jwt_required()
def get_job_history():
    try:
        jobs = ETLJob.query.order_by(ETLJob.created_at.desc()).limit(20).all()
        return jsonify({
            "total_jobs": len(jobs),
            "jobs": [{
                "id":               j.id,
                "name":             j.name,
                "status":           j.status,
                "rows_processed":   j.rows_processed  or 0,
                "rows_inserted":    j.rows_inserted    or 0,
                "rows_skipped":     j.rows_skipped     or 0,
                "error_message":    j.error_message,
                "duration_seconds": j.duration_seconds or 0,
                "created_at":       j.created_at.isoformat() if j.created_at else None,
            } for j in jobs],
        }), 200
    except Exception as exc:
        return jsonify({"message": "Failed to fetch job history.", "detail": str(exc)}), 500


# ── Running Jobs :Lister toutes les tâches ETL actuellement en exécution. ───────────────────────────────────────────────────────────────

@etl_bp.route("/running-jobs", methods=["GET"])
@jwt_required()
def get_running_jobs():
    live = JobManager.get_running()
    return jsonify({"running_jobs": live}), 200


