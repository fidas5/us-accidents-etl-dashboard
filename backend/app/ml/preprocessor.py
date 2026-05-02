"""
preprocessor.py - Préparation des données pour le modèle Random Forest
"""

import pandas as pd
import numpy as np
from sklearn.preprocessing import LabelEncoder, StandardScaler
from typing import Dict, Any, List
import joblib


class AccidentPreprocessor:
    """
    Préprocesseur pour les données d'accidents
    """
    
    def __init__(self):
        self.label_encoders = {}
        self.scaler = StandardScaler()
        self.fitted = False
        
        # Colonnes catégorielles à encoder
        self.categorical_cols = ['state', 'weather_condition', 'season', 'time_of_day']
        
        # Colonnes numériques à normaliser
        self.numerical_cols = ['temperature_c', 'visibility_km']
        
        # Colonnes booléennes
        self.boolean_cols = ['is_weekend']
        
        # Colonnes à exclure
        self.exclude_cols = ['severity', 'severity_label', 'id', 'accident_id', 'start_time', 'end_time', 'city', 'latitude', 'longitude']
    
    def _extract_time_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extrait les features temporelles de start_time"""
        df = df.copy()
        
        if 'start_time' in df.columns:
            # Convertir en datetime
            df['start_time'] = pd.to_datetime(df['start_time'])
            
            # Extraire les features
            df['hour'] = df['start_time'].dt.hour
            df['month'] = df['start_time'].dt.month
            df['day_of_week'] = df['start_time'].dt.dayofweek
            df['is_weekend'] = df['day_of_week'] >= 5
            
            # Ajouter aux colonnes numériques
            if 'hour' not in self.numerical_cols:
                self.numerical_cols.append('hour')
            if 'month' not in self.numerical_cols:
                self.numerical_cols.append('month')
            if 'day_of_week' not in self.numerical_cols:
                self.numerical_cols.append('day_of_week')
            if 'is_weekend' not in self.boolean_cols:
                self.boolean_cols.append('is_weekend')
        else:
            # Valeurs par défaut
            df['hour'] = 12
            df['month'] = 6
            df['day_of_week'] = 2
            df['is_weekend'] = False
        
        return df
    
    def fit(self, df: pd.DataFrame):
        """Entraîne les encodeurs et le scaler"""
        
        # Extraire les features temporelles
        df = self._extract_time_features(df)
        
        # Nettoyer les données
        df = df.copy()
        
        # Remplacer les NaN dans les colonnes catégorielles
        for col in self.categorical_cols:
            if col in df.columns:
                df[col] = df[col].fillna('Unknown').astype(str)
        
        # Remplacer les NaN dans les colonnes numériques
        for col in self.numerical_cols:
            if col in df.columns:
                df[col] = df[col].fillna(0)
        
        # Remplacer les NaN dans les colonnes booléennes
        for col in self.boolean_cols:
            if col in df.columns:
                df[col] = df[col].fillna(False)
        
        # Encodage des variables catégorielles
        for col in self.categorical_cols:
            if col in df.columns:
                le = LabelEncoder()
                le.fit(df[col])
                self.label_encoders[col] = le
                print(f"[Preprocessor] Encoded column: {col} with classes: {list(le.classes_)}")
        
        # Normalisation des variables numériques
        numerical_data = df[self.numerical_cols]
        self.scaler.fit(numerical_data)
        
        self.fitted = True
        print(f"[Preprocessor] Fit completed. Encoded {len(self.label_encoders)} categorical columns")
        print(f"[Preprocessor] Numerical columns: {self.numerical_cols}")
        
        return self
    
    def transform(self, df: pd.DataFrame) -> np.ndarray:
        """Transforme les données pour le modèle"""
        if not self.fitted:
            raise ValueError("Preprocessor must be fitted before transform")
        
        # Extraire les features temporelles
        df = self._extract_time_features(df)
        
        # Créer une copie
        data = df.copy()
        
        # Nettoyer les données
        for col in self.categorical_cols:
            if col in data.columns:
                data[col] = data[col].fillna('Unknown').astype(str)
        
        for col in self.numerical_cols:
            if col in data.columns:
                data[col] = data[col].fillna(0)
        
        for col in self.boolean_cols:
            if col in data.columns:
                data[col] = data[col].fillna(False)
        
        # 1. Encodage des catégories
        encoded_features = []
        
        for col in self.categorical_cols:
            if col in data.columns:
                series = data[col].astype(str)
                le = self.label_encoders.get(col)
                if le:
                    # Gérer les valeurs non vues pendant l'entraînement
                    encoded = []
                    for val in series:
                        if val in le.classes_:
                            encoded.append(le.transform([val])[0])
                        else:
                            encoded.append(0)  # Valeur par défaut pour les inconnues
                    encoded_features.append(encoded)
                else:
                    encoded_features.append([0] * len(series))
        
        # 2. Données numériques
        numerical_data = data[self.numerical_cols]
        scaled_numerical = self.scaler.transform(numerical_data)
        
        # 3. Booléennes
        boolean_data = data[self.boolean_cols].values if self.boolean_cols else np.array([]).reshape(len(data), 0)
        
        # 4. Combiner toutes les features
        features_list = [scaled_numerical]
        
        if encoded_features:
            encoded_array = np.array(encoded_features).T
            features_list.append(encoded_array)
        
        if len(boolean_data) > 0:
            if len(boolean_data.shape) == 1:
                boolean_data = boolean_data.reshape(-1, 1)
            features_list.append(boolean_data)
        
        features = np.hstack(features_list)
        
        return features
    
    def fit_transform(self, df: pd.DataFrame) -> np.ndarray:
        """Fit puis transform"""
        self.fit(df)
        return self.transform(df)
    
    def save(self, path: str):
        """Sauvegarde le préprocesseur"""
        joblib.dump({
            'label_encoders': self.label_encoders,
            'scaler': self.scaler,
            'categorical_cols': self.categorical_cols,
            'numerical_cols': self.numerical_cols,
            'boolean_cols': self.boolean_cols,
            'fitted': self.fitted
        }, path)
        print(f"[Preprocessor] Saved to {path}")
    
    def load(self, path: str):
        """Charge le préprocesseur"""
        data = joblib.load(path)
        self.label_encoders = data['label_encoders']
        self.scaler = data['scaler']
        self.categorical_cols = data['categorical_cols']
        self.numerical_cols = data['numerical_cols']
        self.boolean_cols = data['boolean_cols']
        self.fitted = data['fitted']
        print(f"[Preprocessor] Loaded from {path}")