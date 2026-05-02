#!/usr/bin/env python
"""
train_model.py - Script pour entraîner le modèle avec sauvegarde des graphiques
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import matplotlib
matplotlib.use('Agg')  # Mode non-interactif
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import warnings
warnings.filterwarnings('ignore')

from app import create_app, db
from app.models import AccidentClean
from app.ml.model_trainer import SeverityPredictor


def save_feature_importance_chart(importance: dict, save_path: str):
    """Sauvegarde le graphique d'importance des features"""
    features = list(importance.keys())
    values = list(importance.values())
    
    fig, ax = plt.subplots(figsize=(10, 6))
    
    # Trier par importance
    sorted_idx = np.argsort(values)
    features_sorted = [features[i] for i in sorted_idx]
    values_sorted = [values[i] for i in sorted_idx]
    
    # Créer les barres
    bars = ax.barh(features_sorted, values_sorted, color='#667eea', edgecolor='#4a5fc3')
    
    # Ajouter les valeurs
    for bar, val in zip(bars, values_sorted):
        ax.text(val + 0.005, bar.get_y() + bar.get_height()/2, 
                f'{val:.3f}', va='center', fontsize=9)
    
    ax.set_xlabel('Importance', fontsize=11)
    ax.set_title('Feature Importance - Random Forest', fontsize=13, fontweight='bold')
    ax.tick_params(axis='y', labelsize=10)
    ax.grid(axis='x', alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(save_path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"   ✅ Feature importance chart saved to {save_path}")


def save_confusion_matrix_chart(cm: np.ndarray, classes: list, save_path: str):
    """Sauvegarde la matrice de confusion"""
    fig, ax = plt.subplots(figsize=(8, 6))
    im = ax.imshow(cm, interpolation='nearest', cmap='Blues')
    ax.set_xticks(np.arange(len(classes)))
    ax.set_yticks(np.arange(len(classes)))
    ax.set_xticklabels(classes)
    ax.set_yticklabels(classes)
    
    # Ajouter les valeurs
    for i in range(len(classes)):
        for j in range(len(classes)):
            ax.text(j, i, cm[i, j],
                   ha="center", va="center",
                   color="white" if cm[i, j] > cm.max() / 2 else "black",
                   fontsize=11)
    
    ax.set_xlabel('Predicted Severity', fontsize=11)
    ax.set_ylabel('True Severity', fontsize=11)
    ax.set_title('Confusion Matrix', fontsize=13, fontweight='bold')
    
    plt.colorbar(im, ax=ax)
    plt.tight_layout()
    plt.savefig(save_path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"   ✅ Confusion matrix saved to {save_path}")


def save_performance_chart(results: dict, save_path: str):
    """Sauvegarde le graphique de performance par classe"""
    # Use classification_report instead of per_class
    classes = ['1', '2', '3', '4']
    precisions = []
    recalls = []
    f1_scores = []
    
    for sev in classes:
        if sev in results['classification_report']:
            metrics = results['classification_report'][sev]
            precisions.append(metrics['precision'] * 100)
            recalls.append(metrics['recall'] * 100)
            f1_scores.append(metrics['f1-score'] * 100)
        else:
            precisions.append(0)
            recalls.append(0)
            f1_scores.append(0)
    
    x = np.arange(len(classes))
    width = 0.25
    
    fig, ax = plt.subplots(figsize=(10, 6))
    rects1 = ax.bar(x - width, precisions, width, label='Precision', color='#60a5fa')
    rects2 = ax.bar(x, recalls, width, label='Recall', color='#fbbf24')
    rects3 = ax.bar(x + width, f1_scores, width, label='F1-Score', color='#34d399')
    
    ax.set_xlabel('Severity', fontsize=11)
    ax.set_ylabel('Score (%)', fontsize=11)
    ax.set_title('Performance by Severity Class', fontsize=13, fontweight='bold')
    ax.set_xticks(x)
    ax.set_xticklabels([f'Severity {c}' for c in classes])
    ax.legend()
    ax.set_ylim(0, 100)
    ax.grid(axis='y', alpha=0.3)
    
    # Ajouter les valeurs
    for rect in rects1 + rects2 + rects3:
        height = rect.get_height()
        if height > 0:  # Only add annotation if height > 0
            ax.annotate(f'{height:.0f}%',
                       xy=(rect.get_x() + rect.get_width() / 2, height),
                       xytext=(0, 3), textcoords="offset points",
                       ha='center', va='bottom', fontsize=8)
    
    plt.tight_layout()
    plt.savefig(save_path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"   ✅ Performance chart saved to {save_path}")

def main():
    print("=" * 70)
    print("🚀 Entraînement du modèle avec sauvegarde des graphiques")
    print("=" * 70)
    
    app = create_app()
    
    with app.app_context():
        print("\n📊 Chargement des données...")
        query = db.session.query(AccidentClean).filter(
            AccidentClean.severity.isnot(None),
            AccidentClean.start_time.isnot(None)
        )
        
        df = pd.read_sql(query.statement, db.engine)
        print(f"   ✅ {len(df):,} enregistrements chargés")
        
        # Distribution des sévérités
        severity_labels = {1: "Low", 2: "Moderate", 3: "High", 4: "Critical"}
        print("\n📊 Distribution des sévérités:")
        for sev in [1, 2, 3, 4]:
            count = len(df[df['severity'] == sev])
            pct = count / len(df) * 100
            bar = "█" * int(pct / 2)
            print(f"   Severity {sev} ({severity_labels[sev]}): {count:>8,} ({pct:>5.1f}%) {bar}")
        
        # Entraînement
        print("\n🤖 Entraînement du modèle Random Forest...")
        predictor = SeverityPredictor()
        results = predictor.train(df)
        
        # Afficher les résultats
        print(f"\n📈 Accuracy: {results['accuracy']:.4f} ({results['accuracy']*100:.2f}%)")
        print(f"   CV Score: {results['cv_mean']:.4f} (±{results['cv_std']:.4f})")
        
        # Créer le dossier static/images s'il n'existe pas
        static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static', 'images')
        os.makedirs(static_dir, exist_ok=True)
        
        # 1. Sauvegarder l'importance des features
        print("\n📊 Génération des graphiques...")
        feature_chart_path = os.path.join(static_dir, 'feature_importance.png')
        save_feature_importance_chart(results['feature_importance'], feature_chart_path)
        
        # 2. Sauvegarder la matrice de confusion
        cm = np.array(results['confusion_matrix'])
        cm_chart_path = os.path.join(static_dir, 'confusion_matrix.png')
        save_confusion_matrix_chart(cm, [1, 2, 3, 4], cm_chart_path)
        
        # 3. Sauvegarder le graphique de performance
        perf_chart_path = os.path.join(static_dir, 'performance_chart.png')
        save_performance_chart(results, perf_chart_path)
        
        # 4. Sauvegarder un résumé HTML
        html_path = os.path.join(static_dir, 'model_report.html')
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Model Training Report</title>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }}
                .container {{ max-width: 900px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }}
                h1 {{ color: #333; }}
                .metric {{ display: inline-block; margin: 20px; padding: 15px; background: #f0f0f0; border-radius: 8px; }}
                .metric-value {{ font-size: 28px; font-weight: bold; color: #667eea; }}
                .metric-label {{ font-size: 12px; color: #666; }}
                img {{ max-width: 100%; margin: 20px 0; border: 1px solid #ddd; border-radius: 8px; }}
                table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
                th, td {{ padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }}
                th {{ background: #f0f0f0; }}
                .severity-1 {{ color: #60a5fa; }}
                .severity-2 {{ color: #fbbf24; }}
                .severity-3 {{ color: #fb923c; }}
                .severity-4 {{ color: #f87171; }}
            </style>
        </head>
        <body>
            <div class="container">
                <h1>📊 Random Forest Model Training Report</h1>
                <p>Training completed on {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
                
                <div class="metric">
                    <div class="metric-value">{results['accuracy']*100:.1f}%</div>
                    <div class="metric-label">Accuracy</div>
                </div>
                <div class="metric">
                    <div class="metric-value">{results['cv_mean']*100:.1f}%</div>
                    <div class="metric-label">CV Score (5-fold)</div>
                </div>
                <div class="metric">
                    <div class="metric-value">{results['test_size']:,}</div>
                    <div class="metric-label">Test Samples</div>
                </div>
                
                <h2>📈 Performance by Class</h2>
                <img src="performance_chart.png" alt="Performance Chart">
                
                <h2>⭐ Feature Importance</h2>
                <img src="feature_importance.png" alt="Feature Importance">
                
                <h2>📊 Confusion Matrix</h2>
                <img src="confusion_matrix.png" alt="Confusion Matrix">
                
                <h2>📋 Classification Report</h2>
                <table>
                    <tr>
                        <th>Severity</th>
                        <th>Precision</th>
                        <th>Recall</th>
                        <th>F1-Score</th>
                        <th>Support</th>
                    </tr>
        """
        for sev in ['1', '2', '3', '4']:
            if sev in results['classification_report']:
                metrics = results['classification_report'][sev]
                color_class = f"severity-{sev}"
                html_content += f"""
                    <tr>
                        <td class="{color_class}"><strong>Severity {sev}</strong></td>
                        <td>{metrics['precision']:.3f}</td>
                        <td>{metrics['recall']:.3f}</td>
                        <td>{metrics['f1-score']:.3f}</td>
                        <td>{int(metrics['support']):,}</td>
                    </tr>
                """
        
        html_content += """
                </table>
                
                <h2>⭐ Top 5 Features</h2>
                <ol>
        """
        for i, (feature, importance) in enumerate(list(results['feature_importance'].items())[:5]):
            html_content += f"<li><strong>{feature}</strong>: {importance:.4f} ({importance*100:.1f}%)</li>\n"
        
        html_content += """
                </ol>
                
                <hr>
                <p style="color: #666; font-size: 12px;">Model: Random Forest | Class Weight: Balanced | Features: 10</p>
            </div>
        </body>
        </html>
        """
        
        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        print(f"   ✅ HTML report saved to {html_path}")
        
        # Sauvegarde du modèle
        print("\n💾 Sauvegarde du modèle...")
        model_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'app', 'ml')
        os.makedirs(model_dir, exist_ok=True)
        
        model_path = os.path.join(model_dir, 'severity_model.pkl')
        preprocessor_path = os.path.join(model_dir, 'preprocessor.pkl')
        
        predictor.save(model_path, preprocessor_path)
        
        print("\n" + "=" * 70)
        print("✅ ENTRAÎNEMENT TERMINÉ AVEC SUCCÈS!")
        print(f"   Modèle: {model_path}")
        print(f"   Préprocesseur: {preprocessor_path}")
        print(f"   Rapport HTML: {html_path}")
        print(f"   Images: {static_dir}")
        print("=" * 70)


if __name__ == "__main__":
    main()