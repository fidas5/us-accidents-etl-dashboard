"""
predict.py - API endpoints for severity prediction
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
import os

from ..ml.model_trainer import SeverityPredictor

predict_bp = Blueprint("predict", __name__, url_prefix="/api/predict")

_predictor = None


def get_predictor() -> SeverityPredictor:
    """Singleton loader — loads model once on first call."""
    global _predictor
    if _predictor is None:
        model_dir         = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ml')
        model_path        = os.path.join(model_dir, 'severity_model.pkl')
        preprocessor_path = os.path.join(model_dir, 'preprocessor.pkl')

        _predictor = SeverityPredictor()

        if os.path.exists(model_path) and os.path.exists(preprocessor_path):
            _predictor.load(model_path, preprocessor_path)
            print("[Predict API] ✅ Model loaded successfully")
        else:
            print("[Predict API] ⚠️  Model not found — "
                  "run: python scripts/train_model.py")
    return _predictor


# ── Health ────────────────────────────────────────────────────────────────────

@predict_bp.route("/health", methods=["GET"])
def health():
    predictor = get_predictor()
    loaded    = predictor.model is not None
    return jsonify({
        "status":       "ok",
        "model_loaded": loaded,
        "message":      "Model ready" if loaded else "Model not trained yet",
        "thresholds":   predictor.thresholds if loaded else None,
    }), 200


# ── Single prediction ─────────────────────────────────────────────────────────

@predict_bp.route("/severity", methods=["POST"])
@jwt_required()
def predict_severity():
    """
    Predict severity for a single accident.

    Required fields: state, weather_condition
    Optional fields: temperature_c, visibility_km, season, time_of_day,
                     hour, month, day_of_week, is_weekend,
                     amenity, bump, crossing, give_way, junction, no_exit,
                     railway, roundabout, station, stop, traffic_calming,
                     traffic_signal, turning_loop
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    missing = [f for f in ['state', 'weather_condition'] if f not in data]
    if missing:
        return jsonify({"error": f"Missing required fields: {missing}"}), 400

    predictor = get_predictor()
    if predictor.model is None:
        return jsonify({"error": "Model not trained yet"}), 503

    try:
        prediction_input = _build_input(data)
        result = predictor.predict_single(prediction_input)
        return jsonify({"success": True, "prediction": result}), 200
    except Exception as e:
        return jsonify({"error": f"Prediction failed: {str(e)}"}), 500


# ── Batch prediction ──────────────────────────────────────────────────────────

@predict_bp.route("/batch", methods=["POST"])
@jwt_required()
def predict_batch():
    """Predict severity for a list of accidents."""
    data = request.get_json()
    if not data or 'accidents' not in data:
        return jsonify({"error": "No accidents data provided"}), 400

    accidents = data.get('accidents', [])
    if not accidents:
        return jsonify({"error": "Empty accidents list"}), 400

    predictor = get_predictor()
    if predictor.model is None:
        return jsonify({"error": "Model not trained yet"}), 503

    results = []
    for accident in accidents:
        try:
            results.append(predictor.predict_single(_build_input(accident)))
        except Exception as e:
            results.append({"error": str(e)})

    return jsonify({"success": True, "predictions": results,
                    "count": len(results)}), 200


# ── Feature importance ────────────────────────────────────────────────────────

@predict_bp.route("/feature-importance", methods=["GET"])
@jwt_required()
def get_feature_importance():
    predictor = get_predictor()
    if predictor.model is None:
        return jsonify({"error": "Model not trained yet"}), 503
    return jsonify({"feature_importance": predictor.get_feature_importance()}), 200


# ── Model info ────────────────────────────────────────────────────────────────

@predict_bp.route("/model-info", methods=["GET"])
@jwt_required()
def model_info():
    """Return model metadata including calibrated thresholds."""
    predictor = get_predictor()
    if predictor.model is None:
        return jsonify({"error": "Model not trained yet"}), 503

    rf = predictor.model
    return jsonify({
        "model_type":          "RandomForestClassifier",
        "n_estimators":        rf.n_estimators,
        "max_depth":           rf.max_depth,
        "class_weight":        str(rf.class_weight),
        "oob_score":           round(float(rf.oob_score_), 4),
        "n_features":          int(rf.n_features_in_),
        "calibrated_thresholds": predictor.thresholds,
        "prediction_rule":     (
            "P(1)>t1 → Sev1 | P(4)>t4 → Sev4 | "
            "P(3)>t3 → Sev3 | else → Sev2"
        ),
    }), 200


# ── Severity explanation ──────────────────────────────────────────────────────

@predict_bp.route("/explain/<int:severity>", methods=["GET"])
@jwt_required()
def explain_severity(severity: int):
    explanations = {
        1: {
            "name":             "Low",
            "description":      "Minor accident with minimal damage. "
                                "No or very minor injuries.",
            "typical_duration": "30–60 minutes",
            "recommendation":   "Standard traffic management required.",
        },
        2: {
            "name":             "Moderate",
            "description":      "Medium severity with possible injuries. "
                                "May cause traffic delays.",
            "typical_duration": "60–120 minutes",
            "recommendation":   "Emergency services may be needed. "
                                "Traffic diversion recommended.",
        },
        3: {
            "name":             "High",
            "description":      "Serious accident with confirmed injuries. "
                                "Significant traffic disruption.",
            "typical_duration": "120–180 minutes",
            "recommendation":   "Immediate emergency response. "
                                "Road closure likely.",
        },
        4: {
            "name":             "Critical",
            "description":      "Severe accident with major injuries or fatalities. "
                                "Complete road closure.",
            "typical_duration": "180+ minutes",
            "recommendation":   "Maximum emergency response. "
                                "Full scene investigation required.",
        },
    }
    if severity not in explanations:
        return jsonify({"error": f"Invalid severity {severity}. "
                                  "Valid values: 1, 2, 3, 4"}), 400
    return jsonify(explanations[severity]), 200


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_input(data: dict) -> dict:
    """
    Normalise raw request dict into the format the preprocessor expects.
    Road infrastructure fields default to False (absent = not at that feature).
    """
    road_flags = ['amenity', 'bump', 'crossing', 'give_way', 'junction',
                  'no_exit', 'railway', 'roundabout', 'station', 'stop',
                  'traffic_calming', 'traffic_signal', 'turning_loop']
    inp = {
        'state':             data.get('state', 'Unknown'),
        'weather_condition': data.get('weather_condition', 'Unknown'),
        'temperature_c':     float(data.get('temperature_c', 20.0)),
        'visibility_km':     float(data.get('visibility_km', 10.0)),
        'season':            data.get('season', 'Summer'),
        'time_of_day':       data.get('time_of_day', 'Afternoon'),
        'hour':              int(data.get('hour', 12)),
        'month':             int(data.get('month', 6)),
        'day_of_week':       int(data.get('day_of_week', 2)),
        'is_weekend':        bool(data.get('is_weekend', False)),
    }
    for flag in road_flags:
        inp[flag] = bool(data.get(flag, False))
    return inp