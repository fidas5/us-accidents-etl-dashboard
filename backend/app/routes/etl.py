from flask import Blueprint, jsonify
import os
import pandas as pd
from datetime import datetime
from flask_jwt_extended import jwt_required
from .. import db
from ..models import AccidentRaw, AccidentClean

etl_bp = Blueprint("etl", __name__, url_prefix="/etl")


def _get_csv_path():
    """
    Retourne le chemin absolu vers le fichier CSV d'échantillon.
    """
    base_dir = os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    )
    # nouveau nom de fichier
    return os.path.join(base_dir, "data", "us_accidents_sample.csv")

@etl_bp.route("/load-raw", methods=["POST"])
def load_raw():
    """
    Étape 1 : charge le CSV dans la table accidents_raw (staging) en chunks.
    """
    csv_path = _get_csv_path()

    if not os.path.exists(csv_path):
        return jsonify({"message": f"CSV file not found at {csv_path}"}), 400

    db.session.query(AccidentRaw).delete()
    db.session.commit()

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

    total_inserted = 0
    CHUNK_SIZE = 50_000

    try:
        for chunk in pd.read_csv(
            csv_path,
            sep=",",
            engine="python",
            on_bad_lines="skip",
            chunksize=CHUNK_SIZE,
        ):
            missing_cols = [c for c in cols_map.keys() if c not in chunk.columns]
            if missing_cols:
                return jsonify(
                    {"message": "Missing columns in CSV", "missing": missing_cols}
                ), 400

            chunk = chunk[list(cols_map.keys())].rename(columns=cols_map)

            chunk["start_time_raw"] = pd.to_datetime(chunk["start_time_raw"], errors="coerce")
            chunk = chunk[
                (chunk["start_time_raw"].dt.year == 2022)
            ]
            chunk["start_time_raw"] = chunk["start_time_raw"].dt.strftime("%Y-%m-%d %H:%M:%S")

            if chunk.empty:
                continue

            # Apply same clean conversion to end_time_raw
            chunk["end_time_raw"] = pd.to_datetime(chunk["end_time_raw"], errors="coerce")
            chunk["end_time_raw"] = chunk["end_time_raw"].dt.strftime("%Y-%m-%d %H:%M:%S")

            records = []
            for _, row in chunk.iterrows():
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
                    weather_condition_raw=row["weather_condition_raw"]
                    if not pd.isna(row["weather_condition_raw"])
                    else None,
                    latitude_raw=float(row["latitude_raw"])
                    if not pd.isna(row["latitude_raw"])
                    else None,
                    longitude_raw=float(row["longitude_raw"])
                    if not pd.isna(row["longitude_raw"])
                    else None,
                )
                records.append(record)

            if records:
                db.session.bulk_save_objects(records)
                db.session.commit()
                total_inserted += len(records)
                print(f"Inserted chunk with {len(records)} rows")

    except Exception as e:
        db.session.rollback()
        return jsonify({"message": "error reading CSV", "detail": str(e)}), 500

    if total_inserted == 0:
        return jsonify({"message": "no records to insert in raw"}), 400

    return jsonify(
        {"message": "raw data loaded", "rows_inserted": total_inserted}
    ), 201

@etl_bp.route("/upload-csv", methods=["POST"])
@jwt_required()
def upload_csv():
    if "file" not in request.files:
        return jsonify({"message": "No file provided"}), 400
    file = request.files["file"]
    if not file.filename.endswith(".csv"):
        return jsonify({"message": "Only .csv files accepted"}), 400
    save_path = _get_csv_path()
    file.save(save_path)
    return jsonify({"message": f"File '{file.filename}' uploaded successfully"}), 200

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