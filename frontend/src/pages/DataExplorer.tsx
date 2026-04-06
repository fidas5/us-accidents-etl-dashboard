import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format } from 'date-fns';

export default function DataExplorer() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get('/api/accidents?limit=100');
        setData(res.data);
      } catch (error) {
        console.error('Failed to fetch data', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Data Explorer</h2>
        <span className="text-muted">Showing latest 100 records</span>
      </div>

      <div className="card shadow-sm">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th>ID</th>
                <th>Date</th>
                <th>Severity</th>
                <th>Location</th>
                <th>Weather</th>
                <th>Temp (F)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-4 text-muted">Loading data...</td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-4 text-muted">No data available. Please run an ETL job first.</td>
                </tr>
              ) : (
                data.map((row) => (
                  <tr key={row.id}>
                    <td className="fw-medium">{row.accident_id}</td>
                    <td className="text-muted">{row.start_time ? format(new Date(row.start_time), 'PPp') : 'N/A'}</td>
                    <td>
                      <span className={`badge ${
                        row.severity === 4 ? 'bg-danger' : 
                        row.severity === 3 ? 'bg-warning text-dark' : 
                        row.severity === 2 ? 'bg-info text-dark' : 
                        'bg-success'
                      }`}>
                        Level {row.severity}
                      </span>
                    </td>
                    <td className="text-muted">{row.city}, {row.state}</td>
                    <td className="text-muted">{row.weather_condition}</td>
                    <td className="text-muted">{row.temperature}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
