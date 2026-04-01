from datetime import datetime
from . import db
# Sert à gérer les comptes utilisateurs
class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
# Sert à suivre les jobs ETL (planification, exécution, monitoring).
class ETLJob(db.Model):
    __tablename__ = "etl_jobs"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    job_type = db.Column(db.String(50), nullable=False)  # manuel / automatique
    status = db.Column(db.String(50), default="pending")
    schedule = db.Column(db.String(255), nullable=True)  # cron, etc.
    last_run_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
#Sert à stocker la version nettoyée/transformée du dataset US Accidents, prête pour l’analyse et le modèle de prédiction.
class AccidentClean(db.Model):
    __tablename__ = "accidents_clean"

    id = db.Column(db.Integer, primary_key=True)
    accident_id = db.Column(db.String(100), index=True)
    start_time = db.Column(db.DateTime)
    end_time = db.Column(db.DateTime)
    severity = db.Column(db.Integer)
    city = db.Column(db.String(100))
    state = db.Column(db.String(50))
    temperature = db.Column(db.Float)
    visibility = db.Column(db.Float)
    weather_condition = db.Column(db.String(100))
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
#Sert à tracer les résultats du modèle (gravité prédite) pour le dashboard.
class Prediction(db.Model):
    __tablename__ = "predictions"

    id = db.Column(db.Integer, primary_key=True)
    accident_id = db.Column(db.String(100), index=True)
    predicted_severity = db.Column(db.Integer, nullable=False)
    model_name = db.Column(db.String(100))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)