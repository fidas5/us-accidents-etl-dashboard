from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from sqlalchemy import text
from flask_cors import CORS
from flask_mail import Mail
from sqlalchemy import inspect

from .config import Config

db = SQLAlchemy()   # instance SQLAlchemy
migrate = Migrate()
jwt = JWTManager()
mail = Mail()


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    
    # Configure CORS properly
    CORS(app, 
         origins=["http://localhost:5173", "http://localhost:3000"],
         supports_credentials=True,
         allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
         methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])

    # ── 1. Bind extensions to the app ──────────────────────────────────────
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    mail.init_app(app)

    # ── 2. Import models AFTER db is initialised ──────────────────────────
    from . import models  # This imports everything from models.py

    # ── 3. Create tables inside the app context ────────────────────────────
    with app.app_context():
        db.create_all()
        print("✅ Database tables created/verified successfully")
        
        # Get table names using inspect (works with newer SQLAlchemy)
        inspector = inspect(db.engine)
        tables = inspector.get_table_names()
        print(f"   Tables: {', '.join(tables)}")

    # ── 4. Register blueprints ─────────────────────────────────────────────
    from .routes.auth import auth_bp
    from .routes.etl import etl_bp
    from .routes.stats import stats_bp
    from .routes.datamart import datamart_bp 
    from .routes.predict import predict_bp

    app.register_blueprint(auth_bp, url_prefix="/auth")
    app.register_blueprint(etl_bp, url_prefix="/etl")
    app.register_blueprint(stats_bp, url_prefix="/api/stats")
    app.register_blueprint(datamart_bp, url_prefix="/etl")
    app.register_blueprint(predict_bp, url_prefix="/api/predict")


    # ── 5. Health check ─────────────────────────────────3- no its first time to integrate but already exists in my local pc i used it in another project ───────────────────
    @app.route("/health")
    def health():
        try:
            db.session.execute(text("SELECT 1"))
            return {"status": "ok", "db": "connected"}, 200
        except Exception as e:
            return {"status": "error", "db": "failed", "detail": str(e)}, 500

    return app