"""
job_manager.py - Gestionnaire simplifié des jobs ETL
"""

import time
from datetime import datetime
from threading import Lock
from typing import Dict, Any, List


class JobManager:
    """
    Gestionnaire simplifié des jobs ETL (sans cancellation)
    """
    
    _running_jobs: Dict[int, Dict[str, Any]] = {}
    _lock = Lock()
    
    @classmethod
    def register(cls, job_id: int, name: str = "unknown") -> None:
        """Register a job as running."""
        with cls._lock:
            cls._running_jobs[job_id] = {
                "job_id": job_id,
                "name": name,
                "started_at": datetime.utcnow(),
                "start_time": time.time(),
            }
            print(f"[JobManager] ✅ Job {job_id} ({name}) registered")
    
    @classmethod
    def unregister(cls, job_id: int) -> None:
        """Unregister a job."""
        with cls._lock:
            if job_id in cls._running_jobs:
                del cls._running_jobs[job_id]
                print(f"[JobManager] ✅ Job {job_id} unregistered")
    
    @classmethod
    def get_running(cls) -> List[Dict[str, Any]]:
        """Get list of all running jobs."""
        with cls._lock:
            return [
                {
                    "job_id": job_id,
                    "name": info.get("name", "unknown"),
                    "started_at": info["started_at"].isoformat() if info.get("started_at") else None,
                    "duration_seconds": time.time() - info.get("start_time", time.time()),
                }
                for job_id, info in cls._running_jobs.items()
            ]
    
    @classmethod
    def is_running(cls, job_id: int) -> bool:
        """Check if a job is registered."""
        with cls._lock:
            return job_id in cls._running_jobs


class JobManagerError(Exception):
    pass