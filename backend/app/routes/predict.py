"""
predict.py - API endpoints for severity prediction with filtered features
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
import os
import numpy as np
import joblib

predict_bp = Blueprint("predict", __name__, url_prefix="/api/predict")

_predictor = None


class OptimizedPredictor:
    """
    Lightweight predictor that uses the filtered feature set (39 features)
    """
    
    def __init__(self, model_path: str):
        """Load model and feature information"""
        data = joblib.load(model_path)
        self.model = data['model']
        self.feature_names = data.get('feature_names', [])
        self.keep_indices = data.get('keep_indices', None)
        
        # Load thresholds from the model if available, otherwise use defaults
        self.thresholds = data.get('thresholds', {1: 0.344, 3: 0.516, 4: 0.344, 2: 'fallback'})
        self.classes = [1, 2, 3, 4]
        self.severity_labels = {1: "Low", 2: "Moderate", 3: "High", 4: "Critical"}
        
        print(f"[Predict API] ✅ Model loaded with {len(self.feature_names)} features")
    
    def _build_feature_vector(self, data: dict) -> np.ndarray:
        """
        Build feature vector matching the training data structure.
        Must produce exactly the same features in the same order.
        """
        # Extract basic values
        duration_min = float(data.get('duration_min', 30.0))
        hour = float(data.get('hour', 12))
        month = float(data.get('month', 6))
        temperature_c = float(data.get('temperature_c', 20.0))
        day_of_week = float(data.get('day_of_week', 2))
        visibility_km = float(data.get('visibility_km', 10.0))
        
        # Season mappings (one-hot encoded)
        season = data.get('season', 'Summer')
        season_Summer = 1.0 if season == 'Summer' else 0.0
        season_Winter = 1.0 if season == 'Winter' else 0.0
        season_Fall = 1.0 if season == 'Fall' else 0.0
        season_Spring = 1.0 if season == 'Spring' else 0.0
        
        # Time of day mappings
        time_of_day = data.get('time_of_day', 'Afternoon')
        time_of_day_Morning = 1.0 if time_of_day == 'Morning' else 0.0
        time_of_day_Afternoon = 1.0 if time_of_day == 'Afternoon' else 0.0
        time_of_day_Evening = 1.0 if time_of_day == 'Evening' else 0.0
        time_of_day_Night = 1.0 if time_of_day == 'Night' else 0.0
        
        # State mappings (based on your feature importance output)
        state = data.get('state', 'Unknown')
        state_CA = 1.0 if state == 'CA' else 0.0
        state_TX = 1.0 if state == 'TX' else 0.0
        state_FL = 1.0 if state == 'FL' else 0.0
        state_NY = 1.0 if state == 'NY' else 0.0
        state_PA = 1.0 if state == 'PA' else 0.0
        state_IL = 1.0 if state == 'IL' else 0.0
        state_OH = 1.0 if state == 'OH' else 0.0
        state_GA = 1.0 if state == 'GA' else 0.0
        state_NC = 1.0 if state == 'NC' else 0.0
        state_MI = 1.0 if state == 'MI' else 0.0
        
        # Weather condition mappings
        weather = data.get('weather_condition', 'Clear')
        weather_Clear = 1.0 if weather == 'Clear' else 0.0
        weather_Cloudy = 1.0 if weather == 'Cloudy' else 0.0
        weather_Rain = 1.0 if weather == 'Rain' else 0.0
        weather_Snow = 1.0 if weather == 'Snow' else 0.0
        weather_Fog = 1.0 if weather == 'Fog' else 0.0
        weather_Other = 1.0 if weather not in ['Clear', 'Cloudy', 'Rain', 'Snow', 'Fog'] else 0.0
        
        # US Region mappings
        us_region = data.get('us_region', 'West')
        us_region_West = 1.0 if us_region == 'West' else 0.0
        us_region_South = 1.0 if us_region == 'South' else 0.0
        us_region_Northeast = 1.0 if us_region == 'Northeast' else 0.0
        us_region_Midwest = 1.0 if us_region == 'Midwest' else 0.0
        
        # Road features (convert bool to float)
        traffic_signal = 1.0 if data.get('traffic_signal', False) else 0.0
        crossing = 1.0 if data.get('crossing', False) else 0.0
        junction = 1.0 if data.get('junction', False) else 0.0
        railway = 1.0 if data.get('railway', False) else 0.0
        stop = 1.0 if data.get('stop', False) else 0.0
        station = 1.0 if data.get('station', False) else 0.0
        amenity = 1.0 if data.get('amenity', False) else 0.0
        give_way = 1.0 if data.get('give_way', False) else 0.0
        bump = 1.0 if data.get('bump', False) else 0.0
        no_exit = 1.0 if data.get('no_exit', False) else 0.0
        roundabout = 1.0 if data.get('roundabout', False) else 0.0
        traffic_calming = 1.0 if data.get('traffic_calming', False) else 0.0
        turning_loop = 1.0 if data.get('turning_loop', False) else 0.0
        
        # Calculate total road feature count
        road_feature_count = sum([
            traffic_signal, crossing, junction, railway, stop, station,
            amenity, give_way, bump, no_exit, roundabout, traffic_calming, turning_loop
        ])
        
        # Build feature array in the exact order from training
        # Order based on feature_importance_analysis.csv output
        features = [
            duration_min,           # duration_min
            hour,                   # hour
            month,                  # month
            temperature_c,          # temperature_c
            season_Summer,          # season_Summer
            day_of_week,            # day_of_week
            traffic_signal,         # traffic_signal
            time_of_day_Morning,    # time_of_day_Morning
            state_CA,               # state_CA
            weather_Clear,          # weather_condition_Clear
            visibility_km,          # visibility_km
            season_Winter,          # season_Winter
            time_of_day_Afternoon,  # time_of_day_Afternoon
            weather_Cloudy,         # weather_condition_Cloudy
            time_of_day_Evening,    # time_of_day_Evening
            state_TX,               # state_TX
            us_region_West,         # us_region_West
            crossing,               # crossing
            us_region_South,        # us_region_South
            state_FL,               # state_FL
            season_Fall,            # season_Fall
            state_NY,               # state_NY
            us_region_Northeast,    # us_region_Northeast
            us_region_Midwest,      # us_region_Midwest
            weather_Rain,           # weather_condition_Rain
            time_of_day_Night,      # time_of_day_Night
            junction,               # junction
            road_feature_count,     # road_feature_count
            weather_Snow,           # weather_condition_Snow
            state_PA,               # state_PA
            weather_Fog,            # weather_condition_Fog
            season_Spring,          # season_Spring
            railway,                # railway
            state_IL,               # state_IL
            weather_Other,          # weather_condition_Other
            state_OH,               # state_OH
            state_GA,               # state_GA
            state_NC,               # state_NC
            state_MI,               # state_MI
        ]
        
        # Debug: print feature count if mismatch
        if len(features) != 39:
            print(f"⚠️ Warning: Expected 39 features, got {len(features)}")
            if len(features) < 39:
                features.extend([0.0] * (39 - len(features)))
            else:
                features = features[:39]
        
        return np.array(features, dtype=np.float32).reshape(1, -1)
    
    def predict_single(self, data: dict) -> dict:
        """Predict severity for a single accident"""
        feature_vector = self._build_feature_vector(data)
        
        # Get probabilities
        proba = self.model.predict_proba(feature_vector)[0]
        
        # Apply calibrated thresholds (priority: 1 → 4 → 3 → 2)
        pred = 2  # default fallback
        
        # Check Severity 1 (Low)
        if proba[0] > self.thresholds.get(1, 0.344):
            pred = 1
        # Check Severity 4 (Critical)
        elif proba[3] > self.thresholds.get(4, 0.344):
            pred = 4
        # Check Severity 3 (High)
        elif proba[2] > self.thresholds.get(3, 0.516):
            pred = 3
        
        confidence = float(max(proba)) * 100
        
        return {
            'predicted_severity': pred,
            'severity_label': self.severity_labels.get(pred, "Unknown"),
            'probability': {
                '1': round(float(proba[0]), 4),
                '2': round(float(proba[1]), 4),
                '3': round(float(proba[2]), 4),
                '4': round(float(proba[3]), 4)
            },
            'confidence_percentage': round(confidence, 2),
            'confidence_level': "High" if confidence > 80 else "Moderate" if confidence > 60 else "Low"
        }


def get_predictor():
    """Singleton loader for optimized predictor"""
    global _predictor
    if _predictor is None:
        model_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ml')
        model_path = os.path.join(model_dir, 'severity_model.pkl')
        
        if os.path.exists(model_path):
            _predictor = OptimizedPredictor(model_path)
            print("[Predict API] ✅ Optimized predictor loaded")
        else:
            print("[Predict API] ⚠️ Model not found — run: python scripts/train_model.py")
            return None
    return _predictor


# ── Routes ────────────────────────────────────────────────────────────────────

@predict_bp.route("/health", methods=["GET"])
def health():
    predictor = get_predictor()
    loaded = predictor is not None
    return jsonify({
        "status": "ok",
        "model_loaded": loaded,
        "message": "Model ready" if loaded else "Model not trained yet"
    }), 200


@predict_bp.route("/predict", methods=["POST"])
@jwt_required()
def predict_severity():
    """Predict severity for a single accident"""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    predictor = get_predictor()
    if predictor is None:
        return jsonify({"error": "Model not trained yet"}), 503
    
    try:
        result = predictor.predict_single(data)
        return jsonify({"success": True, "prediction": result}), 200
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Prediction failed: {str(e)}"}), 500


@predict_bp.route("/batch", methods=["POST"])
@jwt_required()
def predict_batch():
    """Predict severity for multiple accidents"""
    data = request.get_json()
    if not data or 'accidents' not in data:
        return jsonify({"error": "No accidents data provided"}), 400
    
    accidents = data.get('accidents', [])
    if not accidents:
        return jsonify({"error": "Empty accidents list"}), 400
    
    predictor = get_predictor()
    if predictor is None:
        return jsonify({"error": "Model not trained yet"}), 503
    
    results = []
    for accident in accidents:
        try:
            results.append(predictor.predict_single(accident))
        except Exception as e:
            results.append({"error": str(e)})
    
    return jsonify({"success": True, "predictions": results, "count": len(results)}), 200


@predict_bp.route("/model-info", methods=["GET"])
@jwt_required()
def model_info():
    """Return model metadata"""
    predictor = get_predictor()
    if predictor is None:
        return jsonify({"error": "Model not trained yet"}), 503
    
    return jsonify({
        "model_type": "RandomForestClassifier",
        "n_features": len(predictor.feature_names),
        "calibrated_thresholds": predictor.thresholds,
        "prediction_rule": "Priority: Severity 1 → 4 → 3 → 2 (fallback)"
    }), 200


@predict_bp.route("/explain/<int:severity>", methods=["GET"])
@jwt_required()
def explain_severity(severity: int):
    """Get explanation for a severity level"""
    explanations = {
        1: {"name": "Low", "description": "Minor accident with minimal damage. No or very minor injuries.",
            "typical_duration": "30–60 minutes", "recommendation": "Standard traffic management required."},
        2: {"name": "Moderate", "description": "Medium severity with possible injuries. May cause traffic delays.",
            "typical_duration": "60–120 minutes", "recommendation": "Emergency services may be needed."},
        3: {"name": "High", "description": "Serious accident with confirmed injuries. Significant traffic disruption.",
            "typical_duration": "120–180 minutes", "recommendation": "Immediate emergency response required."},
        4: {"name": "Critical", "description": "Severe accident with major injuries or fatalities. Complete road closure.",
            "typical_duration": "180+ minutes", "recommendation": "Maximum emergency response required."}
    }
    if severity not in explanations:
        return jsonify({"error": f"Invalid severity {severity}. Valid: 1, 2, 3, 4"}), 400
    return jsonify(explanations[severity]), 200