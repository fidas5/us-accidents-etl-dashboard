import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { Activity, AlertTriangle, Database } from 'lucide-react';

const COLORS = ['#0d6efd', '#ffc107', '#dc3545', '#6f42c1', '#198754'];

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await axios.get('/api/dashboard/stats');
        setStats(res.data);
      } catch (error) {
        console.error('Failed to fetch stats', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return <div className="d-flex justify-content-center align-items-center h-100">Loading dashboard...</div>;
  }

  if (!stats) {
    return <div>Error loading dashboard data.</div>;
  }

  const severityData = stats.severity.map((s: any) => ({
    name: `Severity ${s.severity}`,
    value: s.count
  }));

  return (
    <div>
      <h2 className="mb-4">Dashboard Overview</h2>
      
      {/* KPI Cards */}
      <div className="row g-4 mb-4">
        <div className="col-md-6 col-lg-3">
          <div className="card shadow-sm h-100">
            <div className="card-body d-flex align-items-center">
              <div className="bg-light p-3 rounded me-3">
                <Activity className="text-secondary" size={24} />
              </div>
              <div>
                <h6 className="card-title text-muted mb-1">Total Accidents</h6>
                <h3 className="mb-0">{stats.total.toLocaleString()}</h3>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-6 col-lg-3">
          <div className="card shadow-sm h-100">
            <div className="card-body d-flex align-items-center">
              <div className="bg-light p-3 rounded me-3">
                <AlertTriangle className="text-warning" size={24} />
              </div>
              <div>
                <h6 className="card-title text-muted mb-1">High Severity (3-4)</h6>
                <h3 className="mb-0">
                  {stats.severity.filter((s: any) => s.severity >= 3).reduce((acc: number, s: any) => acc + s.count, 0).toLocaleString()}
                </h3>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-6 col-lg-3">
          <div className="card shadow-sm h-100">
            <div className="card-body d-flex align-items-center">
              <div className="bg-light p-3 rounded me-3">
                <Database className="text-primary" size={24} />
              </div>
              <div>
                <h6 className="card-title text-muted mb-1">Quantitative Vars</h6>
                <h3 className="mb-0">{stats.kpi.quantitative}</h3>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-6 col-lg-3">
          <div className="card shadow-sm h-100">
            <div className="card-body d-flex align-items-center">
              <div className="bg-light p-3 rounded me-3">
                <Database className="text-info" size={24} />
              </div>
              <div>
                <h6 className="card-title text-muted mb-1">Qualitative Vars</h6>
                <h3 className="mb-0">{stats.kpi.qualitative}</h3>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="row g-4">
        <div className="col-lg-6">
          <div className="card shadow-sm h-100">
            <div className="card-body">
              <h5 className="card-title mb-4">Accidents by Severity</h5>
              <div style={{ height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={severityData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {severityData.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="card shadow-sm h-100">
            <div className="card-body">
              <h5 className="card-title mb-4">Top Weather Conditions</h5>
              <div style={{ height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.weather}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="weather_condition" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#0d6efd" name="Accidents" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12">
          <div className="card shadow-sm">
            <div className="card-body">
              <h5 className="card-title mb-4">Accidents by State (Top 5)</h5>
              <div style={{ height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.states}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="state" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#198754" name="Accidents" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
