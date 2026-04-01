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