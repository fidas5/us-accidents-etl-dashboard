"""
predict.py - API endpoints for severity prediction
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
import os
import pandas as pd

from ..ml.model_trainer import SeverityPredictor

predict_bp = Blueprint("predict", __name__, url_prefix="/api/predict")

# Charger le modèle au démarrage
_predictor = None


def get_predictor():
    """Charge le modèle (singleton)"""
    global _predictor
    if _predictor is None:
        model_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ml')
        model_path = os.path.join(model_dir, 'severity_model.pkl')
        preprocessor_path = os.path.join(model_dir, 'preprocessor.pkl')
        
        _predictor = SeverityPredictor()
        
        if os.path.exists(model_path) and os.path.exists(preprocessor_path):
            _predictor.load(model_path, preprocessor_path)
            print("[Predict API] ✅ Model loaded successfully")
        else:
            print("[Predict API] ⚠️ Model not found. Train first with: python scripts/train_model.py")
    
    return _predictor


@predict_bp.route("/health", methods=["GET"])
def health():
    """Vérifier si le modèle est disponible"""
    predictor = get_predictor()
    return jsonify({
        "status": "ok",
        "model_loaded": predictor.model is not None,
        "message": "Model ready" if predictor.model is not None else "Model not trained yet"
    }), 200


@predict_bp.route("/severity", methods=["POST"])
@jwt_required()
def predict_severity():
    """
    Prédit la sévérité d'un accident
    """
    data = request.get_json()
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    # Champs optionnels avec valeurs par défaut
    required_fields = ['state', 'weather_condition']
    missing = [f for f in required_fields if f not in data]
    if missing:
        return jsonify({"error": f"Missing fields: {missing}"}), 400
    
    predictor = get_predictor()
    
    if predictor.model is None:
        return jsonify({"error": "Model not trained yet. Please run training script first."}), 503
    
    try:
        # Préparer les données pour la prédiction
        prediction_input = {
            'state': data.get('state', 'Unknown'),
            'weather_condition': data.get('weather_condition', 'Unknown'),
            'temperature_c': float(data.get('temperature_c', 20.0)),
            'visibility_km': float(data.get('visibility_km', 10.0)),
            'season': data.get('season', 'Summer'),
            'time_of_day': data.get('time_of_day', 'Afternoon'),
            'hour': int(data.get('hour', 12)),
            'month': int(data.get('month', 6)),
            'day_of_week': int(data.get('day_of_week', 2)),
            'is_weekend': bool(data.get('is_weekend', False))
        }
        
        # Prédire
        result = predictor.predict_single(prediction_input)
        
        return jsonify({
            "success": True,
            "prediction": result
        }), 200
        
    except Exception as e:
        return jsonify({"error": f"Prediction failed: {str(e)}"}), 500


@predict_bp.route("/batch", methods=["POST"])
@jwt_required()
def predict_batch():
    """
    Prédit la sévérité pour plusieurs accidents
    """
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
            prediction_input = {
                'state': accident.get('state', 'Unknown'),
                'weather_condition': accident.get('weather_condition', 'Unknown'),
                'temperature_c': float(accident.get('temperature_c', 20.0)),
                'visibility_km': float(accident.get('visibility_km', 10.0)),
                'season': accident.get('season', 'Summer'),
                'time_of_day': accident.get('time_of_day', 'Afternoon'),
                'hour': int(accident.get('hour', 12)),
                'month': int(accident.get('month', 6)),
                'day_of_week': int(accident.get('day_of_week', 2)),
                'is_weekend': bool(accident.get('is_weekend', False))
            }
            result = predictor.predict_single(prediction_input)
            results.append(result)
        except Exception as e:
            results.append({"error": str(e)})
    
    return jsonify({
        "success": True,
        "predictions": results,
        "count": len(results)
    }), 200


@predict_bp.route("/feature-importance", methods=["GET"])
@jwt_required()
def get_feature_importance():
    """
    Retourne l'importance des features du modèle
    """
    predictor = get_predictor()
    
    if predictor.model is None:
        return jsonify({"error": "Model not trained yet"}), 503
    
    importance = predictor.get_feature_importance()
    
    return jsonify({
        "feature_importance": importance
    }), 200


@predict_bp.route("/explain/<int:severity>", methods=["GET"])
@jwt_required()
def explain_severity(severity: int):
    """
    Explique ce qu'une sévérité signifie
    """
    severity_labels = {
        1: {
            "name": "Low",
            "description": "Minor accident with minimal damage. Usually no injuries or very minor injuries.",
            "typical_duration": "30-60 minutes",
            "recommendation": "Standard traffic management required."
        },
        2: {
            "name": "Moderate",
            "description": "Medium severity accident with possible injuries. May cause traffic delays.",
            "typical_duration": "60-120 minutes",
            "recommendation": "Emergency services may be needed. Traffic diversion recommended."
        },
        3: {
            "name": "High",
            "description": "Serious accident with confirmed injuries. Significant traffic disruption.",
            "typical_duration": "120-180 minutes",
            "recommendation": "Immediate emergency response required. Road closure likely."
        },
        4: {
            "name": "Critical",
            "description": "Severe accident with major injuries or fatalities. Complete road closure.",
            "typical_duration": "180+ minutes",
            "recommendation": "Maximum emergency response. Full scene investigation required."
        }
    }
    
    if severity not in severity_labels:
        return jsonify({"error": f"Severity {severity} not found. Valid values: 1,2,3,4"}), 400
    
    return jsonify(severity_labels[severity]), 200