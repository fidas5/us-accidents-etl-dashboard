from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from .. import db
from ..models import AccidentClean
from sqlalchemy import extract

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


def get_filters(request):
    filters = []
    min_severity = request.args.get("min_severity", type=int)
    month        = request.args.get("month", type=int)
    if min_severity:
        filters.append(AccidentClean.severity >= min_severity)
    if month:
        filters.append(extract("month", AccidentClean.start_time) == month)
    return filters


@stats_bp.route("/summary", methods=["GET"])
@jwt_required()
def summary():
    filters = get_filters(request)
    total     = AccidentClean.query.filter(*filters).count()
    cities    = db.session.query(AccidentClean.city)\
                  .filter(*filters).distinct().count()
    time_range = db.session.query(
        func.min(AccidentClean.start_time),
        func.max(AccidentClean.start_time)
    ).filter(*filters).one()

    return jsonify({"data": {
        "total_accidents": total,
        "total_cities":    cities,
        "time_range": {
            "min_date": time_range[0].strftime("%Y-%m-%d") if time_range[0] else None,
            "max_date": time_range[1].strftime("%Y-%m-%d") if time_range[1] else None,
        }
    }}), 200


@stats_bp.route("/by-severity", methods=["GET"])
@jwt_required()
def by_severity():
    filters = get_filters(request)
    rows = db.session.query(
        AccidentClean.severity,
        func.count().label("count")
    ).filter(*filters).group_by(AccidentClean.severity)\
     .order_by(AccidentClean.severity).all()

    return jsonify({"data": [{"severity": r.severity, "count": r.count} for r in rows]}), 200


@stats_bp.route("/by-hour", methods=["GET"])
@jwt_required()
def by_hour():
    filters = get_filters(request)
    rows = db.session.query(
        extract("hour", AccidentClean.start_time).label("hour"),
        func.count().label("count")
    ).filter(*filters).group_by("hour").order_by("hour").all()

    return jsonify({"data": [{"hour": int(r.hour), "count": r.count} for r in rows]}), 200


@stats_bp.route("/by-state", methods=["GET"])
@jwt_required()
def by_state():
    filters = get_filters(request)
    min_sev = request.args.get("min_severity", type=int)
    rows = db.session.query(
        AccidentClean.state,
        func.count().label("count")
    ).filter(*filters).group_by(AccidentClean.state)\
     .order_by(func.count().desc()).limit(10).all()

    return jsonify({"data": [{"state": r.state, "count": r.count} for r in rows]}), 200


    # backend/app/routes/accidents.py  — add this new route

