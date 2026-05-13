"""
📦 IMPORTS - Bibliothèques et modules utilisés dans ce fichier

Ce fichier d'authentification utilise plusieurs bibliothèques pour :
- Créer des routes API (Blueprint)
- Sécuriser les mots de passe (werkzeug)
- Gérer les tokens JWT (flask_jwt_extended)
- Envoyer des emails (flask_mail)
- Manipuler les dates et générer des codes (random, datetime)
- Valider les emails (re)
- Logger les événements (logging)

┌─────────────────────────────────────────────────────────────────────────────┐
│                           FLASK (Framework Web)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Blueprint  → Organiser les routes en modules (ex: /auth/login)             │
│ request    → Lire les données envoyées par le frontend (JSON, form)        │
│ jsonify    → Convertir les dictionnaires Python en réponse JSON            │
│ current_app→ Accéder à l'application Flask (config, extensions)            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        SÉCURITÉ & AUTHENTIFICATION                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ generate_password_hash  → Transformer un mot de passe en hash (chiffré)    │
│ check_password_hash     → Vérifier si un mot de passe correspond au hash   │
│ create_access_token     → Générer un token JWT pour l'authentification     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              EMAILS (Notifications)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ Message   → Créer un email (sujet, destinataire, contenu)                  │
│ mail      → Instance Flask-Mail pour envoyer l'email                       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           UTILITAIRES PYTHON                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ random    → Générer des codes aléatoires (vérification email)              │
│ datetime  → Manipuler les dates (expiration des codes)                     │
│ timedelta → Ajouter/soustraire du temps (ex: +15 minutes)                  │
│ re        → Expressions régulières (validation format email)               │
│ logging   → Enregistrer des logs pour le débogage                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          PROJET (Modules internes)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ db    → Instance SQLAlchemy (connexion base de données)                    │
│ mail  → Instance Flask-Mail (envoi d'emails)                               │
│ User  → Modèle SQLAlchemy (table users en base de données)                 │
└─────────────────────────────────────────────────────────────────────────────┘

"""

from flask import Blueprint, request, jsonify, current_app
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import create_access_token
from flask_mail import Message
import random
from datetime import datetime, timedelta
from .. import db, mail
from ..models import User
import re
import logging

from flask import Blueprint, request, jsonify , current_app   
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import create_access_token
from flask_mail import Message
import random
from datetime import datetime, timedelta
from .. import db, mail
from ..models import User
import re

import logging

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")



def validate_email(email: str) -> bool:
    """Validate email format"""
    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    return bool(re.match(pattern, email))

def validate_password(password: str) -> tuple[bool, str]:
    """Validate password strength"""
    if len(password) < 6:
        return False, "Password must be at least 6 characters"
    return True, "" 

# ──────────────────────────────────────────────────────────────────
# 2. Routes
# ──────────────────────────────────────────────────────────────────
@auth_bp.route("/register", methods=["POST"])
def register():
    """
    Register a new user and send verification code by email
    """
    data = request.get_json() or {}
    email = data.get("email", "").strip()
    password = data.get("password", "")
    nom = data.get("nom", "").strip()
    prenom = data.get("prenom", "").strip()

    # Input validation
    if not email or not password:
        return jsonify({"message": "Email and password required"}), 400
    
    if not validate_email(email):
        return jsonify({"message": "Invalid email format"}), 400
    
    is_valid, pwd_msg = validate_password(password)
    if not is_valid:
        return jsonify({"message": pwd_msg}), 400

    # Check existing user
    if User.query.filter_by(email=email).first():
        return jsonify({"message": "Email already registered"}), 400

    # Generate verification code
    verification_code = f"{random.randint(100000, 999999)}"

    # Create user
    user = User(
        email=email,
        password_hash=generate_password_hash(password),
        is_verified=False,
        verification_code=verification_code,
        nom=nom,
        prenom=prenom
    )
    
    try:
        db.session.add(user)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"message": f"Database error: {str(e)}"}), 500

    # Send verification email
    try:
        msg = Message(
            subject="US Accidents - Vérification de votre adresse email",
            recipients=[email],
            body=f"Votre code de vérification est : {verification_code}\n\nSaisissez ce code pour finaliser votre inscription."
        )
        mail.send(msg)
    except Exception as e:
        current_app.logger.error(f"Mail error: {str(e)}")
        db.session.delete(user)
        db.session.commit()
        return jsonify({"message": "Failed to send verification email"}), 500

    return jsonify({
        "message": "Code de vérification envoyé à votre adresse email",
        "email": email
    }), 201


@auth_bp.route("/verify-email", methods=["POST"])
def verify_email():
    """
    Verify user email with the 6-digit code
    """
    data = request.get_json() or {}
    email = data.get("email", "").strip()
    code = data.get("code", "").strip()

    if not email or not code:
        return jsonify({"message": "Email and verification code required"}), 400

    user = User.query.filter_by(email=email).first()
    
    if not user:
        return jsonify({"message": "User not found"}), 404
    
    if user.is_verified:
        return jsonify({"message": "Email already verified"}), 400
    
    if user.verification_code != code:
        return jsonify({"message": "Invalid verification code"}), 400

    # Verify user
    user.is_verified = True
    user.verification_code = None
    db.session.commit()

    # Generate JWT token
    access_token = create_access_token(identity=str(user.id))

    return jsonify({
        "access_token": access_token,
        "user": {
            "id": user.id,
            "email": user.email,
            "nom": user.nom,
            "prenom": user.prenom,
            "is_verified": user.is_verified
        },
        "message": "Email verified successfully"
    }), 200


@auth_bp.route("/login", methods=["POST"])
def login():
    """
    Login with email and password
    """
    data = request.get_json() or {}
    email = data.get("email", "").strip()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"message": "Email and password required"}), 400

    user = User.query.filter_by(email=email).first()
    
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"message": "Invalid credentials"}), 401

    if not user.is_verified:
        return jsonify({"message": "Please verify your email first"}), 403

    # Generate JWT token
    access_token = create_access_token(identity=str(user.id))

    return jsonify({
        "access_token": access_token,
        "user": {
            "id": user.id,
            "email": user.email,
            "nom": user.nom,
            "prenom": user.prenom
        }
    }), 200


@auth_bp.route("/resend-code", methods=["POST"])
def resend_verification_code():
    """
    Resend verification code to user email
    """
    data = request.get_json() or {}
    email = data.get("email", "").strip()

    if not email:
        return jsonify({"message": "Email required"}), 400

    user = User.query.filter_by(email=email).first()
    
    if not user:
        return jsonify({"message": "User not found"}), 404
    
    if user.is_verified:
        return jsonify({"message": "Email already verified"}), 400

    # Generate new code
    new_code = f"{random.randint(100000, 999999)}"
    user.verification_code = new_code
    db.session.commit()

    # Send email
    try:
        msg = Message(
            subject="US Accidents - Nouveau code de vérification",
            recipients=[email],
            body=f"Votre nouveau code de vérification est : {new_code}"
        )
        mail.send(msg)
    except Exception as e:
        current_app.logger.error(f"Mail error: {str(e)}")
        return jsonify({"message": "Failed to send email"}), 500

    return jsonify({"message": "Nouveau code de vérification envoyé à votre adresse email"}), 200



@auth_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    """Send password reset code to user's email"""
    data = request.get_json() or {}
    email = data.get("email", "").strip()

    if not email:
        return jsonify({"message": "Email required"}), 400

    user = User.query.filter_by(email=email).first()
    
    # For security, don't reveal if email exists or not
    if not user:
        return jsonify({"message": "If your email is registered, you will receive a reset code"}), 200

    # Generate 6-digit reset code
    reset_code = f"{random.randint(100000, 999999)}"
    expires_at = datetime.utcnow() + timedelta(minutes=15)
    
    user.reset_code = reset_code
    user.reset_code_expires = expires_at
    db.session.commit()

    # Send reset code by email
    try:
        send_password_reset_email(email, reset_code)
    except Exception as e:
        current_app.logger.error(f"Failed to send email: {str(e)}")
        return jsonify({"message": "If your email is registered, you will receive a reset code"}), 200

    return jsonify({"message": "If your email is registered, you will receive a reset code"}), 200


def send_password_reset_email(email, reset_code):
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Code de réinitialisation du mot de passe</title>
        <style>
            body {{
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: #333;
                background-color: #f4f4f4;
                margin: 0;
                padding: 20px;
            }}
            .container {{
                max-width: 500px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }}
            .header {{
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 30px;
                text-align: center;
            }}
            .header h1 {{
                margin: 0;
                font-size: 24px;
            }}
            .content {{
                padding: 30px;
            }}
            .code-box {{
                background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
                border: 2px dashed #667eea;
                border-radius: 12px;
                padding: 20px;
                text-align: center;
                margin: 25px 0;
            }}
            .code {{
                font-size: 36px;
                font-weight: bold;
                color: #667eea;
                letter-spacing: 5px;
                font-family: 'Courier New', monospace;
            }}
            .expiry {{
                background-color: #fff3cd;
                border-left: 4px solid #ffc107;
                padding: 12px;
                margin: 20px 0;
                font-size: 14px;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>US Accidents</h1>
                <p>Réinitialisation du mot de passe</p>
            </div>
            <div class="content">
                <p>Bonjour,</p>
                <p>Nous avons reçu une demande de réinitialisation de votre mot de passe.</p>
                <div class="code-box">
                    <div class="code">{reset_code}</div>
                </div>
                <div class="expiry">
                    ⏰ Ce code expirera dans 15 minutes.
                </div>
                <p>Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer cet email.</p>
            </div>
        </div>
    </body>
    </html>
    """

    text_body = f"""
    US Accidents - Code de réinitialisation du mot de passe

    Votre code de réinitialisation est : {reset_code}

    Ce code expirera dans 15 minutes.

    Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer cet email.
    """

    msg = Message(
        subject="US Accidents - Code de réinitialisation du mot de passe",
        recipients=[email],
        body=text_body,
        html=html_body
    )
    mail.send(msg)

@auth_bp.route("/verify-reset-code", methods=["POST"])
def verify_reset_code():
    """Verify the password reset code"""
    data = request.get_json() or {}
    email = data.get("email", "").strip()
    code = data.get("code", "").strip()

    if not email or not code:
        return jsonify({"message": "Email and reset code required"}), 400

    user = User.query.filter_by(email=email).first()
    
    if not user:
        return jsonify({"message": "Invalid request"}), 404
    
    if not user.reset_code or user.reset_code != code:
        return jsonify({"message": "Invalid reset code"}), 400
    
    if user.reset_code_expires < datetime.utcnow():
        return jsonify({"message": "Reset code has expired. Please request a new one"}), 400

    # Generate temporary token for password reset
    reset_token = create_access_token(
        identity=str(user.id),
        expires_delta=timedelta(minutes=10)
    )

    return jsonify({
        "message": "Code verified successfully",
        "reset_token": reset_token
    }), 200


@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    """Reset password using valid reset token"""
    data = request.get_json() or {}
    new_password = data.get("new_password", "")
    reset_token = data.get("reset_token", "")
    
    if not new_password or not reset_token:
        return jsonify({"message": "New password and reset token required"}), 400
    
    if len(new_password) < 6:
        return jsonify({"message": "Password must be at least 6 characters"}), 400
    
    try:
        # Decode the reset token
        decoded_token = decode_token(reset_token)
        user_id = decoded_token["sub"]
        
        user = User.query.get(int(user_id))
        if not user:
            return jsonify({"message": "Invalid reset token"}), 400
        
        # Update password
        user.password_hash = generate_password_hash(new_password)
        user.reset_code = None
        user.reset_code_expires = None
        
        db.session.commit()
        
        return jsonify({
            "message": "Password reset successfully",
            "success": True
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Reset password error: {str(e)}")
        return jsonify({
            "message": "Invalid or expired reset token. Please request a new reset code.",
            "success": False
        }), 400