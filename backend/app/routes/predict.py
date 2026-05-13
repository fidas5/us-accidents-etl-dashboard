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
    """Optimized predictor with direct feature mapping"""
    
    # Constantes de classe pour éviter de les recalculer
    ROAD_FEATURES = [
        'traffic_signal', 'crossing', 'junction', 'railway', 'stop', 'station',
        'amenity', 'give_way', 'bump', 'no_exit', 'roundabout', 'traffic_calming', 'turning_loop'
    ]
    
    SEVERITY_LABELS = {1: "Low", 2: "Moderate", 3: "High", 4: "Critical"}
    DEFAULT_THRESHOLDS = {1: 0.344, 3: 0.516, 4: 0.344, 2: 'fallback'}
    
    def __init__(self, model_path: str):
        data = joblib.load(model_path)
        self.model = data['model']
        self.feature_names = data.get('feature_names', [])
        self.keep_indices = data.get('keep_indices', None)
        self.thresholds = data.get('thresholds', self.DEFAULT_THRESHOLDS)
        self.classes = [1, 2, 3, 4]
        
        # Pré-calculer les mapping pour les one-hot encodings
        self._init_mappings()
        
        print(f"[Predict API] ✅ Model loaded with {len(self.feature_names)} features")

    def _init_mappings(self):
        """Initialize static mappings for performance"""
        self.weather_map = {
            'Clair': 'Fair', 'Nuageux': 'Cloudy', 'Pluie': 'Rain',
            'Neige': 'Snow', 'Brouillard': 'Fog', 'Autre': 'Other'
        }
        
        self.region_map = {
            'Ouest': 'West', 'Sud': 'South', 'Nord-Est': 'Northeast'
        }
        
        self.season_map = {'Printemps', 'Été', 'Automne', 'Hiver'}
        self.time_map = {'Matin', 'Après-midi', 'Soir', 'Nuit'}

    def _get_temp_bucket(self, temp_c: float) -> str:
        """Get temperature bucket"""
        if temp_c < 0: return 'Glacial'
        if temp_c < 10: return 'Froid'
        if temp_c < 20: return 'Frais'
        if temp_c < 30: return 'Chaud'
        return 'Très chaud'

    def _get_vis_bucket(self, visibility_km: float) -> str:
        """Get visibility bucket"""
        if visibility_km < 1: return 'Très faible'
        if visibility_km < 5: return 'Faible'
        if visibility_km < 10: return 'Modérée'
        return 'Bonne'

    def _build_feature_vector(self, data: dict) -> np.ndarray:
        """Build feature vector using efficient dictionary lookup"""
        
        # ── Numeric features ──────────────────────────────────────────────
        duration_min = float(data.get('duration_min', 30.0))
        hour = float(data.get('hour', 12))
        month = float(data.get('month', 6))
        temperature_c = float(data.get('temperature_c', 20.0))
        day_of_week = float(data.get('day_of_week', 2))
        visibility_km = float(data.get('visibility_km', 10.0))
        is_weekend = 1.0 if day_of_week >= 5 else 0.0

        # ── Road flags (compte direct sans répétition) ────────────────────
        road_feature_count = sum(1 for feature in self.ROAD_FEATURES if data.get(feature))

        # ── Buckets ───────────────────────────────────────────────────────
        temp_bucket = self._get_temp_bucket(temperature_c)
        vis_bucket = self._get_vis_bucket(visibility_km)
        
        # ── Mapped values ─────────────────────────────────────────────────
        weather_raw = data.get('weather_condition', 'Clair')
        weather = self.weather_map.get(weather_raw, weather_raw)
        
        us_region_raw = data.get('us_region', 'Ouest')
        us_region = self.region_map.get(us_region_raw, us_region_raw)

        # ── Lookup table optimisée ────────────────────────────────────────
        season = data.get('season', 'Été')
        time_of_day = data.get('time_of_day', 'Après-midi')
        state = data.get('state', 'Unknown')
        
        lookup = {
            # Numeric
            'duration_min': duration_min,
            'hour': hour,
            'month': month,
            'temperature_c': temperature_c,
            'day_of_week': day_of_week,
            'visibility_km': visibility_km,
            'is_weekend': is_weekend,
            'road_feature_count': road_feature_count,
            
            # Road flags
            **{f: 1.0 if data.get(f) else 0.0 for f in self.ROAD_FEATURES},
            
            # Season
            f'season_Été': 1.0 if season == 'Été' else 0.0,
            f'season_Hiver': 1.0 if season == 'Hiver' else 0.0,
            f'season_Automne': 1.0 if season == 'Automne' else 0.0,
            f'season_Printemps': 1.0 if season == 'Printemps' else 0.0,
            
            # Time of day
            'time_of_day_Matin': 1.0 if time_of_day == 'Matin' else 0.0,
            'time_of_day_Après-midi': 1.0 if time_of_day == 'Après-midi' else 0.0,
            'time_of_day_Soir': 1.0 if time_of_day == 'Soir' else 0.0,
            'time_of_day_Nuit': 1.0 if time_of_day == 'Nuit' else 0.0,
            
            # State
            'state_CA': 1.0 if state == 'CA' else 0.0,
            'state_TX': 1.0 if state == 'TX' else 0.0,
            'state_FL': 1.0 if state == 'FL' else 0.0,
            'state_NY': 1.0 if state == 'NY' else 0.0,
            'state_PA': 1.0 if state == 'PA' else 0.0,
            'state_IL': 1.0 if state == 'IL' else 0.0,
            'state_OH': 1.0 if state == 'OH' else 0.0,
            'state_GA': 1.0 if state == 'GA' else 0.0,
            'state_NC': 1.0 if state == 'NC' else 0.0,
            'state_MI': 1.0 if state == 'MI' else 0.0,
            'state_SC': 1.0 if state == 'SC' else 0.0,
            'state_VA': 1.0 if state == 'VA' else 0.0,
            'state_MN': 1.0 if state == 'MN' else 0.0,
            'state_Other': 1.0 if state == 'Autre' else 0.0,
            
            # Weather
            'weather_condition_Fair': 1.0 if weather == 'Fair' else 0.0,
            'weather_condition_Cloudy': 1.0 if weather == 'Cloudy' else 0.0,
            'weather_condition_Rain': 1.0 if weather == 'Rain' else 0.0,
            'weather_condition_Snow': 1.0 if weather == 'Snow' else 0.0,
            'weather_condition_Fog': 1.0 if weather == 'Fog' else 0.0,
            'weather_condition_Other': 1.0 if weather == 'Other' else 0.0,
            
            # US Region
            'us_region_West': 1.0 if us_region == 'West' else 0.0,
            'us_region_South': 1.0 if us_region == 'South' else 0.0,
            'us_region_Northeast': 1.0 if us_region == 'Northeast' else 0.0,
            'us_region_Midwest': 1.0 if us_region == 'Midwest' else 0.0,
            'us_region_Ouest': 1.0 if us_region == 'West' else 0.0,
            'us_region_Sud': 1.0 if us_region == 'South' else 0.0,
            'us_region_Nord-Est': 1.0 if us_region == 'Northeast' else 0.0,
            
            # Temperature bucket
            'temp_bucket_Chaud': 1.0 if temp_bucket == 'Chaud' else 0.0,
            'temp_bucket_Froid': 1.0 if temp_bucket == 'Froid' else 0.0,
            'temp_bucket_Frais': 1.0 if temp_bucket == 'Frais' else 0.0,
            'temp_bucket_Glacial': 1.0 if temp_bucket == 'Glacial' else 0.0,
            'temp_bucket_Très chaud': 1.0 if temp_bucket == 'Très chaud' else 0.0,
            
            # Visibility bucket
            'visibility_bucket_Bonne': 1.0 if vis_bucket == 'Bonne' else 0.0,
            'visibility_bucket_Faible': 1.0 if vis_bucket == 'Faible' else 0.0,
            'visibility_bucket_Modérée': 1.0 if vis_bucket == 'Modérée' else 0.0,
            'visibility_bucket_Très faible': 1.0 if vis_bucket == 'Très faible' else 0.0,
        }

        # Assembly optimisé
        vector = [lookup.get(name, 0.0) for name in self.feature_names]
        
        missing = [name for name in self.feature_names if name not in lookup]
        if missing:
            print(f"⚠️ Unmapped features: {missing}")

        return np.array(vector, dtype=np.float32).reshape(1, -1)

    def predict_single(self, data: dict) -> dict:
        """Predict severity for a single accident"""
        feature_vector = self._build_feature_vector(data)
        proba = self.model.predict_proba(feature_vector)[0]

        # Apply calibrated thresholds
        if proba[0] > self.thresholds.get(1, 0.344):
            pred = 1
        elif proba[3] > self.thresholds.get(4, 0.344):
            pred = 4
        elif proba[2] > self.thresholds.get(3, 0.516):
            pred = 3
        else:
            pred = 2

        confidence = float(max(proba)) * 100

        return {
            'predicted_severity': pred,
            'severity_label': self.SEVERITY_LABELS.get(pred, "Unknown"),
            'probability': {str(k): round(float(proba[i]), 4) for i, k in enumerate(self.classes)},
            'confidence_percentage': round(confidence, 2),
            'confidence_level': (
                "High" if confidence > 80 else
                "Moderate" if confidence > 60 else
                "Low"
            ),
        }


def get_predictor():
    """Singleton loader for the optimized predictor"""
    global _predictor
    if _predictor is None:
        model_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ml')
        model_path = os.path.join(model_dir, 'severity_model.pkl')
        if os.path.exists(model_path):
            _predictor = OptimizedPredictor(model_path)
        else:
            print("[Predict API] ⚠️ Model not found — run: python scripts/train_model.py")
    return _predictor


# ── Routes (seulement l'endpoint utilisé) ────────────────────────────────────

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