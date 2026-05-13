"""
train_model.py - Modèle de production avec filtrage par importance des features

Pipeline:
  1. Charger les données d'accidents depuis le schéma en étoile PostgreSQL
  2. Prétraiter et encoder les variables catégorielles en one-hot
  3. Entraîner une première RandomForest pour mesurer l'importance des features
  4. Ne garder que les features couvrant 95% de l'importance cumulée
  5. Réentraîner une RandomForest finale sur le jeu de features réduit
  6. Évaluer et sauvegarder le modèle + métadonnées dans severity_model.pkl
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import matplotlib
matplotlib.use('Agg')   # Backend non-interactif — qui permet de créer des images (.png, .jpg, etc.) sans interface graphique.
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
# Partagés entre l'entraînement initial et final : seul le jeu de features change,
# les conditions d'entraînement restent identiques pour les deux passes.
RF_PARAMS = dict(
    n_estimators=300,       # 300 arbres : bon compromis biais-variance à cette taille
    max_depth=18,           # Assez profond pour capturer les interactions complexes
    min_samples_split=15,   # Empêche les splits sur des populations de nœuds trop petites
    min_samples_leaf=6,     # Chaque feuille doit avoir ≥6 échantillons → réduit le surapprentissage
    max_features='sqrt',    # Chaque split considère sqrt(n_features) candidats → décorrèle les arbres
    class_weight='balanced',# Pondère automatiquement les classes minoritaires (Sév 1, 3, 4)
                            # Poids = n_samples / (n_classes * effectif_classe)
    bootstrap=True,         # Chaque arbre s'entraîne sur un échantillon bootstrap des données
    oob_score=True,         # Évalue sur les échantillons out-of-bag → validation gratuite
    random_state=42,        # Reproductibilité des résultats
    n_jobs=-1               # Utilise tous les cœurs CPU disponibles
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

# ── Chargement des données ────────────────────────────────────────────────────

def load_data_from_star_schema(engine) -> pd.DataFrame:
    """
    Interroge le schéma en étoile PostgreSQL et retourne un DataFrame plat
    prêt pour le machine learning.

    Relations du schéma :
        fact_accident (centre)
            ├── dim_time      → features temporelles (heure, mois, saison, ...)
            ├── dim_location  → features géographiques (état, région US)
            ├── dim_weather   → features environnementales (temp, visibilité, ...)
            └── dim_road      → indicateurs d'infrastructure (feu, jonction, ...)
    """
    sql = text("""
        SELECT
            fa.severity,              -- Variable cible (1 à 4)
            fa.duration_min,          -- Durée de l'accident en minutes

            -- Features temporelles depuis dim_time
            dt.hour,                  -- 0 à 23
            dt.month,                 -- 1 à 12
            dt.day_of_week,           -- 0=Lundi … 6=Dimanche
            dt.season,                -- 'Été', 'Hiver', 'Automne', 'Printemps'
            dt.time_of_day,           -- 'Matin', 'Après-midi', 'Soir', 'Nuit'
            dt.is_weekend,            -- Booléen : samedi ou dimanche

            -- Features géographiques depuis dim_location
            dl.state,                 -- Abréviation de l'état US (CA, TX, …)
            dl.us_region,             -- Région plus large (West, South, …)

            -- Features environnementales depuis dim_weather
            dw.weather_condition,     -- 'Fair', 'Cloudy', 'Rain', …
            dw.temperature_c,         -- Température continue en Celsius
            dw.visibility_km,         -- Visibilité continue en kilomètres
            dw.temp_bucket,           -- Tranche de température discrétisée
            dw.visibility_bucket,     -- Tranche de visibilité discrétisée

            -- Indicateurs d'infrastructure routière depuis dim_road (tous booléens)
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
            dr.feature_count AS road_feature_count  -- Total pré-calculé des indicateurs actifs
        FROM fact_accident fa
        LEFT JOIN dim_time     dt ON dt.time_id     = fa.time_id
        LEFT JOIN dim_location dl ON dl.location_id = fa.location_id
        LEFT JOIN dim_weather  dw ON dw.weather_id  = fa.weather_id
        LEFT JOIN dim_road     dr ON dr.road_id     = fa.road_id
        WHERE fa.severity IS NOT NULL   -- Exclure les lignes sans cible connue
    """)

    print("   Loading from star schema...")
    df = pd.read_sql(sql, engine)

         # ── Remplissage défensif uniquement ──────────────────────────────────────
    # Les NULL numériques ont déjà été imputés dans l'ETL (build-clean).
    # Ces fillna sont un filet de sécurité au cas où un enregistrement
    # aurait échappé à l'imputation (ex: données ajoutées hors ETL).
    df['duration_min']   = df['duration_min'].fillna(df['duration_min'].median())
    df['temperature_c']  = df['temperature_c'].fillna(df['temperature_c'].median())
    df['visibility_km']  = df['visibility_km'].fillna(df['visibility_km'].median())

    # Catégorielles et booléens — inchangés
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


# ── Prétraitement ─────────────────────────────────────────────────────────────

def reduce_cardinality(df, column, top_n=10):
    """
    Remplace les valeurs de catégories rares par 'Other' pour éviter que
    l'encodeur one-hot ne crée des centaines de colonnes sur des features
    à forte cardinalité comme l'état américain.

    Exemple : avec top_n=15 pour 'state', les 15 états les plus fréquents
    conservent leur propre colonne ; tous les autres deviennent 'state_Other'.
    """
    top_cats = df[column].value_counts().head(top_n).index
    df[column] = df[column].apply(lambda x: x if x in top_cats else 'Other')
    return df


def preprocess_data(df: pd.DataFrame):
    """
    Transforme le DataFrame brut en matrice de features numériques (X) et
    vecteur cible (y) prêts pour sklearn.

    Étapes :
      1. Réduire la cardinalité sur state et weather (évite l'explosion de features)
      2. Encoder en one-hot toutes les colonnes catégorielles avec pd.get_dummies
         - drop_first=False : on garde toutes les catégories pour l'interprétabilité
         - Les noms de colonnes sont auto-générés : <colonne>_<valeur>, ex. season_Été
      3. Séparer en X (features) et y (cible)
      4. Caster en float32 / int32 pour l'efficacité mémoire avec 2,4M de lignes
    """
    df = df.copy()   # Ne jamais modifier le DataFrame de l'appelant

    # Réduction de cardinalité avant l'encodage one-hot
    df = reduce_cardinality(df, 'state', top_n=15)            # 50 états → 15 + Other
    df = reduce_cardinality(df, 'weather_condition', top_n=10)

    # Colonnes catégorielles à encoder en one-hot
    cat_cols = ['season', 'time_of_day', 'weather_condition', 'state',
                'us_region', 'temp_bucket', 'visibility_bucket']

    # pd.get_dummies développe chaque catégorie en colonnes binaires.
    # Les noms de colonnes générés ici définissent exactement ce que predict.py
    # doit reproduire — c'est le contrat entre entraînement et inférence.
    df = pd.get_dummies(df, columns=cat_cols, drop_first=False)

    # Tout sauf severity est une feature
    target_cols  = ['severity']
    feature_cols = [col for col in df.columns if col not in target_cols]

    X = df[feature_cols].values.astype(np.float32)   # Forme : (2_426_253, 74)
    y = df['severity'].values.astype(np.int32)        # Forme : (2_426_253,)

    return X, y, feature_cols   # feature_cols est la liste ordonnée des noms de colonnes


# ── Filtrage par importance des features ──────────────────────────────────────

def filter_features_by_importance(model, X_train, y_train, X_test, feature_names,
                                   importance_threshold=0.95):
    """
    Utilise les importances de features du modèle entraîné pour écarter
    les features à faible signal.

    Stratégie : trier les features par importance décroissante, calculer la somme
    cumulée, ne garder que les features nécessaires pour atteindre
    `importance_threshold` de l'importance totale.

    Pourquoi c'est utile :
      - Supprime les colonnes bruit qui brouillent les frontières des classes minoritaires
      - Réduit la taille du modèle et la latence de prédiction
      - Améliore souvent la généralisation (moins de surapprentissage sur des features inutiles)

    Retourne :
      X_train_filtered  — matrice d'entraînement avec seulement les colonnes conservées
      X_test_filtered   — matrice de test avec seulement les colonnes conservées
      keep_features     — tableau des noms de features conservées (sauvegardé dans .pkl)
      keep_indices      — positions entières des features conservées dans le tableau original
      fi_df             — DataFrame complet des importances (sauvegardé en CSV pour inspection)
    """
    importances = model.feature_importances_   # Une valeur par feature, somme = 1.0

    # Construire un tableau d'importances trié
    fi_df = pd.DataFrame({
        'feature':    feature_names,
        'importance': importances
    }).sort_values('importance', ascending=False)

    # Importance cumulée en fraction du total
    fi_df['cumsum']     = fi_df['importance'].cumsum()
    fi_df['cumsum_pct'] = fi_df['cumsum'] / fi_df['importance'].sum()

    # argmax trouve le PREMIER index où cumsum_pct >= threshold
    # +1 car argmax retourne un index base 0 mais on a besoin d'un nombre de features
    n_features_to_keep = np.argmax(fi_df['cumsum_pct'] >= importance_threshold) + 1

    print(f"\n📊 Feature Importance Analysis:")
    print(f"   Total features: {len(feature_names)}")
    print(f"   Features needed for {importance_threshold*100:.0f}% importance: {n_features_to_keep}")
    print(f"   Features to drop: {len(feature_names) - n_features_to_keep}")
    print(f"   Reduction: {(1 - n_features_to_keep/len(feature_names))*100:.1f}%")

    print(f"\n   Top 10 features:")
    for i, row in fi_df.head(10).iterrows():
        print(f"      {row['feature'][:40]:40s} {row['importance']:.4f}")

    # Noms et positions des features conservées
    keep_features = fi_df.head(n_features_to_keep)['feature'].values
    keep_indices  = [i for i, f in enumerate(feature_names) if f in keep_features]
    # Important : keep_indices préserve l'ORDRE ORIGINAL des colonnes, pas l'ordre
    # d'importance. Le modèle doit recevoir les features dans l'ordre d'entraînement.

    # Découper les deux matrices aux colonnes conservées uniquement
    X_train_filtered = X_train[:, keep_indices]   # (2_062_315, 37)
    X_test_filtered  = X_test[:, keep_indices]    # (  363_938, 37)

    return X_train_filtered, X_test_filtered, keep_features, keep_indices, fi_df


# ── Pipeline d'entraînement principal ────────────────────────────────────────

def main():
    print("=" * 70)
    print("🚀 Training with Feature Importance Filtering")
    print("=" * 70)

    # Initialise Flask pour que db.engine soit disponible (pool de connexions SQLAlchemy)
    app = create_app()

    with app.app_context():
       
        # ── Étape 1 : Chargement ──────────────────────────────────────────
        print("\n📊 Loading data from star schema...")
        df = load_data_from_star_schema(db.engine)
        print(f"   ✅ Loaded {len(df):,} records")

# ── Audit des valeurs NULL (après chargement, avant prétraitement) ─
# On audite ici pour voir l'état brut des données AVANT tout fillna,
# afin de décider si la stratégie de remplissage est adaptée.
        print("\n📊 Audit des valeurs NULL...")
        audit_nulls(df)
        # Afficher la distribution des classes — contexte important pour le déséquilibre :
        # La sévérité 2 représente 87% des données ; sans contre-mesures le modèle
        # ignore les classes 1, 3 et 4
        print("\n📊 Severity distribution:")
        for sev in [1, 2, 3, 4]:
            cnt = len(df[df['severity'] == sev])
            pct = cnt / len(df) * 100
            print(f"   Severity {sev} ({SEVERITY_LABELS[sev]}): {cnt:>9,} ({pct:5.1f}%)")

        # ── Étape 2 : Prétraitement ───────────────────────────────────────
        print("\n🔧 Preprocessing with cardinality reduction...")
        X, y, feature_names = preprocess_data(df)
        print(f"   Feature matrix: {X.shape}")   # ex. (2426253, 74)

        # Découpage stratifié : chaque classe de sévérité apparaît proportionnellement
        # dans train et test. 85% train / 15% test sur 2,4M lignes donne ~364K en test.
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.15, stratify=y, random_state=42
        )
        print(f"   Train: {len(X_train):,} | Test: {len(X_test):,}")

        # ── Étape 3 : Entraînement initial (74 features) ──────────────────
        # Objectif : obtenir les importances de features, PAS utiliser ce modèle
        # pour les prédictions en production.
        print("\n🤖 Step 1: Training initial model for feature importance...")
        print(f"   Parameters: {RF_PARAMS['n_estimators']} trees, depth={RF_PARAMS['max_depth']}")

        t0 = time.time()
        model_initial = RandomForestClassifier(**RF_PARAMS)
        model_initial.fit(X_train, y_train)
        # Le score OOB est une estimation de précision out-of-bag peu coûteuse —
        # pas besoin d'un jeu de validation séparé
        print(f"   ✅ Trained in {time.time()-t0:.1f}s | OOB: {model_initial.oob_score_:.4f}")

        # ── Étape 4 : Filtrage par importance ─────────────────────────────
        # Produit X_train_filtered (37 colonnes) et X_test_filtered (37 colonnes)
        X_train_filtered, X_test_filtered, keep_features, keep_indices, fi_df = \
            filter_features_by_importance(
                model_initial, X_train, y_train, X_test,
                feature_names, importance_threshold=0.95
            )

        # ── Étape 5 : Entraînement final (37 features) ───────────────────
        # Mêmes hyperparamètres, espace de features réduit → plus rapide, moins de surapprentissage
        print(f"\n🤖 Step 2: Retraining on {len(keep_features)} features...")

        t0 = time.time()
        model_final = RandomForestClassifier(**RF_PARAMS)
        model_final.fit(X_train_filtered, y_train)
        print(f"   ✅ Trained in {time.time()-t0:.1f}s | OOB: {model_final.oob_score_:.4f}")

        # ── Étape 6 : Évaluation ──────────────────────────────────────────
        y_pred = model_final.predict(X_test_filtered)

        accuracy     = accuracy_score(y_test, y_pred)
        balanced_acc = balanced_accuracy_score(y_test, y_pred)
        # balanced_accuracy = rappel moyen sur toutes les classes
        # Bien plus juste que la précision brute quand les classes sont aussi déséquilibrées

        report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)

        print(f"\n📈 Final Results:")
        print(f"   Accuracy:      {accuracy*100:.2f}%")
        print(f"   Balanced Acc:  {balanced_acc*100:.2f}%")
        print(f"   Improvement:   {(balanced_acc - 0.655)*100:+.1f}% vs baseline")
        # Baseline ~65,5% = balanced accuracy d'un prédicteur naïf majorité de classe

        # ── Étape 7 : Sauvegarde des artefacts ───────────────────────────

        # CSV : tableau complet des importances pour analyse et débogage a posteriori
        fi_df.to_csv('feature_importance_analysis.csv', index=False)
        print(f"\n💾 Feature importance saved to: feature_importance_analysis.csv")

        # Chemin de sortie : backend/app/ml/severity_model.pkl
        model_dir = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), 'app', 'ml'
        )
        os.makedirs(model_dir, exist_ok=True)
        model_path = os.path.join(model_dir, 'severity_model.pkl')

        # Sauvegarde de tout ce dont predict.py a besoin dans un seul dictionnaire :
        #   model         → la RandomForest entraînée (37 features)
        #   feature_names → liste ordonnée des 37 noms de features
        #                   predict.py l'utilise pour construire le vecteur dans le bon ordre
        #   keep_indices  → positions entières dans le tableau original de 74 features
        #                   conservées pour référence ; predict.py ne les utilise plus directement
        #   accuracy / balanced_accuracy → stockées pour l'endpoint model-info
        #   params        → hyperparamètres pour l'auditabilité et la reproductibilité
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
        print("=" * 70)


if __name__ == "__main__":
    main()