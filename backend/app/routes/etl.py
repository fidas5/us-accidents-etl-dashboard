from flask import Blueprint, jsonify
import os
import pandas as pd
from .. import db
from ..models import AccidentClean

etl_bp = Blueprint("etl", __name__, url_prefix="/etl")


@etl_bp.route("/load-sample", methods=["GET", "POST"])
def load_sample():
    # base_dir = dossier "backend"
    base_dir = os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    )
    csv_path = os.path.join(base_dir, "data", "us_accidents_small.csv")

    if not os.path.exists(csv_path):
        return jsonify({"message": f"CSV file not found at {csv_path}"}), 400

    try:
        df = pd.read_csv(
            csv_path,
            sep=",",
            engine="python",
            on_bad_lines="skip"
        )
    except Exception as e:
        return jsonify({"message": "error reading CSV", "detail": str(e)}), 500

    cols_map = {
        "ID": "accident_id",
        "Start_Time": "start_time",
        "End_Time": "end_time",
        "Severity": "severity",
        "City": "city",
        "State": "state",
        "Temperature(F)": "temperature",
        "Visibility(mi)": "visibility",
        "Weather_Condition": "weather_condition",
        "Start_Lat": "latitude",
        "Start_Lng": "longitude",
    }

    missing_cols = [c for c in cols_map.keys() if c not in df.columns]
    if missing_cols:
        return jsonify({"message": "Missing columns in CSV", "missing": missing_cols}), 400

    df = df[list(cols_map.keys())].rename(columns=cols_map)

    df["start_time"] = pd.to_datetime(df["start_time"], errors="coerce")
    df["end_time"] = pd.to_datetime(df["end_time"], errors="coerce")
    df = df.dropna(subset=["start_time", "end_time", "severity"])

    # On limite pour éviter les blocages
    df = df.head(2000)

    records = []
    for _, row in df.iterrows():
        record = AccidentClean(
            accident_id=row["accident_id"],
            start_time=row["start_time"],
            end_time=row["end_time"],
            severity=int(row["severity"]),
            city=row["city"],
            state=row["state"],
            temperature=None if pd.isna(row["temperature"]) else float(row["temperature"]),
            visibility=None if pd.isna(row["visibility"]) else float(row["visibility"]),
            weather_condition=row["weather_condition"],
            latitude=float(row["latitude"]) if not pd.isna(row["latitude"]) else None,
            longitude=float(row["longitude"]) if not pd.isna(row["longitude"]) else None,
        )
        records.append(record)

    if not records:
        return jsonify({"message": "no records to insert"}), 400

    db.session.bulk_save_objects(records)
    db.session.commit()

    return jsonify({"message": "sample data loaded", "rows_inserted": len(records)}), 201