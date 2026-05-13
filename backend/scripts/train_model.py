"""
train_model.py 

Ce script crée un modèle Random Forest qui prédit la sévérité d'un accident (1=Low à 4=Critical) 

┌─────────────────────────────────────────────────────────────────────────────┐
│                         PIPELINE D'ENTRAÎNEMENT                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. CHARGE les données depuis PostgreSQL (schéma en étoile)                │
│         ↓                                                                   │
│  2. PRÉTRAITE : encode les catégories (one-hot), réduit la cardinalité     │
│         ↓                                                                   │
│  3. SPLIT : 85% entraînement, 15% test (stratifié par sévérité)           │
│         ↓                                                                   │
│  4. PREMIER MODÈLE : RandomForest avec 74 features                         │
│         ↓                                                                   │
│  5. ANALYSE D'IMPORTANCE : calcule quelles features sont utiles            │
│         ↓                                                                   │
│  6. FILTRAGE : garde seulement les features couvrant 95% de l'importance   │
│         ↓                                                                   │
│  7. SECOND MODÈLE : RandomForest avec 37 features (réduit)                 │
│         ↓                                                                   │
│  8. ÉVALUATION : précision, balanced accuracy, classification report       │
│         ↓                                                                   │
│  9. SAUVEGARDE : model.pkl + feature_importance_analysis.csv               │
│         ↓                                                                   │
│ 10. VISUALISATIONS : génère distribution des classes + importance features │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import matplotlib
matplotlib.use('Agg')   # Backend non-interactif — qui permet de créer des images (.png, .jpg, etc.) sans interface graphique.
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import warnings
warnings.filterwarnings('ignore')   # Supprime les avertissements sklearn/pandas -pour avoir une sortie plus propre.

from sqlalchemy import text
from app import create_app, db
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import (accuracy_score, balanced_accuracy_score, classification_report, confusion_matrix)
import joblib   # Sérialisation efficace pour les objets numpy volumineux
import time


# ── Constantes d'affichage (utilisées uniquement pour la console) ─────────────
SEVERITY_COLORS = {1: '#60a5fa', 2: '#fbbf24', 3: '#fb923c', 4: '#f87171'}
SEVERITY_LABELS = {1: 'Low', 2: 'Moderate', 3: 'High', 4: 'Critical'}


# ── Hyperparamètres de la RandomForest ───────────────────────────────────────
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


def audit_nulls(df):
    null_pct = df.isnull().sum() / len(df) * 100
    null_pct = null_pct[null_pct > 0].sort_values(ascending=False)
    
    if len(null_pct) == 0:
        print("   ✅ Aucune valeur NULL détectée")
        return
    
    print("\n⚠️  Valeurs NULL détectées :")
    for col, pct in null_pct.items():
        strategie = (
            "→ fillna simple"      if pct < 1   else
            "→ médiane/mode"       if pct < 5   else
            "→ KNN imputation"     if pct < 30  else
            "→ ⚠️ feature à revoir"
        )
        print(f"   {col:30s} {pct:5.2f}%  {strategie}")


def plot_class_distribution(df, save_path='class_distribution.png'):
    """
    Génère un graphique de la distribution des classes de sévérité.
    """
    plt.figure(figsize=(10, 6))
    
    # Compter les occurrences par sévérité
    class_counts = df['severity'].value_counts().sort_index()
    class_labels = [f"{sev} ({SEVERITY_LABELS[sev]})" for sev in class_counts.index]
    colors = [SEVERITY_COLORS[sev] for sev in class_counts.index]
    
    # Créer le graphique à barres
    bars = plt.bar(class_labels, class_counts.values, color=colors, edgecolor='white', linewidth=2)
    
    # Ajouter les valeurs sur les barres
    for bar, count in zip(bars, class_counts.values):
        plt.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1000,
                 f'{count:,}\n({count/len(df)*100:.1f}%)',
                 ha='center', va='bottom', fontsize=11, fontweight='bold')
    
    plt.title('Distribution des classes de sévérité', fontsize=16, fontweight='bold', pad=20)
    plt.xlabel('Niveau de sévérité', fontsize=12)
    plt.ylabel("Nombre d'accidents", fontsize=12)
    plt.xticks(rotation=0, fontsize=11)
    plt.grid(axis='y', alpha=0.3)
    
    # Ajouter une note sur le déséquilibre
    plt.figtext(0.5, 0.01, 
                f"Note: Déséquilibre marqué - Classe 2 (Moderate) représente {class_counts[2]/len(df)*100:.1f}% des données",
                ha='center', fontsize=10, style='italic')
    
    plt.tight_layout()
    plt.savefig(save_path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"   📊 Class distribution saved to: {save_path}")


def plot_feature_importance(fi_df, top_n=20, save_path='feature_importance.png'):
    """
    Génère un graphique des features les plus importantes.
    """
    plt.figure(figsize=(12, 8))
    
    # Prendre les top_n features
    top_features = fi_df.head(top_n).copy()
    top_features['feature'] = top_features['feature'].str.replace('_', ' ').str[:50]
    
    # Créer le graphique horizontal
    colors = plt.cm.Blues(np.linspace(0.4, 0.9, len(top_features)))[::-1]
    bars = plt.barh(range(len(top_features)), top_features['importance'].values, color=colors)
    
    plt.yticks(range(len(top_features)), top_features['feature'].values)
    plt.xlabel('Importance', fontsize=12)
    plt.title(f'Top {top_n} features les plus importantes', fontsize=16, fontweight='bold', pad=20)
    
    # Ajouter les valeurs
    for i, (idx, row) in enumerate(top_features.iterrows()):
        plt.text(row['importance'] + 0.002, i, f'{row["importance"]:.4f}',
                 va='center', fontsize=9)
    
    plt.gca().invert_yaxis()
    plt.grid(axis='x', alpha=0.3)
    plt.tight_layout()
    plt.savefig(save_path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"   📊 Feature importance saved to: {save_path}")


# ── Chargement des données ────────────────────────────────────────────────────

def load_data_from_star_schema(engine) -> pd.DataFrame:
    sql = text("""
        SELECT
            fa.severity,
            fa.duration_min,
            dt.hour, dt.month, dt.day_of_week,
            dt.season, dt.time_of_day, dt.is_weekend,
            dl.state, dl.us_region,
            dw.weather_condition, dw.temperature_c, dw.visibility_km,
            dw.temp_bucket, dw.visibility_bucket,
            dr.amenity, dr.bump, dr.crossing, dr.give_way, dr.junction,
            dr.no_exit, dr.railway, dr.roundabout, dr.station, dr.stop,
            dr.traffic_calming, dr.traffic_signal, dr.turning_loop,
            dr.feature_count AS road_feature_count
        FROM fact_accident fa
        LEFT JOIN dim_time     dt ON dt.time_id     = fa.time_id
        LEFT JOIN dim_location dl ON dl.location_id = fa.location_id
        LEFT JOIN dim_weather  dw ON dw.weather_id  = fa.weather_id
        LEFT JOIN dim_road     dr ON dr.road_id     = fa.road_id
        WHERE fa.severity IS NOT NULL
    """)

    print("   Loading from star schema...")
    df = pd.read_sql(sql, engine)

    df['duration_min']   = df['duration_min'].fillna(df['duration_min'].median())
    df['temperature_c']  = df['temperature_c'].fillna(df['temperature_c'].median())
    df['visibility_km']  = df['visibility_km'].fillna(df['visibility_km'].median())

    categorical_cols = ['season', 'time_of_day', 'weather_condition', 'state',
                        'us_region', 'temp_bucket', 'visibility_bucket']
    for col in categorical_cols:
        if col in df.columns:
            df[col] = df[col].fillna('Unknown')

    road_cols = ['amenity', 'bump', 'crossing', 'give_way', 'junction', 'no_exit',
                 'railway', 'roundabout', 'station', 'stop', 'traffic_calming',
                 'traffic_signal', 'turning_loop']
    for col in road_cols + ['road_feature_count']:
        if col in df.columns:
            df[col] = df[col].fillna(0).astype(int)

    return df


def reduce_cardinality(df, column, top_n=10):
    top_cats = df[column].value_counts().head(top_n).index
    df[column] = df[column].apply(lambda x: x if x in top_cats else 'Other')
    return df


def preprocess_data(df: pd.DataFrame):
    df = df.copy()
    df = reduce_cardinality(df, 'state', top_n=15)
    df = reduce_cardinality(df, 'weather_condition', top_n=10)

    cat_cols = ['season', 'time_of_day', 'weather_condition', 'state',
                'us_region', 'temp_bucket', 'visibility_bucket']

    df = pd.get_dummies(df, columns=cat_cols, drop_first=False)

    target_cols = ['severity']
    feature_cols = [col for col in df.columns if col not in target_cols]

    X = df[feature_cols].values.astype(np.float32)
    y = df['severity'].values.astype(np.int32)

    return X, y, feature_cols


def filter_features_by_importance(model, X_train, y_train, X_test, feature_names,
                                   importance_threshold=0.95):
    importances = model.feature_importances_

    fi_df = pd.DataFrame({
        'feature':    feature_names,
        'importance': importances
    }).sort_values('importance', ascending=False)

    fi_df['cumsum'] = fi_df['importance'].cumsum()
    fi_df['cumsum_pct'] = fi_df['cumsum'] / fi_df['importance'].sum()

    n_features_to_keep = np.argmax(fi_df['cumsum_pct'] >= importance_threshold) + 1

    print(f"\n📊 Feature Importance Analysis:")
    print(f"   Total features: {len(feature_names)}")
    print(f"   Features needed for {importance_threshold*100:.0f}% importance: {n_features_to_keep}")
    print(f"   Reduction: {(1 - n_features_to_keep/len(feature_names))*100:.1f}%")

    keep_features = fi_df.head(n_features_to_keep)['feature'].values
    keep_indices = [i for i, f in enumerate(feature_names) if f in keep_features]

    X_train_filtered = X_train[:, keep_indices]
    X_test_filtered = X_test[:, keep_indices]

    return X_train_filtered, X_test_filtered, keep_features, keep_indices, fi_df


# ── Pipeline d'entraînement principal ────────────────────────────────────────

def main():
    print("=" * 70)
    print("🚀 Training with Feature Importance Filtering")
    print("=" * 70)

    app = create_app()

    with app.app_context():
       
        # ── Étape 1 : Chargement ──────────────────────────────────────────
        print("\n📊 Loading data from star schema...")
        df = load_data_from_star_schema(db.engine)
        print(f"   ✅ Loaded {len(df):,} records")

        # ── FIGURE 1 : Distribution des classes ───────────────────────────
        print("\n📊 Génération de la distribution des classes...")
        plot_class_distribution(df, save_path='class_distribution.png')

        print("\n📊 Audit des valeurs NULL...")
        audit_nulls(df)
        
        print("\n📊 Severity distribution:")
        for sev in [1, 2, 3, 4]:
            cnt = len(df[df['severity'] == sev])
            pct = cnt / len(df) * 100
            print(f"   Severity {sev} ({SEVERITY_LABELS[sev]}): {cnt:>9,} ({pct:5.1f}%)")

        # ── Étape 2 : Prétraitement ───────────────────────────────────────
        print("\n🔧 Preprocessing with cardinality reduction...")
        X, y, feature_names = preprocess_data(df)
        print(f"   Feature matrix: {X.shape}")

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.15, stratify=y, random_state=42
        )
        print(f"   Train: {len(X_train):,} | Test: {len(X_test):,}")

        # ── Étape 3 : Entraînement initial ──────────────────────────────────
        print("\n🤖 Step 1: Training initial model for feature importance...")
        print(f"   Parameters: {RF_PARAMS['n_estimators']} trees, depth={RF_PARAMS['max_depth']}")

        t0 = time.time()
        model_initial = RandomForestClassifier(**RF_PARAMS)
        model_initial.fit(X_train, y_train)
        print(f"   ✅ Trained in {time.time()-t0:.1f}s | OOB: {model_initial.oob_score_:.4f}")

        # ── Étape 4 : Filtrage par importance ─────────────────────────────
        X_train_filtered, X_test_filtered, keep_features, keep_indices, fi_df = \
            filter_features_by_importance(
                model_initial, X_train, y_train, X_test,
                feature_names, importance_threshold=0.95
            )

        # ── FIGURE 2 : Importance des features ────────────────────────────
        print("\n📊 Génération du graphique d'importance des features...")
        plot_feature_importance(fi_df, top_n=20, save_path='feature_importance.png')

        # ── Étape 5 : Entraînement final ───────────────────────────────────
        print(f"\n🤖 Step 2: Retraining on {len(keep_features)} features...")

        t0 = time.time()
        model_final = RandomForestClassifier(**RF_PARAMS)
        model_final.fit(X_train_filtered, y_train)
        print(f"   ✅ Trained in {time.time()-t0:.1f}s | OOB: {model_final.oob_score_:.4f}")

        # ── Étape 6 : Évaluation ──────────────────────────────────────────
        y_pred = model_final.predict(X_test_filtered)

        accuracy = accuracy_score(y_test, y_pred)
        balanced_acc = balanced_accuracy_score(y_test, y_pred)

        print(f"\n📈 Final Results:")
        print(f"   Accuracy:      {accuracy*100:.2f}%")
        print(f"   Balanced Acc:  {balanced_acc*100:.2f}%")

        # ── Étape 7 : Sauvegarde des artefacts ───────────────────────────
        fi_df.to_csv('feature_importance_analysis.csv', index=False)
        print(f"\n💾 Feature importance saved to: feature_importance_analysis.csv")

        model_dir = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), 'app', 'ml'
        )
        os.makedirs(model_dir, exist_ok=True)
        model_path = os.path.join(model_dir, 'severity_model.pkl')

        joblib.dump({
            'model':             model_final,
            'feature_names':     keep_features,
            'keep_indices':      keep_indices,
            'accuracy':          accuracy,
            'balanced_accuracy': balanced_acc,
            'params':            RF_PARAMS
        }, model_path)
        print(f"\n💾 Model saved: {model_path}")

        print("\n" + "=" * 70)
        print("✅ TRAINING COMPLETE")
        print(f"   Features: {len(keep_features)} (from {len(feature_names)})")
        print(f"   Balanced Accuracy: {balanced_acc*100:.1f}%")
        print(f"   📊 Figures générées:")
        print(f"      - class_distribution.png")
        print(f"      - feature_importance.png")
        print("=" * 70)


if __name__ == "__main__":
    main()