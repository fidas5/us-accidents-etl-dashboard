import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Play, Trash2, Plus, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';

export default function ETLJobs() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newJobName, setNewJobName] = useState('');

  const fetchJobs = async () => {
    try {
      const res = await axios.get('/api/etl/jobs');
      setJobs(res.data);
    } catch (error) {
      console.error('Failed to fetch jobs', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, []);

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJobName) return;
    try {
      await axios.post('/api/etl/jobs', { name: newJobName, job_type: 'manual' });
      setNewJobName('');
      fetchJobs();
    } catch (error) {
      console.error('Failed to create job', error);
    }
  };

  const handleRunJob = async (id: number) => {
    try {
      await axios.post(`/api/etl/jobs/${id}/run`);
      fetchJobs();
    } catch (error) {
      console.error('Failed to run job', error);
    }
  };

  const handleDeleteJob = async (id: number) => {
    if (!confirm('Are you sure you want to delete this job?')) return;
    try {
      await axios.delete(`/api/etl/jobs/${id}`);
      fetchJobs();
    } catch (error) {
      console.error('Failed to delete job', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'done': return <CheckCircle className="text-success" size={24} />;
      case 'failed': return <XCircle className="text-danger" size={24} />;
      case 'running': return <RefreshCw className="text-primary spin" size={24} />;
      default: return <Clock className="text-secondary" size={24} />;
    }
  };

  return (
    <div>
      <h2 className="mb-4">ETL Jobs Management</h2>

      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <div className="row align-items-center">
            <div className="col-md-5 mb-3 mb-md-0">
              <h5 className="card-title">Create New Job</h5>
              <p className="card-text text-muted small">Create a new ETL pipeline to extract, transform, and load US Accidents data.</p>
            </div>
            <div className="col-md-7">
              <form onSubmit={handleCreateJob} className="d-flex gap-2">
                <input
                  type="text"
                  value={newJobName}
                  onChange={(e) => setNewJobName(e.target.value)}
                  placeholder="Job Name (e.g., Daily Load)"
                  className="form-control"
                  required
                />
                <button type="submit" className="btn btn-primary d-flex align-items-center text-nowrap">
                  <Plus size={18} className="me-1" /> Create Job
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <div className="card shadow-sm">
        <ul className="list-group list-group-flush">
          {jobs.length === 0 ? (
            <li className="list-group-item p-4 text-center text-muted">No ETL jobs found. Create one above.</li>
          ) : (
            jobs.map((job) => (
              <li key={job.id} className="list-group-item p-3 d-flex justify-content-between align-items-center">
                <div className="d-flex align-items-center">
                  <div className="me-3">
                    {getStatusIcon(job.status)}
                  </div>
                  <div>
                    <h6 className="mb-1 text-primary">{job.name}</h6>
                    <div className="text-muted small">
                      <span>Type: {job.job_type}</span>
                      <span className="mx-2">&middot;</span>
                      <span>Loaded: {job.rows_loaded} rows</span>
                      <span className="mx-2">&middot;</span>
                      <span>Last Run: {job.last_run_at ? format(new Date(job.last_run_at), 'PPpp') : 'Never'}</span>
                    </div>
                  </div>
                </div>
                <div className="d-flex gap-2">
                  <button
                    onClick={() => handleRunJob(job.id)}
                    disabled={job.status === 'running'}
                    className="btn btn-success btn-sm d-flex align-items-center"
                  >
                    <Play size={14} className="me-1" /> Run
                  </button>
                  <button
                    onClick={() => handleDeleteJob(job.id)}
                    disabled={job.status === 'running'}
                    className="btn btn-outline-danger btn-sm d-flex align-items-center"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
