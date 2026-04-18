from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
import joblib
import numpy as np
import os

predict_bp = Blueprint("predict", __name__, url_prefix="/api")

ML_DIR  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ml")
_model   = None
_encoder = None

def get_model():
    global _model, _encoder
    if _model is None:
        model_path   = os.path.join(ML_DIR, "rf_model.pkl")
        encoder_path = os.path.join(ML_DIR, "weather_encoder.pkl")
        if not os.path.exists(model_path):
            raise FileNotFoundError("Model not trained yet. Run python -m app.ml.train first.")
        _model   = joblib.load(model_path)
        _encoder = joblib.load(encoder_path)
    return _model, _encoder


@predict_bp.route("/predict", methods=["POST"])
@jwt_required()
def predict():
    data = request.get_json() or {}

    required = ["temperature", "visibility", "weather_condition", "hour", "latitude", "longitude"]
    missing  = [f for f in required if data.get(f) is None]
    if missing:
        return jsonify({"message": f"Missing fields: {', '.join(missing)}"}), 400

    try:
        model, encoder = get_model()

        weather_raw = data["weather_condition"]
        weather_enc = encoder.transform([weather_raw])[0] if weather_raw in encoder.classes_ else 0

        features = np.array([[
            float(data["temperature"]),
            float(data["visibility"]),
            int(weather_enc),
            int(data["hour"]),
            float(data["latitude"]),
            float(data["longitude"]),
        ]])

        severity   = int(model.predict(features)[0])
        proba      = model.predict_proba(features)[0]
        confidence = round(float(max(proba)) * 100, 1)

        return jsonify({
            "severity":   severity,
            "confidence": confidence,
            "probabilities": {
                str(cls): round(float(p) * 100, 1)
                for cls, p in zip(model.classes_, proba)
            }
        }), 200

    except FileNotFoundError as e:
        return jsonify({"message": str(e)}), 503
    except Exception as e:
        return jsonify({"message": "Prediction failed", "detail": str(e)}), 500