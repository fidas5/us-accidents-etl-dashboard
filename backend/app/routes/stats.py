from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from .. import db
from ..models import AccidentClean

stats_bp = Blueprint("stats", __name__, url_prefix="/api/stats")


def apply_filters(query):
    """Apply min_severity and month filters from request args to any query."""
    min_severity = request.args.get("min_severity", type=int)
    month        = request.args.get("month", type=int)

    if min_severity is not None:
        query = query.filter(AccidentClean.severity >= min_severity)
    if month is not None:
        query = query.filter(
            func.extract("month", AccidentClean.start_time) == month
        )
    return query


@stats_bp.route("/summary", methods=["GET"])
@jwt_required()
def stats_summary():
    base = db.session.query(AccidentClean)
    base = apply_filters(base)

    total_accidents = base.with_entities(func.count(AccidentClean.id)).scalar()

    total_cities = base.with_entities(
        func.count(func.distinct(AccidentClean.city))
    ).scalar()

    min_date, max_date = base.with_entities(
        func.min(AccidentClean.start_time),
        func.max(AccidentClean.start_time),
    ).one()

    return jsonify({
        "status": "ok",
        "data": {
            "total_accidents": int(total_accidents or 0),
            "total_cities":    int(total_cities or 0),
            "time_range": {
                "min_date": min_date.isoformat() if min_date else None,
                "max_date": max_date.isoformat() if max_date else None,
            },
        },
    })


@stats_bp.route("/by-severity", methods=["GET"])
@jwt_required()
def stats_by_severity():
    query = db.session.query(
        AccidentClean.severity,
        func.count(AccidentClean.id)
    )
    query = apply_filters(query)
    rows  = (
        query
        .group_by(AccidentClean.severity)
        .order_by(AccidentClean.severity)
        .all()
    )

    return jsonify({
        "status": "ok",
        "data": [
            {"severity": int(s) if s is not None else None, "count": int(c)}
            for s, c in rows
        ],
    })


@stats_bp.route("/by-state", methods=["GET"])
@jwt_required()
def stats_by_state():
    query = db.session.query(
        AccidentClean.state,
        func.count(AccidentClean.id)
    )
    query = apply_filters(query)
    rows  = (
        query
        .group_by(AccidentClean.state)
        .order_by(func.count(AccidentClean.id).desc())
        .limit(10)
        .all()
    )

    return jsonify({
        "status": "ok",
        "data": [
            {"state": s, "count": int(c)}
            for s, c in rows if s is not None
        ],
    })


@stats_bp.route("/by-hour", methods=["GET"])
@jwt_required()
def stats_by_hour():
    query = db.session.query(
        func.extract("hour", AccidentClean.start_time).label("hour"),
        func.count(AccidentClean.id)
    )
    query = apply_filters(query)
    rows  = (
        query
        .group_by("hour")
        .order_by("hour")
        .all()
    )

    return jsonify({
        "status": "ok",
        "data": [
            {"hour": int(h), "count": int(c)}
            for h, c in rows if h is not None
        ],
    })