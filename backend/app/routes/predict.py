"""
predict.py - API endpoints for severity prediction with filtered features

Ce service :

1-Reçoit les caractéristiques d'un accident (JSON depuis le frontend)

2-Transforme ces données en vecteur numérique 

3-Prédit la sévérité (1=Low à 4=Critical) avec le modèle Random Forest

4-Retourne la prédiction + probabilités + niveau de confiance

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
        # 1. Charge le fichier .pkl 
        data = joblib.load(model_path)
        # 2. Extrait les composants nécessaires
        self.model = data['model'] # La RandomForest entraînée
        self.feature_names = data.get('feature_names', []) # Liste des 37 features
        self.keep_indices = data.get('keep_indices', None)
        self.thresholds = data.get('thresholds', self.DEFAULT_THRESHOLDS)
        # seuils calibrés pour décider de la classe finale
        self.classes = [1, 2, 3, 4]
        
    
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
        """ _build_feature_vector() - Cœur de la transformation JSON → Vecteur numérique
        Cette fonction est le pont entre le frontend (JSON ) et le modèle ML
(vecteur numpy de 37 features)

┌─────────────────────────────────────────────────────────────────────────────┐
│                     PIPELINE DE TRANSFORMATION                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  JSON Frontend (Français)                                                  │
│  {                                                                          │
│    "duration_min": 45,      "season": "Printemps",                         │
│    "hour": 8,               "state": "CA",                                 │
│    "temperature_c": 22,     "weather_condition": "Clair",                  │
│    "traffic_signal": true,  "us_region": "Ouest",                          │
│    "crossing": false,       ...                                            │
│  }                                                                          │
│         ↓                                                                   │
│  ÉTAPE 1 : Extraire les valeurs numériques                                 │
│  ─────────────────────────────────────────────────────────────────────────│
│  duration_min = 45.0      month = 3.0         day_of_week = 1.0            │
│  hour = 8.0               temperature_c = 22.0 visibility_km = 12.0        │
│  is_weekend = 0.0 (Lundi=1 → pas weekend)                                  │
│         ↓                                                                   │
│  ÉTAPE 2 : Compter les infrastructures routières                           │
│  ─────────────────────────────────────────────────────────────────────────│
│  ROAD_FEATURES = ['traffic_signal', 'crossing', 'junction', ...]           │
│  road_feature_count = sum(1 for f in ROAD_FEATURES if data.get(f))         │
│  → traffic_signal=True (+1), crossing=False (+0), junction=True (+1) = 2   │
│         ↓                                                                   │
│  ÉTAPE 3 : Déterminer les buckets (discrétisation)                         │
│  ─────────────────────────────────────────────────────────────────────────│
│  temp_bucket = 'Chaud'     (22°C → 20-30°C)                                │
│  vis_bucket  = 'Bonne'     (12km → ≥10km)                                  │
│         ↓                                                                   │
│  ÉTAPE 4 : Traduire français → anglais (pour correspondre au modèle)       │
│  ─────────────────────────────────────────────────────────────────────────│
│  weather = 'Fair'          ('Clair' → 'Fair')                              │
│  us_region = 'West'        ('Ouest' → 'West')                              │
│         ↓                                                                   │
│  ÉTAPE 5 : Construire le dictionnaire de lookup (one-hot encoding)         │
│  ─────────────────────────────────────────────────────────────────────────│
│  lookup = {                                                                │
│      # Numériques                                                          │
│      'duration_min': 45.0,      'hour': 8.0,      'month': 3.0,            │
│      'temperature_c': 22.0,     'day_of_week': 1.0, 'visibility_km': 12.0, │
│      'is_weekend': 0.0,         'road_feature_count': 2,                   │
│                                                                            │
│      # Flags routiers (13 binaires)                                        │
│      'traffic_signal': 1.0,     'crossing': 0.0,   'junction': 1.0, ...    │
│                                                                            │
│      # Saison (one-hot, 4 colonnes)                                        │
│      'season_Printemps': 1.0,   'season_Été': 0.0,                         │
│      'season_Automne': 0.0,     'season_Hiver': 0.0,                       │
│                                                                            │
│      # Moment de la journée (one-hot, 4 colonnes)                          │
│      'time_of_day_Matin': 1.0,  'time_of_day_Après-midi': 0.0,             │
│      'time_of_day_Soir': 0.0,   'time_of_day_Nuit': 0.0,                   │
│                                                                            │
│      # État US (one-hot, top 15 + Other)                                   │
│      'state_CA': 1.0,          'state_TX': 0.0,    'state_Other': 0.0,     │
│                                                                            │
│      # Météo (one-hot, top 6)                                              │
│      'weather_condition_Fair': 1.0, 'weather_condition_Cloudy': 0.0, ...   │
│                                                                            │
│      # Région US (one-hot, 4 régions)                                      │
│      'us_region_West': 1.0,    'us_region_South': 0.0, ...                 │
│                                                                            │
│      # Buckets température (one-hot, 5 buckets)                            │
│      'temp_bucket_Chaud': 1.0, 'temp_bucket_Froid': 0.0, ...               │
│                                                                            │
│      # Buckets visibilité (one-hot, 4 buckets)                             │
│      'visibility_bucket_Bonne': 1.0, 'visibility_bucket_Faible': 0.0, ...  │
│  }                                                                          │
│         ↓                                                                   │
│  ÉTAPE 6 : Assembler le vecteur dans l'ORDRE des features du modèle        │
│  ─────────────────────────────────────────────────────────────────────────│
│  # self.feature_names = ['duration_min', 'hour', 'month',                  │
│  #                       'season_Printemps', 'state_CA', ...] (37 noms)    │
│  vector = [lookup.get(name, 0.0) for name in self.feature_names]           │
│         ↓                                                                   │
│  RÉSULTAT FINAL : Vecteur numpy (1, 37) pour sklearn                       │
│  ─────────────────────────────────────────────────────────────────────────│
│  array([[45.0, 8.0, 3.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 1.0, 0.0, ...]],   │
│        dtype=float32)                                                       │
│                                                                            │
│  Ce vecteur est ensuite passé à model.predict_proba() pour la prédiction   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

        """
        
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
        """Predict severity for a single accident
        Pourquoi des seuils calibrés ?

Le modèle peut donner des probabilités comme [0.12, 0.65, 0.15, 0.08].
La classe 2 (Moderate) a la plus haute probabilité, donc normalement on choisirait 2.

Mais si on a [0.35, 0.33, 0.20, 0.12] :

Classe 1 a 35% (juste au-dessus du seuil 0.344)

On va choisir classe 1 même si ce n'est pas la proba max !

Pourquoi ? Pour équilibrer les classes et éviter que le modèle ignore les classes rares.

"""
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
    """Singleton loader for the optimized predictor
    Pourquoi un singleton ?

Le modèle fait ~50MB

Le charger à chaque requête serait trop lent

On le charge une fois au premier appel, puis on le réutilise
    """
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