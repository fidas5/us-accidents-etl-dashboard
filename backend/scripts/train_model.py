#!/usr/bin/env python
"""
train_model.py - Training script with dim_road join and joint threshold calibration
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import numpy as np
import pandas as pd
import warnings
warnings.filterwarnings('ignore')

from sqlalchemy import text
from app import create_app, db
from app.ml.model_trainer import SeverityPredictor

SEVERITY_COLORS = {1: '#60a5fa', 2: '#fbbf24', 3: '#fb923c', 4: '#f87171'}
SEVERITY_LABELS = {1: 'Low', 2: 'Moderate', 3: 'High', 4: 'Critical'}


# ── Data loading ──────────────────────────────────────────────────────────────

def load_data_with_road_features(engine) -> pd.DataFrame:
    sql = text("""
        SELECT
            ac.id, ac.accident_id, ac.start_time, ac.end_time,
            ac.severity, ac.state, ac.weather_condition,
            ac.temperature_c, ac.visibility_km,
            ac.season, ac.time_of_day, ac.duration_min,
            dr.amenity, dr.bump, dr.crossing, dr.give_way, dr.junction,
            dr.no_exit, dr.railway, dr.roundabout, dr.station, dr.stop,
            dr.traffic_calming, dr.traffic_signal, dr.turning_loop,
            dr.feature_count AS road_feature_count
        FROM accidents_clean ac
        LEFT JOIN fact_accident fa ON fa.accident_id = ac.accident_id
        LEFT JOIN dim_road dr      ON dr.road_id     = fa.road_id
        WHERE ac.severity IS NOT NULL
          AND ac.start_time IS NOT NULL
    """)

    print("   Loading accidents_clean + dim_road join …")
    df = pd.read_sql(sql, engine)

    road_cols = ['amenity','bump','crossing','give_way','junction','no_exit',
                 'railway','roundabout','station','stop','traffic_calming',
                 'traffic_signal','turning_loop']
    filled = df[road_cols].notna().any().sum()
    print(f"   Road features joined: {filled}/13 columns "
          f"{'✅' if filled == 13 else '⚠️ partial'}")

    null_pct = df[road_cols[0]].isna().mean() * 100
    if null_pct > 0:
        print(f"   ⚠️  {null_pct:.1f}% rows have NULL road features — filling 0")
        for col in road_cols + ['road_feature_count']:
            if col in df.columns:
                df[col] = df[col].fillna(0)

    return df


# ── Charts ────────────────────────────────────────────────────────────────────

def save_feature_importance_chart(importance: dict, path: str):
    features = list(importance.keys())[:15]
    values   = [importance[f] for f in features]
    idx      = np.argsort(values)
    fs, vs   = [features[i] for i in idx], [values[i] for i in idx]

    road_set = {'amenity','bump','crossing','give_way','junction','no_exit',
                'railway','roundabout','station','stop','traffic_calming',
                'traffic_signal','turning_loop','road_feature_count'}
    cmap   = plt.cm.Blues
    colors = ['#f97316' if f in road_set
              else cmap(0.35 + 0.6*(v/max(vs)))
              for f, v in zip(fs, vs)]

    fig, ax = plt.subplots(figsize=(12, 7))
    bars = ax.barh(fs, vs, color=colors, edgecolor='none', height=0.7)
    for bar, val in zip(bars, vs):
        ax.text(val + max(vs)*0.01, bar.get_y() + bar.get_height()/2,
                f'{val:.3f}', va='center', fontsize=9, color='#333')

    from matplotlib.patches import Patch
    ax.legend(handles=[Patch(facecolor='#f97316', label='Road infrastructure'),
                       Patch(facecolor=cmap(0.7),  label='Other features')],
              fontsize=9, loc='lower right')

    ax.set_xlabel('Feature Importance', fontsize=11)
    ax.set_title('Top-15 Feature Importances (orange = road features)',
                 fontsize=13, fontweight='bold', pad=14)
    ax.tick_params(axis='y', labelsize=10)
    ax.grid(axis='x', alpha=0.25, linestyle='--')
    ax.spines[['top', 'right']].set_visible(False)
    plt.tight_layout()
    plt.savefig(path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"   ✅ Feature importance → {path}")


def save_confusion_matrix_chart(cm: np.ndarray, path: str):
    labels  = [f'Sev {i}\n({SEVERITY_LABELS[i]})' for i in [1,2,3,4]]
    cm_norm = cm.astype(float) / cm.sum(axis=1, keepdims=True).clip(1)

    fig, ax = plt.subplots(figsize=(8, 7))
    im = ax.imshow(cm_norm, cmap='Blues', vmin=0, vmax=1)
    ax.set_xticks(range(4)); ax.set_yticks(range(4))
    ax.set_xticklabels(labels, fontsize=10)
    ax.set_yticklabels(labels, fontsize=10)
    for i in range(4):
        for j in range(4):
            color = 'white' if cm_norm[i,j] > 0.55 else 'black'
            ax.text(j, i, f'{cm[i,j]:,}\n({cm_norm[i,j]*100:.1f}%)',
                    ha='center', va='center', fontsize=9, color=color)
    ax.set_xlabel('Predicted', fontsize=11)
    ax.set_ylabel('Actual',    fontsize=11)
    ax.set_title('Confusion Matrix (counts + row %)',
                 fontsize=13, fontweight='bold', pad=14)
    plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    plt.tight_layout()
    plt.savefig(path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"   ✅ Confusion matrix  → {path}")


def save_performance_chart(report: dict, path: str):
    classes    = ['1','2','3','4']
    bar_colors = ['#60a5fa','#fbbf24','#34d399']
    width, x   = 0.22, np.arange(len(classes))

    fig, ax = plt.subplots(figsize=(11, 6))
    for i, (metric, color) in enumerate(
            zip(['precision','recall','f1-score'], bar_colors)):
        vals  = [report.get(c,{}).get(metric,0)*100 for c in classes]
        rects = ax.bar(x+(i-1)*width, vals, width,
                       label=metric.capitalize(), color=color, edgecolor='none')
        for r in rects:
            h = r.get_height()
            if h > 2:
                ax.text(r.get_x()+r.get_width()/2, h+0.8,
                        f'{h:.1f}', ha='center', va='bottom', fontsize=8)

    ax.set_xticks(x)
    ax.set_xticklabels([f'Severity {c}\n({SEVERITY_LABELS[int(c)]})' for c in classes])
    ax.set_ylabel('Score (%)', fontsize=11)
    ax.set_ylim(0, 110)
    ax.set_title('Per-class Performance (calibrated thresholds)',
                 fontsize=13, fontweight='bold', pad=14)
    ax.legend(fontsize=10)
    ax.grid(axis='y', alpha=0.25, linestyle='--')
    ax.spines[['top','right']].set_visible(False)
    plt.tight_layout()
    plt.savefig(path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"   ✅ Performance chart → {path}")


def save_class_distribution_chart(df: pd.DataFrame, path: str):
    counts = [len(df[df['severity']==s]) for s in [1,2,3,4]]
    labels = [f'Severity {s}\n({SEVERITY_LABELS[s]})' for s in [1,2,3,4]]

    fig, ax = plt.subplots(figsize=(9, 5))
    bars = ax.bar(labels, counts, color=list(SEVERITY_COLORS.values()),
                  edgecolor='none', width=0.55)
    for bar, cnt in zip(bars, counts):
        ax.text(bar.get_x()+bar.get_width()/2,
                bar.get_height()+max(counts)*0.01,
                f'{cnt:,}', ha='center', va='bottom', fontsize=10)
    ax.set_ylabel('Sample count', fontsize=11)
    ax.set_title('Class Distribution', fontsize=13, fontweight='bold', pad=14)
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v,_: f'{int(v):,}'))
    ax.grid(axis='y', alpha=0.25, linestyle='--')
    ax.spines[['top','right']].set_visible(False)
    plt.tight_layout()
    plt.savefig(path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"   ✅ Class distribution → {path}")


def save_threshold_chart(thresholds: dict, path: str):
    """Show calibrated thresholds; Class 2 shown as 'fallback'."""
    numeric = {k: v for k, v in thresholds.items() if isinstance(v, float)}
    classes = list(numeric.keys())
    values  = list(numeric.values())
    labels  = [f'Severity {c}\n({SEVERITY_LABELS[c]})' for c in classes]
    colors  = [SEVERITY_COLORS[c] for c in classes]

    fig, ax = plt.subplots(figsize=(8, 4))
    bars = ax.bar(labels, values, color=colors, edgecolor='none', width=0.5)
    ax.axhline(0.25, color='#94a3b8', linestyle='--', linewidth=1,
               label='Argmax baseline ≈ 0.25')
    for bar, val in zip(bars, values):
        ax.text(bar.get_x()+bar.get_width()/2, bar.get_height()+0.01,
                f'{val:.3f}', ha='center', va='bottom',
                fontsize=11, fontweight='bold')

    ax.set_ylabel('Probability threshold', fontsize=11)
    ax.set_ylim(0, 0.90)
    ax.set_title('Calibrated Thresholds (Sev 2 = fallback, no threshold)',
                 fontsize=12, fontweight='bold', pad=14)
    ax.legend(fontsize=9)
    ax.grid(axis='y', alpha=0.25, linestyle='--')
    ax.spines[['top','right']].set_visible(False)

    # Annotate Sev2 as fallback
    ax.text(0.98, 0.92, 'Severity 2: fallback\n(predicted when no other\nthreshold fires)',
            transform=ax.transAxes, ha='right', va='top',
            fontsize=8, color='#64748b',
            bbox=dict(boxstyle='round,pad=0.4', facecolor='#f8fafc',
                      edgecolor='#e2e8f0'))
    plt.tight_layout()
    plt.savefig(path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"   ✅ Threshold chart   → {path}")


# ── HTML report ───────────────────────────────────────────────────────────────

def save_html_report(results: dict, df: pd.DataFrame, path: str):
    rep      = results['classification_report']
    macro    = rep.get('macro avg', {})
    weighted = rep.get('weighted avg', {})

    rows = ''
    for sev in ['1','2','3','4']:
        if sev in rep:
            m = rep[sev]
            rows += f"""
            <tr>
              <td><strong style="color:{SEVERITY_COLORS[int(sev)]}">
                Severity {sev} — {SEVERITY_LABELS[int(sev)]}</strong></td>
              <td>{m['precision']:.3f}</td><td>{m['recall']:.3f}</td>
              <td>{m['f1-score']:.3f}</td><td>{int(m['support']):,}</td>
            </tr>"""

    top5 = list(results['feature_importance'].items())[:5]
    top5_html = ''.join(
        f'<li><strong>{f}</strong>: {v:.4f} ({v*100:.1f}%)</li>'
        for f, v in top5)

    thresh_rows = ''
    for c, t in results['thresholds'].items():
        val = f'{t:.3f}' if isinstance(t, float) else str(t)
        thresh_rows += (f'<tr><td>Severity {c} '
                        f'({SEVERITY_LABELS[int(c)]})</td>'
                        f'<td>{val}</td></tr>')

    html = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>Model Report</title>
<style>
  body  {{ font-family:'Segoe UI',Arial,sans-serif; margin:40px;
           background:#f0f2f5; color:#222; }}
  .card {{ background:white; border-radius:12px; padding:28px;
           margin-bottom:28px; box-shadow:0 2px 8px rgba(0,0,0,.08); }}
  h1    {{ color:#1e293b; margin:0 0 6px; }}
  h2    {{ color:#334155; border-left:4px solid #667eea;
           padding-left:10px; margin-top:0; }}
  .kpis {{ display:flex; gap:20px; flex-wrap:wrap; margin:20px 0; }}
  .kpi  {{ background:#f8fafc; border-radius:10px; padding:18px 26px;
           min-width:130px; text-align:center; border:1px solid #e2e8f0; }}
  .kv   {{ font-size:2rem; font-weight:700; color:#667eea; }}
  .kl   {{ font-size:.78rem; color:#64748b; margin-top:4px; }}
  table {{ width:100%; border-collapse:collapse; font-size:.92rem; }}
  th,td {{ padding:10px 14px; text-align:left;
           border-bottom:1px solid #e2e8f0; }}
  th    {{ background:#f1f5f9; font-weight:600; }}
  img   {{ max-width:100%; border-radius:8px;
           border:1px solid #e2e8f0; margin-top:12px; }}
  .note {{ font-size:.8rem; color:#94a3b8; }}
  .badge {{ display:inline-block; color:white; padding:3px 10px;
            border-radius:12px; font-size:.8rem; margin:4px; }}
</style></head><body>
<div class="card">
  <h1>📊 RF + Road Features + Joint Threshold Calibration</h1>
  <p class="note">Generated: {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S')}
     &nbsp;|&nbsp; {len(df):,} records</p>
  <p>
    <span class="badge" style="background:#f97316">13 road features</span>
    <span class="badge" style="background:#667eea">Joint threshold tuning</span>
    <span class="badge" style="background:#10b981">balanced_subsample</span>
  </p>
  <div class="kpis">
    <div class="kpi"><div class="kv">{results['accuracy']*100:.1f}%</div>
      <div class="kl">Accuracy</div></div>
    <div class="kpi"><div class="kv">{results['balanced_accuracy']*100:.1f}%</div>
      <div class="kl">Balanced Accuracy</div></div>
    <div class="kpi"><div class="kv">{results['cv_mean']*100:.1f}%</div>
      <div class="kl">CV BalAcc (±{results['cv_std']*100:.1f}%)</div></div>
    <div class="kpi"><div class="kv">{macro.get('f1-score',0)*100:.1f}%</div>
      <div class="kl">Macro F1</div></div>
    <div class="kpi"><div class="kv">{weighted.get('f1-score',0)*100:.1f}%</div>
      <div class="kl">Weighted F1</div></div>
    <div class="kpi"><div class="kv">{results['test_size']:,}</div>
      <div class="kl">Test Samples</div></div>
  </div>
</div>
<div class="card"><h2>📊 Class Distribution</h2>
  <img src="class_distribution.png"></div>
<div class="card"><h2>📈 Per-class Performance</h2>
  <img src="performance_chart.png">
  <table style="margin-top:18px">
    <tr><th>Severity</th><th>Precision</th><th>Recall</th>
        <th>F1-Score</th><th>Support</th></tr>{rows}
  </table></div>
<div class="card"><h2>🎯 Confusion Matrix</h2>
  <img src="confusion_matrix.png"></div>
<div class="card"><h2>⚙️ Calibrated Thresholds</h2>
  <img src="threshold_chart.png">
  <table style="margin-top:14px; max-width:400px">
    <tr><th>Class</th><th>Threshold</th></tr>{thresh_rows}
  </table>
  <p class="note" style="margin-top:10px">
    Severity 2 has no threshold — it is always the fallback prediction
    when no other class threshold fires. This prevents it from collapsing
    all predictions to the majority class.
  </p></div>
<div class="card"><h2>⭐ Feature Importance</h2>
  <img src="feature_importance.png">
  <h3 style="margin-top:18px">Top 5</h3><ol>{top5_html}</ol></div>
<div class="card note">
  RF n=300, depth=18, balanced_subsample &nbsp;|&nbsp;
  35 features (10 numeric + 4 categorical + 21 boolean/road) &nbsp;|&nbsp;
  Joint threshold: scale grid on macro-F1
</div>
</body></html>"""

    with open(path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"   ✅ HTML report      → {path}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 70)
    print("🚀  RF Training — Road Features + Joint Threshold Calibration")
    print("=" * 70)

    app = create_app()

    with app.app_context():
        print("\n📊 Loading data …")
        df = load_data_with_road_features(db.engine)
        print(f"   ✅ {len(df):,} records  |  {df.shape[1]} columns")

        print("\n📊 Severity distribution:")
        for sev in [1, 2, 3, 4]:
            cnt = len(df[df['severity'] == sev])
            pct = cnt / len(df) * 100
            print(f"   Severity {sev} ({SEVERITY_LABELS[sev]}): "
                  f"{cnt:>9,}  ({pct:5.1f}%)  {'█'*int(pct/2)}")

        road_cols = ['amenity','bump','crossing','give_way','junction','no_exit',
                     'railway','roundabout','station','stop','traffic_calming',
                     'traffic_signal','turning_loop']
        print("\n🛣️  Road feature coverage:")
        for col in road_cols:
            if col in df.columns:
                pct = df[col].fillna(0).astype(bool).mean() * 100
                print(f"   {col:<18}: {pct:5.1f}%")

        print("\n🤖 Training …")
        predictor = SeverityPredictor()
        results   = predictor.train(df)

        print(f"\n📈 Accuracy      : {results['accuracy']:.4f} "
              f"({results['accuracy']*100:.2f}%)")
        print(f"   Balanced Acc : {results['balanced_accuracy']:.4f} "
              f"({results['balanced_accuracy']*100:.2f}%)")
        print(f"   CV BalAcc    : {results['cv_mean']:.4f} "
              f"(±{results['cv_std']:.4f})")
        print(f"   Thresholds   : {results['thresholds']}")

        static_dir = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), 'static', 'images')
        os.makedirs(static_dir, exist_ok=True)

        print("\n📊 Saving charts …")
        save_class_distribution_chart(df,
            os.path.join(static_dir, 'class_distribution.png'))
        save_feature_importance_chart(results['feature_importance'],
            os.path.join(static_dir, 'feature_importance.png'))
        save_confusion_matrix_chart(np.array(results['confusion_matrix']),
            os.path.join(static_dir, 'confusion_matrix.png'))
        save_performance_chart(results['classification_report'],
            os.path.join(static_dir, 'performance_chart.png'))
        save_threshold_chart(results['thresholds'],
            os.path.join(static_dir, 'threshold_chart.png'))
        save_html_report(results, df,
            os.path.join(static_dir, 'model_report.html'))

        print("\n💾 Saving model …")
        model_dir = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), 'app', 'ml')
        os.makedirs(model_dir, exist_ok=True)
        model_path        = os.path.join(model_dir, 'severity_model.pkl')
        preprocessor_path = os.path.join(model_dir, 'preprocessor.pkl')
        predictor.save(model_path, preprocessor_path)

        print("\n" + "=" * 70)
        print("✅  TRAINING COMPLETE")
        print(f"   Model        : {model_path}")
        print(f"   Preprocessor : {preprocessor_path}")
        print(f"   Report       : {os.path.join(static_dir, 'model_report.html')}")
        print("=" * 70)


if __name__ == "__main__":
    main()