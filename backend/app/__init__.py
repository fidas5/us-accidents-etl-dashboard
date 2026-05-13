"""
Ce fichier :

Crée l'application Flask

Configure les extensions (SQLAlchemy, JWT, CORS, Mail)

Initialise la base de données

Enregistre les blueprints (routes)

Ajoute un endpoint de santé (health check)

"""

from flask import Flask   # Le framework web principal
from flask_sqlalchemy import SQLAlchemy # ORM pour la base de données
from flask_migrate import Migrate  # Gère les migrations (changements de modele de la base de données)
from flask_jwt_extended import JWTManager # Gère les tokens JWT
from sqlalchemy import text  # Permet d'écrire du SQL brut
from flask_cors import CORS  # Gère le partage entre frontend/backend
from flask_mail import Mail # Envoie des emails
from sqlalchemy import inspect # Inspecte la structure de la base de données

from .config import Config   # Configuration (variables d'environnement)

"""
Pourquoi les créer avant l'application ?

Ces objets sont des singletons (une seule instance partagée)

Ils seront "liés" à l'application quand elle sera créée

Cela permet de les réutiliser dans d'autres fichiers (ex: from app import db)

"""
db = SQLAlchemy()  
migrate = Migrate()
jwt = JWTManager()
mail = Mail()

"""
Fonction create_app() - Factory pattern
Qu'est-ce que le Factory Pattern ?
Au lieu de créer l'application globalement, on utilise une fonction qui la fabrique (d'où le nom "factory").


Avantages :

On peut créer plusieurs applications (ex: pour les tests)

Meilleure organisation du code

Évite les problèmes d'imports circulaires
"""
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


    # ── 5. Health check ─────────────────────────────────
    @app.route("/health")
    def health():
        try:
            db.session.execute(text("SELECT 1"))
            return {"status": "ok", "db": "connected"}, 200
        except Exception as e:
            return {"status": "error", "db": "failed", "detail": str(e)}, 500

    return app