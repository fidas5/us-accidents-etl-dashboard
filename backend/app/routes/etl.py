from flask import Blueprint, jsonify
import os
import pandas as pd
from datetime import datetime

from .. import db
from ..models import AccidentRaw, AccidentClean

etl_bp = Blueprint("etl", __name__, url_prefix="/etl")


def _get_csv_path():
    """
    Retourne le chemin absolu vers le fichier CSV d'échantillon.
    """
    # base_dir = dossier "backend"
    base_dir = os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    )
    return os.path.join(base_dir, "data", "us_accidents_small.csv")


@etl_bp.route("/load-raw", methods=["POST"])
def load_raw():
    """
    Étape 1 : charge le CSV dans la table accidents_raw (staging).
    """
    csv_path = _get_csv_path()

    if not os.path.exists(csv_path):
        return jsonify({"message": f"CSV file not found at {csv_path}"}), 400

    try:
        df = pd.read_csv(
            csv_path,
            sep=",",
            engine="python",
            on_bad_lines="skip",
        )
    except Exception as e:
        return jsonify({"message": "error reading CSV", "detail": str(e)}), 500

    cols_map = {
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

    missing_cols = [c for c in cols_map.keys() if c not in df.columns]
    if missing_cols:
        return jsonify(
            {"message": "Missing columns in CSV", "missing": missing_cols}
        ), 400

    df = df[list(cols_map.keys())].rename(columns=cols_map)

    # Limiter pour éviter les blocages pendant le dev
    df = df.head(2000)

    # On vide la table raw avant de recharger
    db.session.query(AccidentRaw).delete()

    records = []
    for _, row in df.iterrows():
        record = AccidentRaw(
            accident_id=row["accident_id"],
            start_time_raw=str(row["start_time_raw"]),
            end_time_raw=str(row["end_time_raw"]),
            city_raw=row["city_raw"],
            state_raw=row["state_raw"],
            severity_raw=int(row["severity_raw"])
            if not pd.isna(row["severity_raw"])
            else None,
            temperature_raw=None
            if pd.isna(row["temperature_raw"])
            else float(row["temperature_raw"]),
            visibility_raw=None
            if pd.isna(row["visibility_raw"])
            else float(row["visibility_raw"]),
            weather_condition_raw=row["weather_condition_raw"],
            latitude_raw=float(row["latitude_raw"])
            if not pd.isna(row["latitude_raw"])
            else None,
            longitude_raw=float(row["longitude_raw"])
            if not pd.isna(row["longitude_raw"])
            else None,
        )
        records.append(record)

    if not records:
        return jsonify({"message": "no records to insert in raw"}), 400

    db.session.bulk_save_objects(records)
    db.session.commit()

    return jsonify(
        {"message": "raw data loaded", "rows_inserted": len(records)}
    ), 201


@etl_bp.route("/build-clean", methods=["POST"])
def build_clean():
    """
    Étape 2 : transforme accidents_raw en accidents_clean (nettoyé).
    """
    # On vide la table clean avant de reconstruire
    db.session.query(AccidentClean).delete()

    raw_rows = AccidentRaw.query.all()
    if not raw_rows:
        return jsonify(
            {"message": "no raw data found, run /etl/load-raw first"}
        ), 400

    records = []
    for row in raw_rows:
        # Parsing des dates (format ISO de Kaggle, ex: 2019-01-01 12:34:56)
        try:
            start_time = datetime.fromisoformat(
                str(row.start_time_raw).replace("Z", "")
            )
        except Exception:
            continue  # on ignore les lignes invalides

        try:
            end_time = datetime.fromisoformat(
                str(row.end_time_raw).replace("Z", "")
            )
        except Exception:
            end_time = None

        if row.severity_raw is None:
            continue

        clean = AccidentClean(
            accident_id=row.accident_id,
            start_time=start_time,
            end_time=end_time,
            severity=row.severity_raw,
            city=row.city_raw,
            state=row.state_raw,
            temperature=row.temperature_raw,
            visibility=row.visibility_raw,
            weather_condition=row.weather_condition_raw,
            latitude=row.latitude_raw,
            longitude=row.longitude_raw,
        )
        records.append(clean)

    if not records:
        return jsonify(
            {"message": "no valid records to insert in clean"}
        ), 400

    db.session.bulk_save_objects(records)
    db.session.commit()

    return jsonify(
        {"message": "clean data built from raw", "rows_inserted": len(records)}
    ), 201