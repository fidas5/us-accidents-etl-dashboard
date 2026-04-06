from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import create_access_token
from flask_mail import Message
import random

from .. import db, mail
from ..models import User

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"message": "Email and password required"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"message": "Email already registered"}), 400

    code = f"{random.randint(100000, 999999)}"

    user = User(
        email=email,
        password_hash=generate_password_hash(password),
        is_verified=False,
        verification_code=code,
    )
    db.session.add(user)
    db.session.commit()

    try:
        msg = Message(
            subject="US Accidents - Email verification",
            recipients=[email],
            body=f"Your verification code is: {code}",
        )
        mail.send(msg)
    except Exception as e:
        # Optionnel : log error e
        return jsonify(
            {
                "message": "User created but failed to send email",
                "error": str(e),
            }
        ), 500

    return jsonify({"message": "Verification code sent to your email"}), 201


@auth_bp.route("/verify-email", methods=["POST"])
def verify_email():
    data = request.get_json() or {}
    email = data.get("email")
    code = data.get("code")

    if not email or not code:
        return jsonify({"message": "Email and code required"}), 400

    user = User.query.filter_by(email=email).first()
    if not user or user.verification_code != code:
        return jsonify({"message": "Invalid verification code"}), 400

    user.is_verified = True
    user.verification_code = None
    db.session.commit()

    # Identity en string pour éviter "Subject must be a string"
    access_token = create_access_token(identity=str(user.id))

    return jsonify(
        {
            "access_token": access_token,
            "message": "Email verified",
        }
    ), 200


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"message": "Email and password required"}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"message": "Invalid credentials"}), 401

    if not user.is_verified:
        return jsonify({"message": "Please verify your email first"}), 403

    # Identity en string ici aussi
    access_token = create_access_token(identity=str(user.id))

    return jsonify({"access_token": access_token}), 200