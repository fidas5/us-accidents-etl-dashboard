"""
preprocessor.py - Feature engineering for accident severity prediction
Goal : Transform raw accident data → ML-ready numerical matrix
"""

import pandas as pd
import numpy as np
from sklearn.preprocessing import LabelEncoder, StandardScaler
from typing import List
import joblib


class AccidentPreprocessor:

    def __init__(self):
        self.label_encoders  = {}
        self.scaler          = StandardScaler()
        self.fitted          = False
        self.numerical_cols  = []
        self.boolean_cols    = []
        self.categorical_cols = ['state', 'weather_condition', 'season', 'time_of_day']
        self.exclude_cols    = [
            'severity', 'severity_label', 'id', 'accident_id',
            'start_time', 'end_time', 'city', 'latitude', 'longitude',
        ]

    # ── feature extraction ────────────────────────────────────────────

    def _extract_features(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()

        # Temporal
        if 'start_time' in df.columns:
            dt = pd.to_datetime(df['start_time'], errors='coerce')
            df['hour']        = dt.dt.hour.fillna(12).astype(int)
            df['month']       = dt.dt.month.fillna(6).astype(int)
            df['day_of_week'] = dt.dt.dayofweek.fillna(2).astype(int)
        else:
            df['hour']        = df.get('hour', 12)
            df['month']       = df.get('month', 6)
            df['day_of_week'] = df.get('day_of_week', 2)

        df['is_weekend']   = (df['day_of_week'] >= 5).astype(int)
        df['is_rush_hour'] = df['hour'].apply(lambda h: 1 if (7<=h<=9 or 16<=h<=19) else 0)
        df['is_night']     = df['hour'].apply(lambda h: 1 if (h < 6 or h >= 22) else 0)



        # Cyclic encoding (avoids 23→0 discontinuity)
        df['hour_sin']  = np.sin(2 * np.pi * df['hour']  / 24)
        df['hour_cos']  = np.cos(2 * np.pi * df['hour']  / 24)
        df['month_sin'] = np.sin(2 * np.pi * df['month'] / 12)
        df['month_cos'] = np.cos(2 * np.pi * df['month'] / 12)
        """
👉 Why?
Because:

23:00 and 00:00 are close in reality
But numerically far (23 vs 0)

So we convert into a circular representation
"""

        # Duration : Important for severity (longer accidents = more severe)
        if 'start_time' in df.columns and 'end_time' in df.columns:
            s = pd.to_datetime(df['start_time'], errors='coerce')
            e = pd.to_datetime(df['end_time'],   errors='coerce')
            df['duration_minutes'] = (e - s).dt.total_seconds().div(60).clip(0, 1440).fillna(0)
        elif 'duration_min' in df.columns:
            df['duration_minutes'] = pd.to_numeric(df['duration_min'], errors='coerce').fillna(0).clip(0, 1440)
        else:
            df['duration_minutes'] = 0

        # Weather-derived flags : From text → binary flags ,Converts messy text into strong ML signals
        if 'weather_condition' in df.columns:
            wc = df['weather_condition'].fillna('').str.lower()
            df['weather_is_precip'] = wc.str.contains(r'rain|snow|sleet|drizzle|hail|ice|freezing', regex=True).astype(int)
            df['weather_is_fog']    = wc.str.contains(r'fog|mist', regex=True).astype(int)
            df['weather_is_storm']  = wc.str.contains(r'storm|thunder|tornado', regex=True).astype(int)
            df['weather_is_wind']   = wc.str.contains(r'wind', regex=True).astype(int)

        # Road infrastructure flags (from dim_road join)
        road_cols = [
            'amenity', 'bump', 'crossing', 'give_way', 'junction',
            'no_exit', 'railway', 'roundabout', 'station', 'stop',
            'traffic_calming', 'traffic_signal', 'turning_loop',
        ]
        for col in road_cols:
            if col in df.columns:
                df[col] = df[col].fillna(False).astype(int)

        # feature_count: total active road features (powerful aggregate)
        present_road = [c for c in road_cols if c in df.columns]
        if present_road:
            df['road_feature_count'] = df[present_road].sum(axis=1)

        return df

    def _build_column_lists(self, df: pd.DataFrame):
        base_num = [
            'temperature_c', 'visibility_km',
            'hour', 'month', 'day_of_week',
            'hour_sin', 'hour_cos', 'month_sin', 'month_cos',
            'duration_minutes',
        ]
        base_bool = [
            'is_weekend', 'is_rush_hour', 'is_night',
            'weather_is_precip', 'weather_is_fog', 'weather_is_storm', 'weather_is_wind',
            # road flags
            'amenity', 'bump', 'crossing', 'give_way', 'junction',
            'no_exit', 'railway', 'roundabout', 'station', 'stop',
            'traffic_calming', 'traffic_signal', 'turning_loop',
            'road_feature_count',
        ]
        self.numerical_cols = [c for c in base_num  if c in df.columns]
        self.boolean_cols   = [c for c in base_bool if c in df.columns]

    # ── public API ────────────────────────────────────────────────────

    def fit(self, df: pd.DataFrame) -> 'AccidentPreprocessor':
        df = self._extract_features(df)
        self._build_column_lists(df)

        for col in self.categorical_cols:
            if col in df.columns:
                df[col] = df[col].fillna('Unknown').astype(str)
        for col in self.numerical_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
        for col in self.boolean_cols:
            if col in df.columns:
                df[col] = df[col].fillna(0)

        for col in self.categorical_cols:
            if col in df.columns:
                le = LabelEncoder()
                le.fit(df[col])
                self.label_encoders[col] = le

        self.scaler.fit(df[self.numerical_cols].astype(float))
        self.fitted = True

        total = len(self.numerical_cols) + len(self.boolean_cols) + len(self.categorical_cols)
        road_present = [c for c in ['amenity','bump','crossing','give_way','junction',
                                     'no_exit','railway','roundabout','station','stop',
                                     'traffic_calming','traffic_signal','turning_loop']
                        if c in df.columns]
        print(f"[Preprocessor] Fit done — {total} feature sources")
        print(f"[Preprocessor] Road features available: {len(road_present)}/13 "
              f"{'✅' if len(road_present)==13 else '⚠️ (join dim_road for full set)'}")
        return self

    def transform(self, df: pd.DataFrame) -> np.ndarray:
        if not self.fitted:
            raise ValueError("Preprocessor must be fitted first.")
        df = self._extract_features(df)

        for col in self.numerical_cols + self.boolean_cols:
            if col not in df.columns:
                df[col] = 0
        for col in self.categorical_cols:
            if col not in df.columns:
                df[col] = 'Unknown'

        for col in self.categorical_cols:
            df[col] = df[col].fillna('Unknown').astype(str)
        for col in self.numerical_cols:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
        for col in self.boolean_cols:
            df[col] = df[col].fillna(0)

        num_scaled = self.scaler.transform(df[self.numerical_cols].astype(float))

        cat_arrays = []
        for col in self.categorical_cols:
            le = self.label_encoders.get(col)
            if le and col in df.columns:
                enc = np.array([
                    le.transform([v])[0] if v in le.classes_ else 0
                    for v in df[col].astype(str)
                ]).reshape(-1, 1)
                cat_arrays.append(enc)

        bool_data = df[self.boolean_cols].values.astype(float)
        if bool_data.ndim == 1:
            bool_data = bool_data.reshape(-1, 1)

        parts = [num_scaled] + cat_arrays + [bool_data]
        return np.hstack(parts)

    def fit_transform(self, df: pd.DataFrame) -> np.ndarray:
        self.fit(df)
        return self.transform(df)

    def get_feature_names(self) -> List[str]:
        return self.numerical_cols + self.categorical_cols + self.boolean_cols

    def save(self, path: str):
        joblib.dump({
            'label_encoders':  self.label_encoders,
            'scaler':          self.scaler,
            'categorical_cols': self.categorical_cols,
            'numerical_cols':  self.numerical_cols,
            'boolean_cols':    self.boolean_cols,
            'fitted':          self.fitted,
        }, path)
        print(f"[Preprocessor] Saved → {path}")

    def load(self, path: str):
        d = joblib.load(path)
        self.label_encoders   = d['label_encoders']
        self.scaler           = d['scaler']
        self.categorical_cols = d['categorical_cols']
        self.numerical_cols   = d['numerical_cols']
        self.boolean_cols     = d['boolean_cols']
        self.fitted           = d['fitted']
        print(f"[Preprocessor] Loaded ← {path}")