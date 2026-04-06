from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from sqlalchemy import text
from flask_cors import CORS
from flask_mail import Mail

from .config import Config

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
mail = Mail()


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    CORS(app)

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    mail.init_app(app)

    # NE RIEN IMPORTER AVANT ÇA
    from . import models  # noqa: F401
    from .routes.auth import auth_bp
    from .routes.etl import etl_bp
    from .routes.stats import stats_bp

    app.register_blueprint(auth_bp)   # url_prefix dans auth_bp
    app.register_blueprint(etl_bp)    # url_prefix dans etl_bp
    app.register_blueprint(stats_bp)  # url_prefix dans stats_bp

    @app.route("/health")
    def health():
        try:
            db.session.execute(text("SELECT 1"))
            return {"status": "ok", "db": "connected"}, 200
        except Exception as e:
            return {"status": "error", "db": "failed", "detail": str(e)}, 500

    return app