from flask import Blueprint, request, jsonify , current_app
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import create_access_token
from flask_mail import Message
import random
from datetime import datetime, timedelta
from .. import db, mail
from ..models import User

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")

# ──────────────────────────────────────────────────────────────────
# 1. Validation helpers
# ──────────────────────────────────────────────────────────────────


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
            subject="US Accidents - Email Verification",
            recipients=[email],
            body=f"Your verification code is: {verification_code}\n\nEnter this code to complete your registration."
        )
        mail.send(msg)
    except Exception as e:
        current_app.logger.error(f"Mail error: {str(e)}")
        # Delete user if email fails?
        db.session.delete(user)
        db.session.commit()
        return jsonify({"message": "Failed to send verification email"}), 500

    return jsonify({
        "message": "Verification code sent to your email",
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
            subject="US Accidents - New Verification Code",
            recipients=[email],
            body=f"Your new verification code is: {new_code}"
        )
        mail.send(msg)
    except Exception as e:
        current_app.logger.error(f"Mail error: {str(e)}")
        return jsonify({"message": "Failed to send email"}), 500

    return jsonify({"message": "New verification code sent to your email"}), 200




@auth_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    """
    Send password reset code to user's email
    """
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
    
    # Set expiration (15 minutes from now)
    expires_at = datetime.utcnow() + timedelta(minutes=15)
    
    user.reset_code = reset_code
    user.reset_code_expires = expires_at
    db.session.commit()

    # Send reset code by email
    try:
        # Version HTML
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Password Reset Code</title>
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
                    font-weight: 600;
                }}
                .header p {{
                    margin: 5px 0 0;
                    opacity: 0.9;
                }}
                .content {{
                    padding: 30px;
                }}
                .greeting {{
                    font-size: 18px;
                    margin-bottom: 20px;
                }}
                .message-text {{
                    color: #555;
                    margin-bottom: 20px;
                }}
                .code-box {{
                    background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
                    border: 2px dashed #667eea;
                    border-radius: 12px;
                    padding: 20px;
                    text-align: center;
                    margin: 25px 0;
                }}
                .code-label {{
                    font-size: 13px;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    color: #666;
                    margin-bottom: 10px;
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
                    border-radius: 4px;
                }}
                .warning {{
                    background-color: #f8d7da;
                    border-left: 4px solid #dc3545;
                    padding: 12px;
                    margin: 20px 0;
                    font-size: 13px;
                    color: #721c24;
                    border-radius: 4px;
                }}
                .footer {{
                    background-color: #f8f9fa;
                    padding: 20px;
                    text-align: center;
                    color: #6c757d;
                    font-size: 12px;
                    border-top: 1px solid #dee2e6;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1> US Accidents</h1>
                    <p>Password Reset Request</p>
                </div>
                
                <div class="content">
                    <div class="greeting">
                        Hello ,
                    </div>
                    
                    <div class="message-text">
                        We received a request to reset your password for your US Accidents account.
                    </div>
                    
                    <div class="code-box">
                        <div class="code-label">Your password reset code is:</div>
                        <div class="code">{reset_code}</div>
                    </div>
                    
                    <div class="expiry">
                        ⏰ <strong>This code will expire in 15 minutes.</strong>
                    </div>
                    
                    <div class="warning">
                        ⚠️ <strong>Security Alert:</strong> Never share this code with anyone. 
                        Our team will never ask for this code.
                    </div>
                    
                    <div class="message-text" style="font-size: 13px;">
                        If you didn't request this password reset, please ignore this email. 
                        Your password will not be changed.
                    </div>
                </div>
                
                <div class="footer">
                    <p>Best regards,<br>
                    <strong>US Accidents Team</strong></p>
                    <p style="font-size: 11px; margin-top: 10px;">This is an automated message, please do not reply.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Version texte (fallback pour les clients email qui ne supportent pas HTML)
        text_body = f"""
═══════════════════════════════════════════════════════════
                    US ACCIDENTS
                 PASSWORD RESET REQUEST
═══════════════════════════════════════════════════════════

Hello,

We received a request to reset your password for your 
US Accidents account.

Your password reset code is: {reset_code}

⏰ This code will expire in 15 minutes.


If you didn't request this password reset, please ignore 
this email.

═══════════════════════════════════════════════════════════
Best regards,
US Accidents Team
═══════════════════════════════════════════════════════════

"""
        
        msg = Message(
            subject=" US Accidents - Password Reset Code",
            recipients=[email],
            body=text_body,
            html=html_body
        )
        mail.send(msg)
        current_app.logger.info(f"Password reset code sent to {email}")
        
    except Exception as e:
        current_app.logger.error(f"Mail error: {str(e)}")
        return jsonify({"message": "Failed to send reset email"}), 500

    return jsonify({
        "message": "If your email is registered, you will receive a reset code",
        "email": email  # Remove in production for security
    }), 200



@auth_bp.route("/verify-reset-code", methods=["POST"])
def verify_reset_code():
    """
    Verify the password reset code
    """
    data = request.get_json() or {}
    email = data.get("email", "").strip()
    code = data.get("code", "").strip()

    if not email or not code:
        return jsonify({"message": "Email and reset code required"}), 400

    user = User.query.filter_by(email=email).first()
    
    if not user:
        return jsonify({"message": "Invalid request"}), 404
    
    # Check if reset code exists and not expired
    if not user.reset_code or user.reset_code != code:
        return jsonify({"message": "Invalid reset code"}), 400
    
    if user.reset_code_expires < datetime.utcnow():
        return jsonify({"message": "Reset code has expired. Please request a new one"}), 400

    # Generate temporary token for password reset
    from flask_jwt_extended import create_access_token
    reset_token = create_access_token(
        identity=str(user.id),
        expires_delta=timedelta(minutes=10)  # Token valid for 10 minutes
    )

    return jsonify({
        "message": "Code verified successfully",
        "reset_token": reset_token
    }), 200


@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    """
    Reset password using valid reset token
    """
    from flask_jwt_extended import decode_token
    from flask_jwt_extended.exceptions import JWTExtendedException
    
    data = request.get_json() or {}
    new_password = data.get("new_password", "")
    reset_token = data.get("reset_token", "")
    
    if not new_password or not reset_token:
        return jsonify({"message": "New password and reset token required"}), 400
    
    # Validate password strength
    if len(new_password) < 6:
        return jsonify({"message": "Password must be at least 6 characters"}), 400
    
    try:
        # Decode the reset token
        decoded_token = decode_token(reset_token)
        user_id = decoded_token["sub"]
        
        # Get user
        user = User.query.get(int(user_id))
        if not user:
            return jsonify({"message": "Invalid reset token"}), 400
        
        # Update password
        user.password_hash = generate_password_hash(new_password)
        
        # Clear reset code
        user.reset_code = None
        user.reset_code_expires = None
        
        db.session.commit()
        
        # Send confirmation email
        try:
            # Version HTML du message de confirmation
            html_body = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Password Changed Successfully</title>
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
                        background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                        color: white;
                        padding: 30px;
                        text-align: center;
                    }}
                    .header h1 {{
                        margin: 0;
                        font-size: 24px;
                        font-weight: 600;
                    }}
                    .header p {{
                        margin: 5px 0 0;
                        opacity: 0.9;
                    }}
                    .content {{
                        padding: 30px;
                    }}
                    .greeting {{
                        font-size: 18px;
                        margin-bottom: 20px;
                    }}
                    .message-text {{
                        color: #555;
                        margin-bottom: 20px;
                    }}
                    .success-box {{
                        background: linear-gradient(135deg, #28a74515 0%, #20c99715 100%);
                        border: 2px solid #28a745;
                        border-radius: 12px;
                        padding: 20px;
                        text-align: center;
                        margin: 25px 0;
                    }}
                    .success-icon {{
                        font-size: 48px;
                        margin-bottom: 10px;
                    }}
                    .success-title {{
                        font-size: 20px;
                        font-weight: bold;
                        color: #28a745;
                        margin-bottom: 10px;
                    }}
                    .info-box {{
                        background-color: #e7f3ff;
                        border-left: 4px solid #2196f3;
                        padding: 15px;
                        margin: 20px 0;
                        border-radius: 4px;
                    }}
                    .warning-box {{
                        background-color: #fff3cd;
                        border-left: 4px solid #ffc107;
                        padding: 12px;
                        margin: 20px 0;
                        font-size: 13px;
                        border-radius: 4px;
                    }}
                    .footer {{
                        background-color: #f8f9fa;
                        padding: 20px;
                        text-align: center;
                        color: #6c757d;
                        font-size: 12px;
                        border-top: 1px solid #dee2e6;
                    }}
                    .button {{
                        display: inline-block;
                        background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                        color: white;
                        text-decoration: none;
                        padding: 12px 30px;
                        border-radius: 6px;
                        margin: 10px 0;
                        font-weight: 600;
                    }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>US Accidents</h1>
                        <p>Password Changed Successfully</p>
                    </div>
                    
                    <div class="content">
                        <div class="greeting">
                            Hello ,
                        </div>
                        
                        <div class="success-box">
                            <div class="success-icon"></div>
                            <div class="success-title">Password Updated!</div>
                            <div>Your password has been successfully changed.</div>
                        </div>
                        
                        <div class="message-text">
                            You can now log in to your account with your new password.
                        </div>
                    </div>
                    
                    <div class="footer">
                        <p>Best regards,<br>
                        <strong>US Accidents Team</strong></p>
                    </div>
                </div>
            </body>
            </html>
            """
            
            # Version texte (fallback)
            text_body = f"""
╔══════════════════════════════════════════════════════════╗
║                    US ACCIDENTS                         ║
║              PASSWORD CHANGED SUCCESSFULLY              ║
╚══════════════════════════════════════════════════════════╝

Hello ,

✅ Your password has been successfully changed.

You can now log in to your account with your new password.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Best regards,
US Accidents Team
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""
            
            msg = Message(
                subject="✅ US Accidents - Password Changed Successfully",
                recipients=[user.email],
                body=text_body,
                html=html_body
            )
            mail.send(msg)
            current_app.logger.info(f"Password change confirmation email sent to {user.email}")
            
        except Exception as e:
            current_app.logger.error(f"Confirmation email error: {str(e)}")
            # Don't fail the request if confirmation email fails
        
        return jsonify({
            "message": "Password reset successfully",
            "success": True
        }), 200
        
    except JWTExtendedException as e:
        current_app.logger.error(f"Token decode error: {str(e)}")
        return jsonify({
            "message": "Invalid or expired reset token. Please request a new reset code.",
            "success": False
        }), 400
    except Exception as e:
        current_app.logger.error(f"Reset password error: {str(e)}")
        return jsonify({
            "message": "Failed to reset password. Please try again.",
            "success": False
        }), 500