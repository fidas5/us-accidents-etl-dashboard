import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report
from sklearn.utils import resample
import joblib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app import create_app, db
from app.models import AccidentClean

app = create_app()

with app.app_context():
    rows = AccidentClean.query.all()
    df = pd.DataFrame([{
        "severity":          r.severity,
        "temperature":       r.temperature,
        "visibility":        r.visibility,
        "weather_condition": r.weather_condition,
        "hour":              r.start_time.hour if r.start_time else None,
        "latitude":          r.latitude,
        "longitude":         r.longitude,
    } for r in rows])

print(f"Loaded {len(df)} rows")

# ── Clean ────────────────────────────────────────────────────────────
df = df.dropna(subset=["severity", "temperature", "visibility",
                        "weather_condition", "hour", "latitude", "longitude"])
df = df[df["severity"].between(1, 4)]

# ── Encode weather ───────────────────────────────────────────────────
le = LabelEncoder()
df["weather_encoded"] = le.fit_transform(df["weather_condition"])

FEATURES = ["temperature", "visibility", "weather_encoded", "hour", "latitude", "longitude"]

# ── Balance classes by downsampling majority + upsampling minorities ─
target_size = 80_000  # per class — good balance vs training time

dfs = []
for sev in [1, 2, 3, 4]:
    cls = df[df["severity"] == sev]
    resampled = resample(
        cls,
        replace=len(cls) < target_size,   # upsample if smaller, downsample if larger
        n_samples=target_size,
        random_state=42
    )
    dfs.append(resampled)

df_balanced = pd.concat(dfs).sample(frac=1, random_state=42)  # shuffle
print("Balanced distribution:\n", df_balanced["severity"].value_counts().sort_index())

X = df_balanced[FEATURES]
y = df_balanced["severity"]

# ── Train / test split ───────────────────────────────────────────────
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# ── Train ────────────────────────────────────────────────────────────
model = RandomForestClassifier(
    n_estimators=200,
    max_depth=20,
    min_samples_split=5,
    min_samples_leaf=2,
    class_weight="balanced",
    random_state=42,
    n_jobs=-1,
)
print("Training… (this may take 1-2 min)")
model.fit(X_train, y_train)

# ── Evaluate ─────────────────────────────────────────────────────────
y_pred = model.predict(X_test)
print("\nClassification Report:")
print(classification_report(y_test, y_pred))

print("Feature importances:")
for feat, imp in sorted(zip(FEATURES, model.feature_importances_), key=lambda x: -x[1]):
    print(f"  {feat:<20} {imp:.4f}")

# ── Save ─────────────────────────────────────────────────────────────
out_dir = os.path.dirname(os.path.abspath(__file__))
joblib.dump(model, os.path.join(out_dir, "rf_model.pkl"))
joblib.dump(le,    os.path.join(out_dir, "weather_encoder.pkl"))
print("\nModel saved to app/ml/rf_model.pkl")