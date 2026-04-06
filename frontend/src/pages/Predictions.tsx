import React, { useState } from 'react';
import axios from 'axios';
import { BrainCircuit, AlertCircle } from 'lucide-react';

export default function Predictions() {
  const [formData, setFormData] = useState({
    temperature: 70,
    visibility: 10,
    wind_speed: 5,
    duration: 60,
    start_lat: 37.7749,
    start_lng: -122.4194,
    weather_condition: 'Clear',
    hour_of_day: 12,
    day_of_week: 3
  });
  const [prediction, setPrediction] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value;
    setFormData({ ...formData, [e.target.name]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setPrediction(null);

    try {
      const res = await axios.post('/api/predict', formData);
      setPrediction(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to get prediction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-fluid max-w-4xl mx-auto">
      <h2 className="mb-4">Accident Severity Prediction</h2>

      <div className="card shadow-sm mb-4">
        <div className="card-body p-4">
          <form onSubmit={handleSubmit}>
            <div className="row g-3 mb-4">
              <div className="col-md-4">
                <label className="form-label">Temperature (F)</label>
                <input type="number" name="temperature" value={formData.temperature} onChange={handleChange} className="form-control" />
              </div>
              <div className="col-md-4">
                <label className="form-label">Visibility (mi)</label>
                <input type="number" name="visibility" value={formData.visibility} onChange={handleChange} className="form-control" />
              </div>
              <div className="col-md-4">
                <label className="form-label">Wind Speed (mph)</label>
                <input type="number" name="wind_speed" value={formData.wind_speed} onChange={handleChange} className="form-control" />
              </div>
              <div className="col-md-4">
                <label className="form-label">Duration (min)</label>
                <input type="number" name="duration" value={formData.duration} onChange={handleChange} className="form-control" />
              </div>
              <div className="col-md-4">
                <label className="form-label">Weather Condition</label>
                <select name="weather_condition" value={formData.weather_condition} onChange={handleChange} className="form-select">
                  <option value="Clear">Clear</option>
                  <option value="Rain">Rain</option>
                  <option value="Snow">Snow</option>
                  <option value="Cloudy">Cloudy</option>
                  <option value="Fog">Fog</option>
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label">Hour of Day (0-23)</label>
                <input type="number" min="0" max="23" name="hour_of_day" value={formData.hour_of_day} onChange={handleChange} className="form-control" />
              </div>
            </div>

            <div className="d-flex justify-content-end">
              <button type="submit" disabled={loading} className="btn btn-primary d-flex align-items-center">
                <BrainCircuit size={18} className="me-2" />
                {loading ? 'Predicting...' : 'Predict Severity'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger d-flex align-items-center" role="alert">
          <AlertCircle className="me-2" size={20} />
          <div>{error}</div>
        </div>
      )}

      {prediction && (
        <div className="card shadow-sm border-top border-primary border-4">
          <div className="card-header bg-white py-3">
            <h5 className="mb-0">Prediction Result</h5>
            <small className="text-muted">Based on Random Forest Classifier</small>
          </div>
          <div className="card-body p-0">
            <ul className="list-group list-group-flush">
              <li className="list-group-item d-flex justify-content-between align-items-center p-3">
                <span className="text-muted fw-medium">Predicted Severity</span>
                <span className={`badge ${
                  prediction.predicted_severity === 4 ? 'bg-danger' : 
                  prediction.predicted_severity === 3 ? 'bg-warning text-dark' : 
                  prediction.predicted_severity === 2 ? 'bg-info text-dark' : 
                  'bg-success'
                } fs-6`}>
                  Level {prediction.predicted_severity}
                </span>
              </li>
              <li className="list-group-item d-flex justify-content-between align-items-center p-3">
                <span className="text-muted fw-medium">Confidence Score</span>
                <div className="d-flex align-items-center w-50 justify-content-end">
                  <span className="me-3">{(prediction.confidence * 100).toFixed(1)}%</span>
                  <div className="progress w-50" style={{ height: '8px' }}>
                    <div className="progress-bar bg-primary" role="progressbar" style={{ width: `${prediction.confidence * 100}%` }}></div>
                  </div>
                </div>
              </li>
              <li className="list-group-item d-flex justify-content-between align-items-center p-3">
                <span className="text-muted fw-medium">Model Used</span>
                <span className="fw-medium">{prediction.model}</span>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
