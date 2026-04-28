from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from . import db


class User(db.Model):
    __tablename__ = "users"

    id                = db.Column(db.Integer, primary_key=True)
    email             = db.Column(db.String(255), unique=True, nullable=False)
    password_hash     = db.Column(db.String(255), nullable=False)
    is_verified       = db.Column(db.Boolean, default=False)
    verification_code = db.Column(db.String(10), nullable=True)
    created_at        = db.Column(db.DateTime, default=datetime.utcnow)
    nom               = db.Column(db.String(100), nullable=True)
    prenom            = db.Column(db.String(100), nullable=True)

    def set_password(self, password: str):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

class ETLJob(db.Model):
    __tablename__ = "etl_jobs"

    id          = db.Column(db.Integer, primary_key=True)
    name        = db.Column(db.String(255), nullable=False)
    job_type    = db.Column(db.String(50),  nullable=False)
    status      = db.Column(db.String(50),  default="pending")
    schedule    = db.Column(db.String(255), nullable=True)
    last_run_at = db.Column(db.DateTime,    nullable=True)
    created_at  = db.Column(db.DateTime,    default=datetime.utcnow)

    # Tracking fields
    rows_processed = db.Column(db.Integer, nullable=True)
    rows_inserted = db.Column(db.Integer, nullable=True)
    rows_skipped = db.Column(db.Integer, nullable=True)
    error_message = db.Column(db.Text, nullable=True)
    duration_seconds = db.Column(db.Float, nullable=True)
    started_at = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    
    # New fields for job cancellation
    process_id = db.Column(db.Integer, nullable=True)
    is_cancelled = db.Column(db.Boolean, default=False)
    cancelled_at = db.Column(db.DateTime, nullable=True)
    cancelled_by = db.Column(db.String(100), nullable=True)
    
class AccidentRaw(db.Model):
    """
    Staging table — faithful copy of the CSV columns, 2022 rows only.
    No unit conversions or derived fields here.
    """
    __tablename__ = "accidents_raw"

    id                    = db.Column(db.Integer,     primary_key=True)
    accident_id           = db.Column(db.String(100), index=True)
    start_time_raw        = db.Column(db.String(50))
    end_time_raw          = db.Column(db.String(50))
    city_raw              = db.Column(db.String(100))
    state_raw             = db.Column(db.String(50))
    severity_raw          = db.Column(db.Integer)
    temperature_raw       = db.Column(db.Float)   # original °F from CSV
    visibility_raw        = db.Column(db.Float)   # original miles from CSV
    weather_condition_raw = db.Column(db.String(100))
    latitude_raw          = db.Column(db.Float)
    longitude_raw         = db.Column(db.Float)


class AccidentClean(db.Model):
    """
    Datamart table — cleaned, unit-converted, and enriched.

    Unit conversions applied at build-clean step:
      temperature_raw (°F)  →  temperature_c  (°C)
      visibility_raw  (mi)  →  visibility_km  (km)

    Derived / enrichment columns added at build-clean step:
      severity_label  — human-readable severity (Low / Moderate / High / Critical)
      season          — Winter / Spring / Summer / Fall  (from start_time month)
      time_of_day     — Morning / Afternoon / Evening / Night  (from start_time hour)
      duration_min    — accident duration in minutes  (end_time - start_time)
    """
    __tablename__ = "accidents_clean"

    id          = db.Column(db.Integer,  primary_key=True)
    accident_id = db.Column(db.String(100), index=True)
    start_time  = db.Column(db.DateTime, index=True)
    end_time    = db.Column(db.DateTime)
    severity    = db.Column(db.Integer,  index=True)
    city        = db.Column(db.String(100), index=True)
    state       = db.Column(db.String(50),  index=True)

    # ── Unit-converted fields ──────────────────────────────────────────────
    temperature_c = db.Column(db.Float)          # °C  (was °F in raw)
    visibility_km = db.Column(db.Float)          # km  (was miles in raw)

    weather_condition = db.Column(db.String(100))
    latitude          = db.Column(db.Float)
    longitude         = db.Column(db.Float)

    # ── Enrichment / derived fields ────────────────────────────────────────
    severity_label = db.Column(db.String(20))    # Low / Moderate / High / Critical
    season         = db.Column(db.String(10))    # Winter / Spring / Summer / Fall
    time_of_day    = db.Column(db.String(10))    # Morning / Afternoon / Evening / Night
    duration_min   = db.Column(db.Float)         # minutes between start and end time


# ─────────────────────────────────────────────────────────────
#  DATAMART STAR SCHEMA MODELS
# ─────────────────────────────────────────────────────────────

class DimTime(db.Model):
    """Time dimension for star schema"""
    __tablename__ = "dim_time"

    time_id     = db.Column(db.Integer, primary_key=True, autoincrement=True)

    # Calendar attributes
    year        = db.Column(db.Integer,  nullable=False)
    month       = db.Column(db.Integer,  nullable=False)   # 1–12
    day         = db.Column(db.Integer,  nullable=False)   # 1–31
    hour        = db.Column(db.Integer,  nullable=False)   # 0–23
    day_of_week = db.Column(db.Integer,  nullable=False)   # 0=Mon … 6=Sun
    week_of_year= db.Column(db.Integer,  nullable=True)

    # Derived labels (stored so queries stay fast)
    season      = db.Column(db.String(10),  nullable=False)  # Winter/Spring/Summer/Fall
    time_of_day = db.Column(db.String(15),  nullable=False)  # Morning/Afternoon/Evening/Night
    is_weekend  = db.Column(db.Boolean,     nullable=False, default=False)
    month_name  = db.Column(db.String(12),  nullable=True)
    day_name    = db.Column(db.String(12),  nullable=True)

    # Back-reference from fact
    accidents   = db.relationship("FactAccident", backref="time", lazy="dynamic")

    def to_dict(self):
        return {
            "time_id":      self.time_id,
            "year":         self.year,
            "month":        self.month,
            "day":          self.day,
            "hour":         self.hour,
            "day_of_week":  self.day_of_week,
            "week_of_year": self.week_of_year,
            "season":       self.season,
            "time_of_day":  self.time_of_day,
            "is_weekend":   self.is_weekend,
            "month_name":   self.month_name,
            "day_name":     self.day_name,
        }


class DimLocation(db.Model):
    """Location dimension for star schema"""
    __tablename__ = "dim_location"

    location_id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    city        = db.Column(db.String(100), nullable=True)
    state       = db.Column(db.String(50),  nullable=True)
    latitude    = db.Column(db.Float,       nullable=True)
    longitude   = db.Column(db.Float,       nullable=True)

    # Derived region grouping (useful for dashboard)
    us_region   = db.Column(db.String(30),  nullable=True)  # Northeast/South/Midwest/West

    accidents   = db.relationship("FactAccident", backref="location", lazy="dynamic")

    def to_dict(self):
        return {
            "location_id": self.location_id,
            "city":        self.city,
            "state":       self.state,
            "latitude":    self.latitude,
            "longitude":   self.longitude,
            "us_region":   self.us_region,
        }


class DimWeather(db.Model):
    """Weather dimension for star schema"""
    __tablename__ = "dim_weather"

    weather_id        = db.Column(db.Integer, primary_key=True, autoincrement=True)

    weather_condition = db.Column(db.String(100), nullable=True)
    temperature_c     = db.Column(db.Float,       nullable=True)   # °C
    visibility_km     = db.Column(db.Float,       nullable=True)   # km

    # Derived buckets (for grouping in charts)
    temp_bucket       = db.Column(db.String(20),  nullable=True)   # Cold/Cool/Warm/Hot
    visibility_bucket = db.Column(db.String(20),  nullable=True)   # Poor/Moderate/Good

    accidents         = db.relationship("FactAccident", backref="weather", lazy="dynamic")

    def to_dict(self):
        return {
            "weather_id":        self.weather_id,
            "weather_condition": self.weather_condition,
            "temperature_c":     self.temperature_c,
            "visibility_km":     self.visibility_km,
            "temp_bucket":       self.temp_bucket,
            "visibility_bucket": self.visibility_bucket,
        }


class DimRoad(db.Model):
    """Road features dimension for star schema"""
    __tablename__ = "dim_road"

    road_id    = db.Column(db.Integer, primary_key=True, autoincrement=True)

    # Road feature flags (boolean — from the original dataset columns)
    amenity    = db.Column(db.Boolean, nullable=False, default=False)
    bump       = db.Column(db.Boolean, nullable=False, default=False)
    crossing   = db.Column(db.Boolean, nullable=False, default=False)
    give_way   = db.Column(db.Boolean, nullable=False, default=False)
    junction   = db.Column(db.Boolean, nullable=False, default=False)
    no_exit    = db.Column(db.Boolean, nullable=False, default=False)
    railway    = db.Column(db.Boolean, nullable=False, default=False)
    roundabout = db.Column(db.Boolean, nullable=False, default=False)
    station    = db.Column(db.Boolean, nullable=False, default=False)
    stop       = db.Column(db.Boolean, nullable=False, default=False)
    traffic_calming = db.Column(db.Boolean, nullable=False, default=False)
    traffic_signal  = db.Column(db.Boolean, nullable=False, default=False)
    turning_loop    = db.Column(db.Boolean, nullable=False, default=False)

    # Derived count (how many features are active — useful for ML)
    feature_count = db.Column(db.Integer, nullable=False, default=0)

    accidents  = db.relationship("FactAccident", backref="road", lazy="dynamic")

    def to_dict(self):
        return {
            "road_id":        self.road_id,
            "amenity":        self.amenity,
            "bump":           self.bump,
            "crossing":       self.crossing,
            "give_way":       self.give_way,
            "junction":       self.junction,
            "no_exit":        self.no_exit,
            "railway":        self.railway,
            "roundabout":     self.roundabout,
            "station":        self.station,
            "stop":           self.stop,
            "traffic_calming": self.traffic_calming,
            "traffic_signal": self.traffic_signal,
            "turning_loop":   self.turning_loop,
            "feature_count":  self.feature_count,
        }


class FactAccident(db.Model):
    """Fact table for accident events (center of star schema)"""
    __tablename__ = "fact_accident"

    fact_id      = db.Column(db.Integer, primary_key=True, autoincrement=True)
    accident_id  = db.Column(db.String(50), unique=True, nullable=False, index=True)

    # ── Foreign keys → dimension tables ──
    time_id      = db.Column(db.Integer, db.ForeignKey("dim_time.time_id"), nullable=True)
    location_id  = db.Column(db.Integer, db.ForeignKey("dim_location.location_id"), nullable=True)
    weather_id   = db.Column(db.Integer, db.ForeignKey("dim_weather.weather_id"), nullable=True)
    road_id      = db.Column(db.Integer, db.ForeignKey("dim_road.road_id"), nullable=True)

    # ── Measures / facts ──
    severity        = db.Column(db.Integer, nullable=False)          # 1–4
    severity_label  = db.Column(db.String(10), nullable=True)        # Low/Moderate/High/Critical
    duration_min    = db.Column(db.Float,   nullable=True)           # accident duration in minutes

    # Raw timestamps kept on the fact for drill-down
    start_time   = db.Column(db.DateTime,  nullable=True)
    end_time     = db.Column(db.DateTime,  nullable=True)

    def to_dict(self):
        return {
            "fact_id":       self.fact_id,
            "accident_id":   self.accident_id,
            "time_id":       self.time_id,
            "location_id":   self.location_id,
            "weather_id":    self.weather_id,
            "road_id":       self.road_id,
            "severity":      self.severity,
            "severity_label": self.severity_label,
            "duration_min":  self.duration_min,
            "start_time":    self.start_time.isoformat() if self.start_time else None,
            "end_time":      self.end_time.isoformat() if self.end_time else None,
        }