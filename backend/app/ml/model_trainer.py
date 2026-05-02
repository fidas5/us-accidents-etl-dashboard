"""
model_trainer.py - Entraînement du modèle Random Forest avec class_weight
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
import joblib
from typing import Dict, Any, Tuple
import os

from .preprocessor import AccidentPreprocessor


class SeverityPredictor:
    """
    Prédicteur de sévérité des accidents basé sur Random Forest avec class_weight
    """
    
    def __init__(self):
        self.model = None
        self.preprocessor = AccidentPreprocessor()
        self.classes = [1, 2, 3, 4]
    
    def prepare_data(self, df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """
        Prépare les données pour l'entraînement
        """
        print(f"[Model Trainer] Preparing data with {len(df):,} rows")
        
        # Supprimer les lignes avec severity NULL
        original_len = len(df)
        df = df[df['severity'].notna()].copy()
        print(f"[Model Trainer] After removing NULL severity: {len(df):,} rows")
        
        # Features (X) - fit_transform gère l'extraction des features temporelles
        X = self.preprocessor.fit_transform(df)
        
        # Target (y)
        y = df['severity'].values
        
        print(f"[Model Trainer] Features shape: {X.shape}")
        print(f"[Model Trainer] Target distribution:")
        for sev in [1, 2, 3, 4]:
            count = np.sum(y == sev)
            pct = count / len(y) * 100
            bar = "█" * int(pct / 2)
            print(f"   Severity {sev}: {count:>8,} ({pct:>5.1f}%) {bar}")
        
        return X, y
    
    def calculate_class_weights(self, y: np.ndarray) -> Dict[int, float]:
        """
        Calcule les poids des classes pour équilibrer le modèle
        """
        # Compter les occurrences
        class_counts = {}
        for sev in self.classes:
            class_counts[sev] = np.sum(y == sev)
        
        total = len(y)
        
        # Calculer les poids (inverse proportionnel à la fréquence)
        weights = {}
        for sev in self.classes:
            if class_counts[sev] > 0:
                # Poids = total / (n_classes * count)
                weights[sev] = total / (len(self.classes) * class_counts[sev])
            else:
                weights[sev] = 1.0
        
        print(f"[Model Trainer] Class weights:")
        for sev, w in weights.items():
            print(f"   Severity {sev}: {w:.4f}")
        
        return weights
    
    def train(self, df: pd.DataFrame, test_size: float = 0.2, random_state: int = 42) -> Dict[str, Any]:
        """
        Entraîne le modèle Random Forest avec class_weight='balanced'
        """
        print("[Model Trainer] Starting training with class_weight='balanced'...")
        
        # Préparer les données
        X, y = self.prepare_data(df)
        
        # Calculer manuellement les poids pour affichage
        weights = self.calculate_class_weights(y)
        
        # Split train/test avec stratification pour garder la distribution
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=random_state, stratify=y
        )
        
        print(f"[Model Trainer] Train size: {len(X_train):,}, Test size: {len(X_test):,}")
        
        # Réduire la taille pour l'entraînement (200k échantillons)
        sample_size = min(200000, len(X_train))
        if len(X_train) > sample_size:
            print(f"[Model Trainer] Using {sample_size:,} samples for training (downsampled)")
            indices = np.random.choice(len(X_train), sample_size, replace=False)
            X_train_sample = X_train[indices]
            y_train_sample = y_train[indices]
        else:
            X_train_sample = X_train
            y_train_sample = y_train
        
        # Créer le modèle avec class_weight='balanced'
        self.model = RandomForestClassifier(
            n_estimators=100,           # 100 arbres pour meilleure précision
            max_depth=20,               # Profondeur maximale
            min_samples_split=10,       # Minimum d'échantillons pour split
            min_samples_leaf=5,         # Minimum d'échantillons par feuille
            random_state=random_state,
            n_jobs=-1,                  # Utiliser tous les CPU
            class_weight='balanced'     # 🔑 CLÉ: équilibrage automatique des classes
        )
        
        print("[Model Trainer] Training Random Forest (this may take a few minutes)...")
        self.model.fit(X_train_sample, y_train_sample)
        
        # Évaluation sur l'ensemble de test
        y_pred = self.model.predict(X_test)
        accuracy = accuracy_score(y_test, y_pred)
        
        # Cross-validation sur un sous-ensemble (50k échantillons)
        print("[Model Trainer] Performing cross-validation...")
        X_sample, _, y_sample, _ = train_test_split(
            X, y, train_size=50000, random_state=random_state, stratify=y
        )
        cv_scores = cross_val_score(self.model, X_sample, y_sample, cv=5)
        
        # Rapport de classification détaillé
        report = classification_report(y_test, y_pred, output_dict=True)
        
        # Matrice de confusion
        cm = confusion_matrix(y_test, y_pred)
        
        results = {
            'accuracy': accuracy,
            'cv_mean': cv_scores.mean(),
            'cv_std': cv_scores.std(),
            'classification_report': report,
            'confusion_matrix': cm.tolist(),
            'feature_importance': self.get_feature_importance(),
            'train_size': len(X_train_sample),
            'test_size': len(X_test),
            'class_weights': weights
        }
        
        print(f"\n[Model Trainer] Training completed!")
        print(f"[Model Trainer] Accuracy: {accuracy:.4f} ({accuracy*100:.2f}%)")
        print(f"[Model Trainer] CV Score: {cv_scores.mean():.4f} (+/- {cv_scores.std():.4f})")
        
        return results
    
    def predict(self, features: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """Prédit la sévérité"""
        if self.model is None:
            raise ValueError("Model not trained. Call train() first or load a saved model.")
        
        predictions = self.model.predict(features)
        probabilities = self.model.predict_proba(features)
        
        return predictions, probabilities
    
    def predict_single(self, data: Dict) -> Dict[str, Any]:
        """Prédit pour une seule observation"""
        df = pd.DataFrame([data])
        features = self.preprocessor.transform(df)
        pred, probs = self.predict(features)
        
        prob_dict = {}
        for i, class_label in enumerate(self.classes):
            prob_dict[str(class_label)] = round(float(probs[0][i]), 4)
        
        confidence = max(probs[0]) * 100
        if confidence > 80:
            confidence_level = "High"
        elif confidence > 60:
            confidence_level = "Moderate"
        else:
            confidence_level = "Low"
        
        severity_labels = {1: "Low", 2: "Moderate", 3: "High", 4: "Critical"}
        
        return {
            'predicted_severity': int(pred[0]),
            'severity_label': severity_labels.get(int(pred[0]), "Unknown"),
            'probability': prob_dict,
            'confidence_percentage': round(confidence, 2),
            'confidence_level': confidence_level
        }
    
    def get_feature_importance(self) -> Dict[str, float]:
        """Retourne l'importance des features"""
        if self.model is None:
            return {}
        
        feature_names = (
            self.preprocessor.numerical_cols + 
            self.preprocessor.categorical_cols +
            self.preprocessor.boolean_cols
        )
        
        importance = {}
        for i, name in enumerate(feature_names):
            if i < len(self.model.feature_importances_):
                importance[name] = round(float(self.model.feature_importances_[i]), 4)
        
        return dict(sorted(importance.items(), key=lambda x: x[1], reverse=True))
    
    def save(self, model_path: str, preprocessor_path: str = None):
        """Sauvegarde le modèle et le préprocesseur"""
        if self.model is None:
            raise ValueError("No model to save")
        
        joblib.dump(self.model, model_path)
        print(f"[Model Trainer] Model saved to {model_path}")
        
        if preprocessor_path:
            self.preprocessor.save(preprocessor_path)
    
    def load(self, model_path: str, preprocessor_path: str = None):
        """Charge un modèle sauvegardé"""
        self.model = joblib.load(model_path)
        print(f"[Model Trainer] Model loaded from {model_path}")
        
        if preprocessor_path:
            self.preprocessor.load(preprocessor_path)