from .. import db
from sqlalchemy import extract
from ..models import AccidentClean
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from ..models import AccidentClean

accidents_bp = Blueprint("accidents", __name__, url_prefix="/api/accidents")

@accidents_bp.route("", methods=["GET"])
@jwt_required()
def get_accidents():
    page     = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 10))
    city     = request.args.get("city", "").strip()
    severity = request.args.get("severity", "")
    state    = request.args.get("state", "").strip()
    year     = request.args.get("year", "")

    q = AccidentClean.query
    if city:     q = q.filter(AccidentClean.city.ilike(f"%{city}%"))
    if severity: q = q.filter(AccidentClean.severity == int(severity))
    if state:    q = q.filter(AccidentClean.state == state)
    if year:     q = q.filter(db.extract("year", AccidentClean.start_time) == int(year))

    paginated = q.order_by(AccidentClean.start_time.desc()).paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        "data": [
            {
                "id": r.id,
                "accident_id": r.accident_id,
                "city": r.city,
                "state": r.state,
                "severity": r.severity,
                "start_time": r.start_time.isoformat() if r.start_time else None,
                "temperature": r.temperature,
                "visibility": r.visibility,
                "weather_condition": r.weather_condition,
            } for r in paginated.items
        ],
        "total": paginated.total,
        "page": paginated.page,
        "per_page": per_page,
        "total_pages": paginated.pages,
    }), 200