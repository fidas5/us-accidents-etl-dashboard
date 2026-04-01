from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from sqlalchemy import text          # Import pour exécuter une requête SQL brute de test
from .config import Config           # Classe de configuration (SECRET_KEY, DB URI, etc.)

# Instances globales (sans app encore) : pattern "application factory"
db = SQLAlchemy()                    # ORM SQLAlchemy pour gérer les modèles et la DB
migrate = Migrate()                  # Gestionnaire de migrations basé sur Alembic


def create_app():
    """
    Fonction factory qui crée et configure l'application Flask.
    Appelée par wsgi.py pour obtenir l'instance 'app'.
    """
    app = Flask(__name__)            # Création de l'app Flask
    app.config.from_object(Config)   # Chargement de la config (DB, secret, etc.)

    # Initialisation des extensions avec l'app courante
    db.init_app(app)                 # Lie SQLAlchemy à cette app
    migrate.init_app(app, db)        # Lie Flask-Migrate à cette app et à la DB

    # Import des modèles pour que Flask-Migrate voie les tables lors des migrations
    from . import models             # noqa : import utilisé pour l'effet de side (déclaration des modèles)

    # Endpoint simple pour vérifier que l'API et la DB sont OK
    @app.route("/health")
    def health():
        """
        Health-check :
        - Vérifie que l'app répond
        - Teste une requête SQL minimale sur la DB
        """
        try:
            # Exécute SELECT 1 via SQLAlchemy pour s'assurer que la connexion DB fonctionne
            db.session.execute(text("SELECT 1"))
            return {"status": "ok", "db": "connected"}, 200
        except Exception as e:
            # En cas de problème de connexion DB, renvoie l'erreur
            return {"status": "error", "db": "failed", "detail": str(e)}, 500

    # Retourne l'objet application configuré
    return app