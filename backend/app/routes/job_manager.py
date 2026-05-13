"""
job_manager.py - Gestionnaire avancé des jobs ETL

Ce fichier est un gestionnaire de tâches ETL qui permet de :

✅ Éviter les exécutions parallèles (une seule tâche à la fois)

✅ Surveiller l'avancement des tâches en cours

✅ Nettoyer automatiquement les tâches bloquées (timeout)

✅ Fournir des statistiques au frontend pour l'affichage
"""

import time
import logging
from datetime import datetime
from threading import Lock
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from enum import Enum

# ─── Configuration ─────────────────────────────────────────────────────────────

# Configuration du logging
logger = logging.getLogger(__name__)

# Limites
MAX_CONCURRENT_JOBS = 1          # Nombre maximum de jobs simultanés
JOB_TIMEOUT_SECONDS = 3600       # Si un job dépasse 1h → automatiquement annulé
CLEANUP_INTERVAL_SECONDS = 60    # Vérification des jobs bloqués toutes les minutes


# États des jobs
class JobStatus(Enum):
    """États possibles d'un job ETL"""
    RUNNING = "running"      # En cours d'exécution
    TIMEOUT = "timeout"      # Expiré (trop long)
    COMPLETED = "completed"  # Terminé avec succès
    FAILED = "failed"        # Échec


@dataclass
class JobInfo:
    """Informations détaillées d'un job"""
    job_id: int # ID unique du job
    name: str  # Nom (ex: "load-raw")
    started_at: datetime   # Date/heure de début
    start_time: float     # Timestamp début (pour calculs)
    last_heartbeat: float      # Dernier signal de vie
    status: JobStatus = JobStatus.RUNNING # État actuel
    progress: Dict[str, Any] = None  # Pour stocker la progression
    
    def __post_init__(self):
        if self.progress is None:
            self.progress = {}
    
    def get_elapsed_seconds(self) -> float:
        """Temps écoulé depuis le début"""
        return time.time() - self.start_time
    
    def is_timeout(self) -> bool:
        """Vérifie si le job a dépassé le timeout"""
        return self.get_elapsed_seconds() > JOB_TIMEOUT_SECONDS
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertit en dictionnaire pour l'API"""
        return {
            "job_id": self.job_id,
            "name": self.name,
            "started_at": self.started_at.isoformat(),
            "duration_seconds": round(self.get_elapsed_seconds(), 2),
            "status": self.status.value,
            "progress": self.progress,
            "timeout_seconds": JOB_TIMEOUT_SECONDS,
            "remaining_seconds": max(0, JOB_TIMEOUT_SECONDS - self.get_elapsed_seconds())
        }


class JobManager:
    """
    Gestionnaire avancé des jobs ETL
    
    Fonctionnalités:
    ✅ Évite les exécutions parallèles d'un même job
    ✅ Limite le nombre de jobs simultanés (MAX_CONCURRENT_JOBS)
    ✅ Timeout automatique (JOB_TIMEOUT_SECONDS)
    ✅ Nettoyage périodique des jobs bloqués
    ✅ Logs détaillés
    ✅ Progression et heartbeat (signal de vie)
    """
    
    _running_jobs: Dict[int, JobInfo] = {}
    _lock = Lock()
    _cleanup_thread = None
    _last_cleanup = 0
    
    @classmethod
    def _init_cleanup(cls):
        """Initialise le thread de nettoyage si nécessaire"""
        if cls._cleanup_thread is None:
            import threading
            cls._cleanup_thread = threading.Thread(target=cls._cleanup_loop, daemon=True)
            cls._cleanup_thread.start()
            logger.info("[JobManager] ✅ Thread de nettoyage démarré")
    
    @classmethod
    def _cleanup_loop(cls):
        """Boucle de nettoyage automatique des jobs expirés"""
        while True:
            time.sleep(CLEANUP_INTERVAL_SECONDS)
            cls.cleanup_timeout_jobs()
    
    @classmethod
    def register(cls, job_id: int, name: str = "inconnu") -> None:
        """
        Enregistre un job comme en cours.
        
        Règles:
        1. Si le même job tourne déjà → exception
        2. Si trop de jobs simultanés → exception
        3. Sinon → enregistre et démarre
        """
        with cls._lock:
            # 1️⃣ Vérifier si le même job tourne déjà
            if job_id in cls._running_jobs:
                existing = cls._running_jobs[job_id]
                elapsed = existing.get_elapsed_seconds()
                logger.warning(
                    f"[JobManager] ⚠️ Job {job_id} ({name}) déjà en cours "
                    f"depuis {elapsed:.1f}s - rejet de la duplication"
                )
                raise JobManagerError(
                    f"Le job {name} est déjà en cours d'exécution. "
                    f"Démarré il y a {elapsed:.0f} secondes. "
                    f"Veuillez attendre ou vérifier s'il est bloqué."
                )
            
            # 2️⃣ Vérifier la limite de jobs simultanés
            active_count = len(cls._running_jobs)
            if active_count >= MAX_CONCURRENT_JOBS:
                active_jobs = [j.name for j in cls._running_jobs.values()]
                logger.warning(
                    f"[JobManager] ⚠️ Nombre maximum de jobs simultanés atteint "
                    f"({active_count}/{MAX_CONCURRENT_JOBS}) - rejet de {name}. "
                    f"Actifs: {active_jobs}"
                )
                raise JobManagerError(
                    f"Maximum {MAX_CONCURRENT_JOBS} jobs simultanés autorisés. "
                    f"Actuellement en cours: {', '.join(active_jobs)}. "
                    f"Veuillez attendre qu'un job se termine."
                )
            
            # 3️⃣ Enregistrer le nouveau job
            now = time.time()
            cls._running_jobs[job_id] = JobInfo(
                job_id=job_id,
                name=name,
                started_at=datetime.utcnow(),
                start_time=now,
                last_heartbeat=now,
                status=JobStatus.RUNNING
            )
            
            logger.info(
                f"[JobManager] ✅ Job {job_id} ({name}) enregistré. "
                f"Jobs actifs: {len(cls._running_jobs)}/{MAX_CONCURRENT_JOBS}"
            )
            
            # Démarrer le thread de nettoyage si nécessaire
            cls._init_cleanup()
    
    @classmethod
    def unregister(cls, job_id: int, status: JobStatus = JobStatus.COMPLETED) -> None:
        """Désenregistre un job terminé."""
        with cls._lock:
            if job_id in cls._running_jobs:
                job = cls._running_jobs[job_id]
                elapsed = job.get_elapsed_seconds()
                
                logger.info(
                    f"[JobManager] ✅ Job {job_id} ({job.name}) désenregistré. "
                    f"Durée: {elapsed:.1f}s, Statut: {status.value}"
                )
                del cls._running_jobs[job_id]
    
    @classmethod
    def heartbeat(cls, job_id: int, progress: Optional[Dict[str, Any]] = None) -> bool:
        """
        Met à jour le heartbeat (signal de vie) et la progression d'un job.
        Retourne True si le job existe, False sinon.
        """
        with cls._lock:
            if job_id not in cls._running_jobs:
                return False
            
            job = cls._running_jobs[job_id]
            job.last_heartbeat = time.time()
            
            if progress:
                job.progress.update(progress)
            
            return True
    
    @classmethod
    def cleanup_timeout_jobs(cls) -> List[int]:
        """
        Nettoie les jobs qui ont dépassé le timeout.
        Retourne la liste des IDs des jobs nettoyés.
        """
        with cls._lock:
            timeout_jobs = []
            current_time = time.time()
            
            for job_id, job in list(cls._running_jobs.items()):
                # Vérifier le timeout
                if job.is_timeout():
                    elapsed = job.get_elapsed_seconds()
                    logger.error(
                        f"[JobManager] ⏰ Job {job_id} ({job.name}) expiré après {elapsed:.1f}s "
                        f"(limite: {JOB_TIMEOUT_SECONDS}s) - désenregistrement forcé"
                    )
                    job.status = JobStatus.TIMEOUT
                    timeout_jobs.append(job_id)
                    del cls._running_jobs[job_id]
                
                # Vérifier le heartbeat (pas de signal depuis plus de 30s)
                elif current_time - job.last_heartbeat > 30:
                    logger.warning(
                        f"[JobManager] ⚠️ Job {job_id} ({job.name}) - pas de signal de vie depuis "
                        f"{current_time - job.last_heartbeat:.0f}s, peut-être bloqué"
                    )
            
            if timeout_jobs:
                logger.info(
                    f"[JobManager] 🧹 Nettoyé {len(timeout_jobs)} job(s) expiré(s): {timeout_jobs}"
                )
            
            return timeout_jobs
    
    @classmethod
    def get_running(cls) -> List[Dict[str, Any]]:
        """Retourne la liste de tous les jobs en cours."""
        with cls._lock:
            return [job.to_dict() for job in cls._running_jobs.values()]
    
    @classmethod
    def get_job(cls, job_id: int) -> Optional[Dict[str, Any]]:
        """Retourne les détails d'un job spécifique."""
        with cls._lock:
            if job_id not in cls._running_jobs:
                return None
            return cls._running_jobs[job_id].to_dict()
    
    @classmethod
    def is_running(cls, job_id: int) -> bool:
        """Vérifie si un job est enregistré."""
        with cls._lock:
            return job_id in cls._running_jobs
    
    @classmethod
    def get_stats(cls) -> Dict[str, Any]:
        """Retourne des statistiques sur le gestionnaire."""
        with cls._lock:
            active_jobs = len(cls._running_jobs)
            jobs_by_name = {}
            for job in cls._running_jobs.values():
                jobs_by_name[job.name] = jobs_by_name.get(job.name, 0) + 1
            
            return {
                "active_jobs": active_jobs,                    # Jobs actifs
                "max_concurrent": MAX_CONCURRENT_JOBS,         # Maximum autorisé
                "job_timeout_seconds": JOB_TIMEOUT_SECONDS,    # Timeout en secondes
                "jobs_by_name": jobs_by_name,                  # Répartition par nom
                "available_slots": max(0, MAX_CONCURRENT_JOBS - active_jobs),  # Slots libres
                "job_details": [job.to_dict() for job in cls._running_jobs.values()]  # Détails
            }
    
    @classmethod
    def cancel_job(cls, job_id: int) -> bool:
        """
        Annule un job bloqué (admin seulement).
        Retourne True si annulé, False si non trouvé.
        """
        with cls._lock:
            if job_id not in cls._running_jobs:
                return False
            
            job = cls._running_jobs[job_id]
            elapsed = job.get_elapsed_seconds()
            logger.warning(
                f"[JobManager] 🛑 Annulation manuelle du job {job_id} ({job.name}) "
                f"après {elapsed:.1f}s"
            )
            del cls._running_jobs[job_id]
            return True
    
    @classmethod
    def update_progress(cls, job_id: int, **kwargs) -> bool:
        """
        Met à jour la progression d'un job.
        Utile pour le frontend (polling).
        """
        return cls.heartbeat(job_id, kwargs)


class JobManagerError(Exception):
    """Exception levée quand un job ne peut pas être démarré."""
    pass


# ─── Fonction utilitaire pour les endpoints Flask ─────────────────────────────

def with_job_lock(job_name: str):
    """
    Décorateur pour protéger un endpoint ETL.
    
    Utilisation:
┌─────────────────────────────────────────────────────────────────┐
│ 1. Frontend appelle POST /etl/load-raw                          │
├─────────────────────────────────────────────────────────────────┤
│ 2. Le décorateur @with_job_lock("load-raw") s'exécute           │
│    → Crée ETLJob en base                                        │
│    → JobManager.register(job_id, "load-raw")                    │
│    → Vérifie qu'aucun autre job ne tourne                       │
├─────────────────────────────────────────────────────────────────┤
│ 3. La fonction load_raw(job_id) s'exécute                       │
│    → Pendant l'exécution : JobManager.update_progress(...)      │
│    → Frontend appelle GET /etl/progress/<id> toutes les 2s     │
├─────────────────────────────────────────────────────────────────┤
│ 4. Fin de l'exécution                                           │
│    → finally: JobManager.unregister(job_id)                    │
│    → Le job disparaît de la liste des actifs                    │
└─────────────────────────────────────────────────────────────────┘

    """
    def decorator(func):
        import functools
        
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            from ..models import ETLJob
            from flask import jsonify, current_app
            from .. import db
            
            # Créer le job en base de données
            etl_job = ETLJob(
                name=job_name,
                job_type="manuel",
                status="pending",
                started_at=datetime.utcnow(),
            )
            db.session.add(etl_job)
            db.session.commit()
            
            try:
                JobManager.register(etl_job.id, job_name)
                return func(etl_job.id, *args, **kwargs)
            except JobManagerError as e:
                return jsonify({"message": str(e)}), 409
        
        return wrapper
    
    return decorator

