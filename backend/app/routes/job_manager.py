"""
job_manager.py
==============
Tracks in-process ETL jobs so the frontend can poll their status
and request cancellation via a cooperative flag.

Design notes
------------
- All ETL routes run in the *same* Flask process (single-process dev server
  or a single gunicorn worker).  We therefore track jobs in a module-level
  dict keyed by the *ETLJob.id* (integer PK).
- Cancellation is cooperative: the ETL step checks `JobManager.is_cancelled`
  between batches and aborts early if True.
- `force_stop_job` is intentionally removed — sending SIGTERM to the current
  process would kill the whole server.
"""

import os
import threading
import time
from datetime import datetime
from typing import Optional

from .. import db
from ..models import ETLJob


class JobManagerError(Exception):
    """Raised when a JobManager operation cannot be completed."""


class JobManager:
    """Thread-safe registry of running ETL jobs."""

    # job_db_id (int) → { process_id, start_time, thread }
    _running: dict[int, dict] = {}
    _lock = threading.Lock()

    # ── Registration ────────────────────────────────────────────────────────

    @classmethod
    def register(cls, job_db_id: int) -> None:
        """
        Mark a job as running.  Call this *inside* the ETL route,
        right after creating/retrieving the ETLJob row.

        Raises JobManagerError if the job is already registered.
        """
        with cls._lock:
            if job_db_id in cls._running:
                raise JobManagerError(
                    f"Job {job_db_id} is already registered as running."
                )
            cls._running[job_db_id] = {
                "process_id": os.getpid(),
                "start_time": time.time(),
                "thread": threading.current_thread(),
            }

        # Persist process_id and reset cancellation flag
        try:
            job = db.session.get(ETLJob, job_db_id)
            if job:
                job.process_id = os.getpid()
                job.is_cancelled = False
                job.cancelled_at = None
                job.status = "running"
                db.session.commit()
        except Exception as exc:
            # Non-fatal — the in-memory registry is authoritative during the run
            db.session.rollback()
            print(f"[JobManager] Warning: could not persist register state: {exc}")

    @classmethod
    def unregister(cls, job_db_id: int) -> None:
        """Remove a job from the running registry (call in a finally block)."""
        with cls._lock:
            cls._running.pop(job_db_id, None)

        try:
            job = db.session.get(ETLJob, job_db_id)
            if job:
                job.process_id = None
                db.session.commit()
        except Exception as exc:
            db.session.rollback()
            print(f"[JobManager] Warning: could not clear process_id: {exc}")

    # ── Cancellation ────────────────────────────────────────────────────────

    @classmethod
    def request_cancel(cls, job_db_id: int) -> tuple[bool, str]:
        """
        Request cooperative cancellation of a running job.

        Returns (success, message).
        The ETL step must poll `is_cancelled()` between batches.
        """
        with cls._lock:
            if job_db_id not in cls._running:
                return False, f"Job {job_db_id} is not currently running."

        try:
            job = db.session.get(ETLJob, job_db_id)
            if not job:
                return False, f"ETLJob {job_db_id} not found in database."
            job.is_cancelled = True
            job.cancelled_at = datetime.utcnow()
            db.session.commit()
            return True, "Cancellation requested — job will stop after the current batch."
        except Exception as exc:
            db.session.rollback()
            return False, f"Database error while requesting cancellation: {exc}"

    @classmethod
    def is_cancelled(cls, job_db_id: int) -> bool:
        """
        Return True if a cancellation has been requested for this job.
        ETL loops call this between batches.
        """
        with cls._lock:
            if job_db_id not in cls._running:
                return False  # job already unregistered → treat as not cancelled

        try:
            # Re-query to get the latest value from another request's commit
            db.session.expire_all()
            job = db.session.get(ETLJob, job_db_id)
            return bool(job and job.is_cancelled)
        except Exception as exc:
            print(f"[JobManager] Warning: is_cancelled query failed: {exc}")
            return False

    # ── Introspection ───────────────────────────────────────────────────────

    @classmethod
    def get_running(cls) -> list[dict]:
        """Return a snapshot of all currently running jobs."""
        with cls._lock:
            snapshot = dict(cls._running)

        result = []
        for job_db_id, info in snapshot.items():
            try:
                job = db.session.get(ETLJob, job_db_id)
                if job:
                    result.append(
                        {
                            "job_id": job_db_id,
                            "name": job.name,
                            "started_at": datetime.fromtimestamp(
                                info["start_time"]
                            ).isoformat(),
                            "duration_seconds": round(
                                time.time() - info["start_time"], 1
                            ),
                            "process_id": info["process_id"],
                        }
                    )
            except Exception as exc:
                print(
                    f"[JobManager] Warning: could not fetch details for job {job_db_id}: {exc}"
                )

        return result

    @classmethod
    def is_running(cls, job_db_id: int) -> bool:
        with cls._lock:
            return job_db_id in cls._running