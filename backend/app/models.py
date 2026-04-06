from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from . import db


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    is_verified = db.Column(db.Boolean, default=False)
    verification_code = db.Column(db.String(10), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, password: str):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)


class ETLJob(db.Model):
    __tablename__ = "etl_jobs"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    job_type = db.Column(db.String(50), nullable=False)  # manuel / automatique
    status = db.Column(db.String(50), default="pending")
    schedule = db.Column(db.String(255), nullable=True)  # cron, etc.
    last_run_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


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


class Prediction(db.Model):
    __tablename__ = "predictions"

    id = db.Column(db.Integer, primary_key=True)
    accident_id = db.Column(db.String(100), index=True)
    predicted_severity = db.Column(db.Integer, nullable=False)
    model_name = db.Column(db.String(100))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)