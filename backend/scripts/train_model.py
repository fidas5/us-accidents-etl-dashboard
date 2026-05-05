#!/usr/bin/env python
"""
train_model.py - Production model with feature importance filtering
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import matplotlib
matplotlib.use('Agg')
import numpy as np
import pandas as pd
import warnings
warnings.filterwarnings('ignore')

from sqlalchemy import text
from app import create_app, db
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import (accuracy_score, balanced_accuracy_score,
                             classification_report, confusion_matrix)
import joblib
import time

SEVERITY_COLORS = {1: '#60a5fa', 2: '#fbbf24', 3: '#fb923c', 4: '#f87171'}
SEVERITY_LABELS = {1: 'Low', 2: 'Moderate', 3: 'High', 4: 'Critical'}

# Config
RF_PARAMS = dict(
    n_estimators=300,
    max_depth=18,
    min_samples_split=15,
    min_samples_leaf=6,
    max_features='sqrt',
    class_weight='balanced',
    bootstrap=True,
    oob_score=True,
    random_state=42,
    n_jobs=-1
)

# ── Data loading from star schema ──────────────────────────────────────────────

def load_data_from_star_schema(engine) -> pd.DataFrame:
    sql = text("""
        SELECT
            fa.severity,
            fa.duration_min,
            dt.hour,
            dt.month,
            dt.day_of_week,
            dt.season,
            dt.time_of_day,
            dt.is_weekend,
            dl.state,
            dl.us_region,
            dw.weather_condition,
            dw.temperature_c,
            dw.visibility_km,
            dw.temp_bucket,
            dw.visibility_bucket,
            dr.amenity,
            dr.bump,
            dr.crossing,
            dr.give_way,
            dr.junction,
            dr.no_exit,
            dr.railway,
            dr.roundabout,
            dr.station,
            dr.stop,
            dr.traffic_calming,
            dr.traffic_signal,
            dr.turning_loop,
            dr.feature_count AS road_feature_count
        FROM fact_accident fa
        LEFT JOIN dim_time dt ON dt.time_id = fa.time_id
        LEFT JOIN dim_location dl ON dl.location_id = fa.location_id
        LEFT JOIN dim_weather dw ON dw.weather_id = fa.weather_id
        LEFT JOIN dim_road dr ON dr.road_id = fa.road_id
        WHERE fa.severity IS NOT NULL
    """)
    
    print("   Loading from star schema...")
    df = pd.read_sql(sql, engine)
    
    # Fill NULLs
    categorical_cols = ['season', 'time_of_day', 'weather_condition', 'state', 
                        'us_region', 'temp_bucket', 'visibility_bucket']
    for col in categorical_cols:
        if col in df.columns:
            df[col] = df[col].fillna('Unknown')
    
    road_cols = ['amenity','bump','crossing','give_way','junction','no_exit',
                 'railway','roundabout','station','stop','traffic_calming',
                 'traffic_signal','turning_loop']
    for col in road_cols + ['road_feature_count']:
        if col in df.columns:
            df[col] = df[col].fillna(0).astype(int)
    
    return df

# ── Preprocessing with cardinality reduction ───────────────────────────────────

def reduce_cardinality(df, column, top_n=10):
    """Group rare categories into 'Other'"""
    top_cats = df[column].value_counts().head(top_n).index
    df[column] = df[column].apply(lambda x: x if x in top_cats else 'Other')
    return df

def preprocess_data(df: pd.DataFrame):
    """Convert categorical features to numeric with cardinality reduction"""
    df = df.copy()
    
    # Reduce cardinality for high-cardinality columns
    df = reduce_cardinality(df, 'state', top_n=15)
    df = reduce_cardinality(df, 'weather_condition', top_n=10)
    
    # Define categorical columns
    cat_cols = ['season', 'time_of_day', 'weather_condition', 'state', 
                'us_region', 'temp_bucket', 'visibility_bucket']
    
    # One-hot encode categoricals
    df = pd.get_dummies(df, columns=cat_cols, drop_first=False)
    
    # Separate features and target
    target_cols = ['severity']
    feature_cols = [col for col in df.columns if col not in target_cols]
    
    X = df[feature_cols].values.astype(np.float32)
    y = df['severity'].values.astype(np.int32)
    
    return X, y, feature_cols

# ── Feature importance filtering ──────────────────────────────────────────────

def filter_features_by_importance(model, X_train, y_train, X_test, feature_names, 
                                   importance_threshold=0.95):
    """
    Keep only features that contribute to cumulative importance threshold
    Returns filtered datasets and list of kept features
    """
    # Get feature importances
    importances = model.feature_importances_
    
    # Create dataframe
    fi_df = pd.DataFrame({
        'feature': feature_names,
        'importance': importances
    }).sort_values('importance', ascending=False)
    
    # Calculate cumulative importance
    fi_df['cumsum'] = fi_df['importance'].cumsum()
    fi_df['cumsum_pct'] = fi_df['cumsum'] / fi_df['importance'].sum()
    
    # Find number of features needed for threshold
    n_features_to_keep = np.argmax(fi_df['cumsum_pct'] >= importance_threshold) + 1
    
    print(f"\n📊 Feature Importance Analysis:")
    print(f"   Total features: {len(feature_names)}")
    print(f"   Features needed for {importance_threshold*100:.0f}% importance: {n_features_to_keep}")
    print(f"   Features to drop: {len(feature_names) - n_features_to_keep}")
    print(f"   Reduction: {(1 - n_features_to_keep/len(feature_names))*100:.1f}%")
    
    # Show top 10 features
    print(f"\n   Top 10 features:")
    for i, row in fi_df.head(10).iterrows():
        print(f"      {row['feature'][:40]:40s} {row['importance']:.4f}")
    
    # Get feature indices to keep
    keep_features = fi_df.head(n_features_to_keep)['feature'].values
    keep_indices = [i for i, f in enumerate(feature_names) if f in keep_features]
    
    # Filter datasets
    X_train_filtered = X_train[:, keep_indices]
    X_test_filtered = X_test[:, keep_indices]
    
    return X_train_filtered, X_test_filtered, keep_features, keep_indices, fi_df

# ── Main Training ──────────────────────────────────────────────────────────────

def main():
    print("=" * 70)
    print("🚀 Training with Feature Importance Filtering")
    print("=" * 70)
    
    app = create_app()
    
    with app.app_context():
        # Load data
        print("\n📊 Loading data from star schema...")
        df = load_data_from_star_schema(db.engine)
        print(f"   ✅ Loaded {len(df):,} records")
        
        print("\n📊 Severity distribution:")
        for sev in [1, 2, 3, 4]:
            cnt = len(df[df['severity'] == sev])
            pct = cnt / len(df) * 100
            print(f"   Severity {sev} ({SEVERITY_LABELS[sev]}): {cnt:>9,} ({pct:5.1f}%)")
        
        # Preprocess
        print("\n🔧 Preprocessing with cardinality reduction...")
        X, y, feature_names = preprocess_data(df)
        print(f"   Feature matrix: {X.shape}")
        
        # Train/test split
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.15, stratify=y, random_state=42
        )
        print(f"   Train: {len(X_train):,} | Test: {len(X_test):,}")
        
        # Step 1: Train initial model to get feature importance
        print("\n🤖 Step 1: Training initial model for feature importance...")
        print(f"   Parameters: {RF_PARAMS['n_estimators']} trees, depth={RF_PARAMS['max_depth']}")
        
        t0 = time.time()
        model_initial = RandomForestClassifier(**RF_PARAMS)
        model_initial.fit(X_train, y_train)
        print(f"   ✅ Trained in {time.time()-t0:.1f}s | OOB: {model_initial.oob_score_:.4f}")
        
        # Step 2: Filter features by importance
        X_train_filtered, X_test_filtered, keep_features, keep_indices, fi_df = \
            filter_features_by_importance(model_initial, X_train, y_train, X_test, 
                                          feature_names, importance_threshold=0.95)
        
        # Step 3: Retrain on filtered features
        print(f"\n🤖 Step 2: Retraining on {len(keep_features)} features...")
        
        t0 = time.time()
        model_final = RandomForestClassifier(**RF_PARAMS)
        model_final.fit(X_train_filtered, y_train)
        print(f"   ✅ Trained in {time.time()-t0:.1f}s | OOB: {model_final.oob_score_:.4f}")
        
        # Step 4: Evaluate
        y_pred = model_final.predict(X_test_filtered)
        accuracy = accuracy_score(y_test, y_pred)
        balanced_acc = balanced_accuracy_score(y_test, y_pred)
        report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)
        
        print(f"\n📈 Final Results:")
        print(f"   Accuracy:      {accuracy*100:.2f}%")
        print(f"   Balanced Acc:  {balanced_acc*100:.2f}%")
        print(f"   Improvement:   {(balanced_acc - 0.655)*100:+.1f}% vs baseline")
        
        # Save feature importance analysis
        fi_df.to_csv('feature_importance_analysis.csv', index=False)
        print(f"\n💾 Feature importance saved to: feature_importance_analysis.csv")
        
        # Save model and feature info
        model_dir = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), 'app', 'ml'
        )
        os.makedirs(model_dir, exist_ok=True)
        
        model_path = os.path.join(model_dir, 'severity_model.pkl')
        joblib.dump({
            'model': model_final,
            'feature_names': keep_features,
            'keep_indices': keep_indices,
            'accuracy': accuracy,
            'balanced_accuracy': balanced_acc,
            'params': RF_PARAMS
        }, model_path)
        print(f"\n💾 Model saved: {model_path}")
        
        print("\n" + "=" * 70)
        print("✅ TRAINING COMPLETE")
        print(f"   Features: {len(keep_features)} (from {len(feature_names)})")
        print(f"   Balanced Accuracy: {balanced_acc*100:.1f}%")
        print("=" * 70)

if __name__ == "__main__":
    main()