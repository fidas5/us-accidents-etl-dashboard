"""
model_trainer.py - Production RF with joint threshold calibration
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.metrics import (classification_report, confusion_matrix,
                             accuracy_score, balanced_accuracy_score, f1_score)
import joblib
from typing import Dict, Any, Tuple, List
import time

from .preprocessor import AccidentPreprocessor


# ── Config ─────────────────────────────────────────────────────────────────────
MAX_TRAIN_SAMPLES = 700_000
VAL_SIZE          = 0.10
TEST_SIZE         = 0.15
RANDOM_STATE      = 42
OVERSAMPLE_FACTOR = 4

RF_PARAMS = dict(
    n_estimators      = 300,
    max_depth         = 18,
    min_samples_split = 15,
    min_samples_leaf  = 6,
    max_features      = 'sqrt',
    class_weight      = 'balanced_subsample',
    bootstrap         = True,
    oob_score         = True,
    random_state      = RANDOM_STATE,
    n_jobs            = -1,
)

SEVERITY_LABELS = {1: "Low", 2: "Moderate", 3: "High", 4: "Critical"}

# Baseline thresholds before scale tuning
_BASE_T = {1: 0.20, 3: 0.30, 4: 0.20}
# ───────────────────────────────────────────────────────────────────────────────


class SeverityPredictor:
    """
    Random Forest with jointly-tuned minority-class probability thresholds.

    Prediction rule (priority: rarest → most common):
        P(1) > t1  →  Severity 1
        P(4) > t4  →  Severity 4
        P(3) > t3  →  Severity 3
        else       →  Severity 2  (fallback — never thresholded)

    Calibration: grid-search a single scale factor s that multiplies all
    base thresholds together, maximising macro-F1 on a held-out val set.
    """

    def __init__(self):
        self.model          = None
        self.preprocessor   = AccidentPreprocessor()
        self.classes        = [1, 2, 3, 4]
        self.thresholds: Dict[int, float] = dict(_BASE_T)
        self.severity_labels = SEVERITY_LABELS

    # ── helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _stratified_sample(X, y, max_n, rng=RANDOM_STATE):
        if len(X) <= max_n:
            return X, y
        _, Xs, _, ys = train_test_split(
            X, y, test_size=max_n, stratify=y, random_state=rng)
        print(f"[Trainer] Stratified sample {len(X):,} → {len(Xs):,}")
        return Xs, ys

    @staticmethod
    def _oversample(X, y, targets: List[int], factor: int):
        Xp, yp = [X], [y]
        for cls in targets:
            mask = y == cls
            if not mask.any():
                continue
            Xm, ym = X[mask], y[mask]
            for _ in range(factor - 1):
                Xp.append(Xm + np.random.normal(0, 0.02, Xm.shape))
                yp.append(ym)
            print(f"[Trainer] Oversample class {cls}: "
                  f"{mask.sum():,} → {mask.sum()*factor:,}")
        out_X = np.vstack(Xp)
        out_y = np.concatenate(yp)
        perm  = np.random.permutation(len(out_X))
        return out_X[perm], out_y[perm]

    @staticmethod
    def _print_dist(y, label=""):
        print(f"[Trainer] {label}")
        for c in sorted(np.unique(y.astype(int))):
            n   = int((y == c).sum())
            pct = n / len(y) * 100
            print(f"   Class {c}: {n:>9,}  ({pct:5.1f}%)  "
                  f"{'█' * max(1, int(pct / 2))}")

    # ── threshold calibration ─────────────────────────────────────────

    def _tune_thresholds(self, proba: np.ndarray,
                         y_val: np.ndarray) -> Dict[int, float]:
        """
        Joint scale-factor search over minority thresholds.
        Class 2 is never given a threshold (it is the fallback).
        """
        print("[Trainer] Tuning joint threshold scale …")
        scale_grid         = np.linspace(0.3, 2.5, 80)
        best_f1, best_s    = -1.0, 1.0

        for s in scale_grid:
            t    = {cls: float(min(_BASE_T[cls] * s, 0.85)) for cls in [1, 3, 4]}
            pred = self._apply_rule(proba, t)
            mf1  = f1_score(y_val, pred, average='macro', zero_division=0)
            if mf1 > best_f1:
                best_f1, best_s = mf1, float(s)

        # Convert to plain Python floats — avoids np.float64 serialization issues
        best_t = {cls: round(float(min(_BASE_T[cls] * best_s, 0.85)), 3)
                  for cls in [1, 3, 4]}

        print(f"   Best scale={best_s:.2f}  val macro-F1={best_f1:.3f}")
        for cls, t in best_t.items():
            print(f"   Class {cls} threshold: {t:.3f}")

        return best_t

    def _apply_rule(self, proba: np.ndarray,
                    thresholds: Dict[int, float]) -> np.ndarray:
        """Priority rule: 1 → 4 → 3 → 2(fallback)."""
        idx  = {c: self.classes.index(c) for c in self.classes}
        pred = np.full(proba.shape[0], 2, dtype=int)
        for cls in [3, 4, 1]:          # reverse priority so 1 overwrites last
            t = thresholds.get(cls, 0.25)
            pred[proba[:, idx[cls]] > t] = cls
        return pred

    # ── training ──────────────────────────────────────────────────────

    def train(self, df: pd.DataFrame) -> Dict[str, Any]:
        print("[Trainer] ── RF training ────────────────────────────────────")

        df = df[df['severity'].notna()].copy()
        df['severity'] = df['severity'].astype(int)
        X  = self.preprocessor.fit_transform(df)
        y  = df['severity'].values
        print(f"[Trainer] Feature matrix: {X.shape}")
        self._print_dist(y, "Full dataset")

        # Three-way split: train / val / test
        X_tv, X_te, y_tv, y_te = train_test_split(
            X, y, test_size=TEST_SIZE, stratify=y, random_state=RANDOM_STATE)
        val_frac = VAL_SIZE / (1 - TEST_SIZE)
        X_tr, X_val, y_tr, y_val = train_test_split(
            X_tv, y_tv, test_size=val_frac, stratify=y_tv,
            random_state=RANDOM_STATE)
        print(f"[Trainer] Split — train={len(X_tr):,}  "
              f"val={len(X_val):,}  test={len(X_te):,}")

        # Downsample + oversample minorities
        X_tr, y_tr = self._stratified_sample(X_tr, y_tr, MAX_TRAIN_SAMPLES)
        X_tr, y_tr = self._oversample(X_tr, y_tr, [1, 4], OVERSAMPLE_FACTOR)
        self._print_dist(y_tr, "Train after oversampling")

        # Fit
        print(f"\n[Trainer] Fitting RF "
              f"({RF_PARAMS['n_estimators']} trees, "
              f"depth={RF_PARAMS['max_depth']}) …")
        t0 = time.time()
        self.model = RandomForestClassifier(**RF_PARAMS)
        self.model.fit(X_tr, y_tr)
        print(f"[Trainer] Done in {time.time()-t0:.1f}s  "
              f"OOB={self.model.oob_score_:.4f}")

        # Tune thresholds on validation set
        self.thresholds = self._tune_thresholds(
            self.model.predict_proba(X_val), y_val)

        # Evaluate on test set
        print("\n[Trainer] ── Test evaluation ────────────────────────────────")
        test_proba = self.model.predict_proba(X_te)
        y_raw      = np.array(self.classes)[np.argmax(test_proba, axis=1)]
        y_cal      = self._apply_rule(test_proba, self.thresholds)

        print("  Raw argmax:")
        self._print_metrics(y_te, y_raw)
        print("\n  Calibrated (final model):")
        self._print_metrics(y_te, y_cal)

        accuracy = float(accuracy_score(y_te, y_cal))
        bal_acc  = float(balanced_accuracy_score(y_te, y_cal))
        report   = classification_report(y_te, y_cal,
                                         output_dict=True, zero_division=0)
        cm       = confusion_matrix(y_te, y_cal, labels=self.classes)

        # Clean classification_report: convert all numpy scalars to Python float
        report = self._clean_report(report)

        # Cross-validation
        print("\n[Trainer] Cross-validation …")
        Xcv, ycv = self._stratified_sample(X, y, 80_000)
        cv = cross_val_score(
            RandomForestClassifier(**RF_PARAMS), Xcv, ycv,
            cv=StratifiedKFold(5, shuffle=True, random_state=RANDOM_STATE),
            scoring='balanced_accuracy', n_jobs=-1,
        )
        print(f"  CV balanced_accuracy: {cv.mean():.4f} ±{cv.std():.4f}")

        return {
            'accuracy':              accuracy,
            'balanced_accuracy':     bal_acc,
            'cv_mean':               float(cv.mean()),
            'cv_std':                float(cv.std()),
            'cv_metric':             'balanced_accuracy',
            'classification_report': report,
            'confusion_matrix':      [[int(v) for v in row] for row in cm.tolist()],
            'feature_importance':    self.get_feature_importance(),
            'train_size':            int(len(X_tr)),
            'test_size':             int(len(X_te)),
            'thresholds':            {**self.thresholds,
                                      2: 'fallback'},
        }

    @staticmethod
    def _clean_report(report: dict) -> dict:
        """Recursively convert numpy scalars to plain Python types."""
        cleaned = {}
        for k, v in report.items():
            if isinstance(v, dict):
                cleaned[k] = {kk: float(vv) if hasattr(vv, 'item') else vv
                               for kk, vv in v.items()}
            elif hasattr(v, 'item'):
                cleaned[k] = v.item()
            else:
                cleaned[k] = v
        return cleaned

    @staticmethod
    def _print_metrics(y_true, y_pred):
        acc = accuracy_score(y_true, y_pred)
        bal = balanced_accuracy_score(y_true, y_pred)
        rep = classification_report(y_true, y_pred,
                                    output_dict=True, zero_division=0)
        print(f"  Acc={acc:.3f}  BalAcc={bal:.3f}  "
              f"MacroF1={rep.get('macro avg', {}).get('f1-score', 0):.3f}")
        for s in ['1', '2', '3', '4']:
            if s in rep:
                m = rep[s]
                print(f"    Sev {s}  P={m['precision']:.3f}  "
                      f"R={m['recall']:.3f}  F1={m['f1-score']:.3f}  "
                      f"n={int(m['support']):,}")

    # ── inference ─────────────────────────────────────────────────────

    def predict(self, features: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        self._check_trained()
        proba = self.model.predict_proba(features)
        preds = self._apply_rule(proba, self.thresholds)
        return preds, proba

    def predict_single(self, data: Dict) -> Dict[str, Any]:
        df    = pd.DataFrame([data])
        X     = self.preprocessor.transform(df)
        preds, proba = self.predict(X)
        prob_dict  = {str(c): round(float(p), 4)
                      for c, p in zip(self.classes, proba[0])}
        confidence = float(max(proba[0])) * 100
        return {
            'predicted_severity':    int(preds[0]),
            'severity_label':        self.severity_labels.get(int(preds[0]), "Unknown"),
            'probability':           prob_dict,
            'confidence_percentage': round(confidence, 2),
            'confidence_level':      ("High"     if confidence > 80 else
                                      "Moderate" if confidence > 60 else "Low"),
        }

    # ── feature importance ────────────────────────────────────────────

    def get_feature_importance(self) -> Dict[str, float]:
        self._check_trained()
        names  = self.preprocessor.get_feature_names()
        n      = min(len(names), len(self.model.feature_importances_))
        result = {names[i]: round(float(self.model.feature_importances_[i]), 4)
                  for i in range(n)}
        return dict(sorted(result.items(), key=lambda x: x[1], reverse=True))

    # ── persistence ───────────────────────────────────────────────────

    def save(self, model_path: str, preprocessor_path: str = None):
        self._check_trained()
        joblib.dump({
            'model':      self.model,
            'thresholds': self.thresholds,   # plain Python floats
        }, model_path)
        print(f"[Trainer] Model saved → {model_path}")
        if preprocessor_path:
            self.preprocessor.save(preprocessor_path)

    def load(self, model_path: str, preprocessor_path: str = None):
        payload         = joblib.load(model_path)
        self.model      = payload['model']
        raw_t           = payload.get('thresholds', dict(_BASE_T))
        # Ensure loaded thresholds are plain floats regardless of how they were saved
        self.thresholds = {k: float(v) for k, v in raw_t.items()
                           if isinstance(v, (int, float, np.floating))}
        print(f"[Trainer] Model loaded ← {model_path}")
        print(f"[Trainer] Thresholds: {self.thresholds}")
        if preprocessor_path:
            self.preprocessor.load(preprocessor_path)

    def _check_trained(self):
        if self.model is None:
            raise ValueError("Model not trained. Call train() or load() first.")