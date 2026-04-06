from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from .. import db
from ..models import AccidentClean

stats_bp = Blueprint("stats", __name__, url_prefix="/api/stats")


@stats_bp.route("/summary", methods=["GET"])
@jwt_required()
def stats_summary():
    """
    KPI de base pour le dashboard.
    """
    total_accidents = db.session.query(func.count(AccidentClean.id)).scalar()

    total_cities = db.session.query(
        func.count(func.distinct(AccidentClean.city))
    ).scalar()

    min_date, max_date = db.session.query(
        func.min(AccidentClean.start_time),
        func.max(AccidentClean.start_time),
    ).one()

    return jsonify({
        "status": "ok",
        "data": {
            "total_accidents": int(total_accidents or 0),
            "total_cities": int(total_cities or 0),
            "time_range": {
                "min_date": min_date.isoformat() if min_date else None,
                "max_date": max_date.isoformat() if max_date else None,
            },
        },
    })


@stats_bp.route("/by-severity", methods=["GET"])
@jwt_required()
def stats_by_severity():
    """
    Répartition des accidents par gravité.
    """
    rows = (
        db.session.query(
            AccidentClean.severity,
            func.count(AccidentClean.id)
        )
        .group_by(AccidentClean.severity)
        .order_by(AccidentClean.severity)
        .all()
    )

    data = [
        {"severity": int(s) if s is not None else None, "count": int(c)}
        for s, c in rows
    ]

    return jsonify({
        "status": "ok",
        "data": data,
    })

@stats_bp.route("/by-state", methods=["GET"])
@jwt_required()
def stats_by_state():
    rows = (
        db.session.query(
            AccidentClean.state,
            func.count(AccidentClean.id)
        )
        .group_by(AccidentClean.state)
        .order_by(func.count(AccidentClean.id).desc())
        .limit(10)  # Top 10 états
        .all()
    )

    data = [
        {"state": s, "count": int(c)}
        for s, c in rows if s is not None
    ]

    return jsonify({
        "status": "ok",
        "data": data,
    })

from flask import request

@stats_bp.route("/by-hour", methods=["GET"])
@jwt_required()
def stats_by_hour():
    min_severity = request.args.get("min_severity", type=int)

    query = db.session.query(
        func.extract("hour", AccidentClean.start_time).label("hour"),
        func.count(AccidentClean.id)
    )

    if min_severity is not None:
        query = query.filter(AccidentClean.severity >= min_severity)

    rows = (
        query
        .group_by("hour")
        .order_by("hour")
        .all()
    )

    data = [
        {"hour": int(h), "count": int(c)}
        for h, c in rows if h is not None
    ]

    return jsonify({"status": "ok", "data": data})
   