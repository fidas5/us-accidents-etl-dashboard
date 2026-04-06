import os   # Module pour accéder aux variables d'environnement système

class Config:
     # Clé secrète pour signer les sessions/cookies/CSRF
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key")
     # URI de connexion DB 
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        "postgresql://postgres:fida@localhost:5000/us_accidents_db"
    )
        # Désactive le tracking des modifications (évite les warnings perf)
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "dev-jwt-secret") 
 # Email
    MAIL_SERVER = os.getenv("MAIL_SERVER")
    MAIL_PORT = int(os.getenv("MAIL_PORT", 587))
    MAIL_USERNAME = os.getenv("MAIL_USERNAME")
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD")
    MAIL_USE_TLS = os.getenv("MAIL_USE_TLS", "True") == "True"
    MAIL_USE_SSL = os.getenv("MAIL_USE_SSL", "False") == "True"
    MAIL_DEFAULT_SENDER = os.getenv("MAIL_SENDER")
