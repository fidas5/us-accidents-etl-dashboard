import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { BarChart3, TrendingUp, TrendingDown, Info, Download } from 'lucide-react';

const API = "http://127.0.0.1:5050";

const ModelInfo: React.FC = () => {
  const { token } = useAuth();
  const [featureImportance, setFeatureImportance] = useState<Record<string, number>>({});
  const [performance, setPerformance] = useState<any>(null);
  const [comparison, setComparison] = useState<any>(null);
  const [confusionMatrixChart, setConfusionMatrixChart] = useState<string>("");
  const [featureChart, setFeatureChart] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'features' | 'performance' | 'comparison'>('features');

  useEffect(() => {
    fetchModelInfo();
  }, []);

  const fetchModelInfo = async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      const [featuresRes, perfRes, comparisonRes, cmChartRes, featureChartRes] = await Promise.all([
        axios.get(`${API}/api/predict/model-info`, { headers }),
        axios.get(`${API}/api/predict/model-performance`, { headers }),
        axios.get(`${API}/api/predict/model-comparison`, { headers }),
        axios.get(`${API}/api/predict/confusion-matrix-chart`, { headers }),
        axios.get(`${API}/api/predict/feature-importance-chart`, { headers })
      ]);
      
      setFeatureImportance(featuresRes.data.feature_importance);
      setPerformance(perfRes.data);
      setComparison(comparisonRes.data);
      setConfusionMatrixChart(cmChartRes.data.chart);
      setFeatureChart(featureChartRes.data.chart);
    } catch (error) {
      console.error('Failed to fetch model info:', error);
    } finally {
      setLoading(false);
    }
  };

  const severityLabels: Record<number, { name: string; color: string }> = {
    1: { name: "Low", color: "#60a5fa" },
    2: { name: "Moderate", color: "#fbbf24" },
    3: { name: "High", color: "#fb923c" },
    4: { name: "Critical", color: "#f87171" }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <div className="spin">⟳</div>
        <p>Loading model information...</p>
      </div>
    );
  }

  return (
    <div>
      <style>{`
        .mi-tabs {
          display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 10px;
        }
        .mi-tab {
          padding: 8px 20px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500;
          background: var(--surface2); color: var(--text-muted); transition: all 0.2s;
        }
        .mi-tab.active {
          background: var(--primary-color); color: white;
        }
        .mi-card {
          background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 20px;
        }
        .mi-title {
          font-size: 16px; font-weight: 600; margin-bottom: 16px; color: var(--text-main);
          display: flex; align-items: center; gap: 8px;
        }
        .mi-metric-grid {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px;
        }
        .mi-metric {
          text-align: center; padding: 16px; background: var(--surface2); border-radius: 10px;
        }
        .mi-metric-value {
          font-size: 28px; font-weight: 700; color: var(--primary-color);
        }
        .mi-metric-label {
          font-size: 11px; color: var(--text-muted); text-transform: uppercase; margin-top: 4px;
        }
        .mi-feature-list {
          display: flex; flex-direction: column; gap: 12px;
        }
        .mi-feature-item {
          display: flex; align-items: center; gap: 10px;
        }
        .mi-feature-name {
          width: 150px; font-size: 12px; color: var(--text-muted);
        }
        .mi-feature-bar {
          flex: 1; height: 8px; background: var(--surface2); border-radius: 4px; overflow: hidden;
        }
        .mi-feature-fill {
          height: 100%; background: linear-gradient(90deg, #667eea, #764ba2); border-radius: 4px;
          transition: width 0.3s ease;
        }
        .mi-feature-value {
          width: 50px; font-size: 11px; font-family: monospace; color: var(--text-muted); text-align: right;
        }
        .mi-table {
          width: 100%; border-collapse: collapse;
        }
        .mi-table th, .mi-table td {
          padding: 10px; text-align: left; border-bottom: 1px solid var(--border);
        }
        .mi-table th {
          font-size: 11px; color: var(--text-muted); text-transform: uppercase;
        }
        .mi-badge-improvement {
          background: rgba(34,197,94,0.1); color: #22c55e; padding: 2px 8px; border-radius: 12px; font-size: 11px;
        }
        .mi-badge-degradation {
          background: rgba(239,68,68,0.1); color: #f87171; padding: 2px 8px; border-radius: 12px; font-size: 11px;
        }
        .mi-chart-img {
          width: 100%; max-width: 600px; border-radius: 8px; margin-top: 10px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; display: inline-block; }
      `}</style>

      <div className="mi-tabs">
        <div className={`mi-tab ${activeTab === 'features' ? 'active' : ''}`} onClick={() => setActiveTab('features')}>
          <BarChart3 size={14} /> Feature Importance
        </div>
        <div className={`mi-tab ${activeTab === 'performance' ? 'active' : ''}`} onClick={() => setActiveTab('performance')}>
          <TrendingUp size={14} /> Performance
        </div>
        <div className={`mi-tab ${activeTab === 'comparison' ? 'active' : ''}`} onClick={() => setActiveTab('comparison')}>
          <Info size={14} /> With/Without Class Weight
        </div>
      </div>

      {activeTab === 'features' && (
        <div className="mi-card">
          <div className="mi-title">
            <BarChart3 size={18} /> Feature Importance (Random Forest)
          </div>
          
          {featureChart && (
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <img src={featureChart} alt="Feature Importance Chart" className="mi-chart-img" />
            </div>
          )}
          
          <div className="mi-feature-list">
            {Object.entries(featureImportance).map(([name, value]) => (
              <div key={name} className="mi-feature-item">
                <span className="mi-feature-name">{name.replace('_', ' ')}</span>
                <div className="mi-feature-bar">
                  <div className="mi-feature-fill" style={{ width: `${value * 100}%` }} />
                </div>
                <span className="mi-feature-value">{(value * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'performance' && performance && (
        <div className="mi-card">
          <div className="mi-title">
            <TrendingUp size={18} /> Model Performance Metrics
          </div>
          
          <div className="mi-metric-grid">
            <div className="mi-metric">
              <div className="mi-metric-value">{(performance.accuracy * 100).toFixed(1)}%</div>
              <div className="mi-metric-label">Accuracy</div>
            </div>
            <div className="mi-metric">
              <div className="mi-metric-value">{(performance.f1_macro * 100).toFixed(1)}%</div>
              <div className="mi-metric-label">F1 Score (Macro)</div>
            </div>
            <div className="mi-metric">
              <div className="mi-metric-value">{(performance.precision_macro * 100).toFixed(1)}%</div>
              <div className="mi-metric-label">Precision</div>
            </div>
            <div className="mi-metric">
              <div className="mi-metric-value">{(performance.recall_macro * 100).toFixed(1)}%</div>
              <div className="mi-metric-label">Recall</div>
            </div>
          </div>

          {confusionMatrixChart && (
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <img src={confusionMatrixChart} alt="Confusion Matrix" className="mi-chart-img" />
            </div>
          )}

          <table className="mi-table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Precision</th>
                <th>Recall</th>
                <th>F1-Score</th>
                <th>Support</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(performance.per_class).map(([sev, metrics]: [string, any]) => (
                <tr key={sev}>
                  <td style={{ color: severityLabels[parseInt(sev)]?.color, fontWeight: 500 }}>
                    {severityLabels[parseInt(sev)]?.name} (S{sev})
                  </td>
                  <td>{(metrics.precision * 100).toFixed(1)}%</td>
                  <td>{(metrics.recall * 100).toFixed(1)}%</td>
                  <td>{(metrics.f1_score * 100).toFixed(1)}%</td>
                  <td>{metrics.support.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
            Test set size: {performance.test_size.toLocaleString()} samples
          </div>
        </div>
      )}

      {activeTab === 'comparison' && comparison && (
        <div className="mi-card">
          <div className="mi-title">
            <Info size={18} /> Impact of Class Weight Balancing
          </div>
          
          <div className="mi-metric-grid">
            <div className="mi-metric">
              <div className="mi-metric-value">{(comparison.without_class_weight.accuracy * 100).toFixed(1)}%</div>
              <div className="mi-metric-label">Without Class Weight</div>
            </div>
            <div className="mi-metric">
              <div className="mi-metric-value">{(comparison.with_class_weight.accuracy * 100).toFixed(1)}%</div>
              <div className="mi-metric-label">With Class Weight</div>
            </div>
            <div className="mi-metric">
              <div className="mi-metric-value" style={{ color: comparison.improvement.accuracy > 0 ? '#22c55e' : '#f87171' }}>
                {comparison.improvement.accuracy > 0 ? '+' : ''}{(comparison.improvement.accuracy * 100).toFixed(1)}%
              </div>
              <div className="mi-metric-label">Improvement</div>
            </div>
          </div>

          <table className="mi-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Without Class Weight</th>
                <th>With Class Weight</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Severity 1 (Low) - Recall</td>
                <td>{(comparison.without_class_weight.per_class['1'].recall * 100).toFixed(1)}%</td>
                <td>{(comparison.with_class_weight.per_class['1'].recall * 100).toFixed(1)}%</td>
                <td>
                  <span className={comparison.improvement.severity_1_recall > 0 ? 'mi-badge-improvement' : 'mi-badge-degradation'}>
                    {comparison.improvement.severity_1_recall > 0 ? '+' : ''}{(comparison.improvement.severity_1_recall * 100).toFixed(1)}%
                  </span>
                </td>
              </tr>
              <tr>
                <td>Severity 4 (Critical) - Recall</td>
                <td>{(comparison.without_class_weight.per_class['4'].recall * 100).toFixed(1)}%</td>
                <td>{(comparison.with_class_weight.per_class['4'].recall * 100).toFixed(1)}%</td>
                <td>
                  <span className={comparison.improvement.severity_4_recall > 0 ? 'mi-badge-improvement' : 'mi-badge-degradation'}>
                    {comparison.improvement.severity_4_recall > 0 ? '+' : ''}{(comparison.improvement.severity_4_recall * 100).toFixed(1)}%
                  </span>
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: '16px', padding: '12px', background: 'var(--surface2)', borderRadius: '8px', fontSize: '12px' }}>
            <strong>💡 Insight:</strong> Class weight balancing significantly improves detection of rare classes 
            (Severity 1 and 4) at a small cost to overall accuracy. This is crucial for safety applications 
            where missing a critical accident is more expensive than a false alarm.
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelInfo;