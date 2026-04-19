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
    city     = request.args.get("city", "").strip()
    severity = request.args.get("severity", "")
    state    = request.args.get("state", "").strip()
    year     = request.args.get("year", "")

    q = AccidentClean.query
    if city:     q = q.filter(AccidentClean.city.ilike(f"%{city}%"))
    if severity: q = q.filter(AccidentClean.severity == int(severity))
    if state:    q = q.filter(AccidentClean.state == state)
    if year:     q = q.filter(db.extract("year", AccidentClean.start_time) == int(year))

    rows = q.order_by(AccidentClean.start_time.desc()).limit(10).all()

    return jsonify({
        "data": [
            {
                "id":                r.id,
                "accident_id":       r.accident_id,
                "city":              r.city,
                "state":             r.state,
                "severity":          r.severity,
                "start_time":        r.start_time.isoformat() if r.start_time else None,
                "temperature":       r.temperature_c,    # ← was r.temperature
                "visibility":        r.visibility_km,    # ← was r.visibility
                "weather_condition": r.weather_condition,
            } for r in rows
        ],
        "total": len(rows),
        "page": 1,
        "per_page": 10,
        "total_pages": 1,
    }), 200

@accidents_bp.route("/cities", methods=["GET"])
@jwt_required()
def get_cities():
    from sqlalchemy import func

    results = (
        db.session.query(
            AccidentClean.city,
            AccidentClean.state,
            AccidentClean.latitude,
            AccidentClean.longitude,
            func.count(AccidentClean.id).label("count"),
            func.avg(AccidentClean.severity).label("avg_severity"),
        )
        .filter(AccidentClean.latitude != None, AccidentClean.longitude != None)
        .group_by(AccidentClean.city, AccidentClean.state, AccidentClean.latitude, AccidentClean.longitude)
        .order_by(func.count(AccidentClean.id).desc())
        .limit(300)
        .all()
    )

    return jsonify({
        "data": [
            {
                "city":         r.city,
                "state":        r.state,
                "latitude":     float(r.latitude),
                "longitude":    float(r.longitude),
                "count":        r.count,
                "avg_severity": round(float(r.avg_severity), 2),
            }
            for r in results
        ]
    }), 200