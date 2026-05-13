"""
stats.py — Dashboard KPI endpoints
====================================
Queries run against the datamart star schema:
  fact_accident ← dim_time, dim_location, dim_weather, dim_road

Active KPIs:
  KPI 1  /api/stats/overview          → total accidents, avg severity, years covered
  KPI 2  /api/stats/by-month          → monthly trend (count + avg severity)
  KPI 2b /api/stats/by-year           → year-over-year comparison
  KPI 3  /api/stats/by-severity       → severity distribution (count + pct)
  KPI 4  /api/stats/by-state          → accidents per state (count + avg severity)
  KPI 4b /api/stats/map-points        → city-level bubbles for the map
  KPI 5  /api/stats/by-weather        → top weather conditions (count + avg severity)
  KPI 7  /api/stats/by-hour           → peak hour heatmap (hour × day_of_week grid)
  KPI 9  /api/stats/by-env-bucket     → temp bucket + visibility bucket breakdown

Additional Metrics:
  /api/stats/avg-duration             → average accident duration
  /api/stats/high-severity-rate       → percentage of high severity accidents
  /api/stats/severity-by-road-feature → severity breakdown by road features
  /api/stats/risk-multiplier          → risk multiplier based on severity
  /api/stats/rush-hour-severity-index → severity during rush hours
  /api/stats/duration-by-severity     → duration grouped by severity
  /api/stats/night-risk-multiplier    → night vs day risk comparison
  /api/stats/visibility-risk          → severity by visibility bucket

Utility:
  /api/stats/filter-options           → available years, states, months for the UI

Supported query parameters (all optional, all combinable):
  ?year=2021,2022        comma-separated list of years
  ?severity=2,3          comma-separated severity values 1–4
  ?state=CA,TX           comma-separated 2-letter state codes
  ?month=1,2,3           comma-separated month numbers 1–12
"""

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func, distinct
from sqlalchemy.exc import ProgrammingError

from .. import db
from ..models import FactAccident, DimTime, DimLocation, DimWeather, DimRoad

stats_bp = Blueprint("stats", __name__, url_prefix="/api/stats")

# ─────────────────────────────────────────────────────────────
#  CONSTANTS
# ─────────────────────────────────────────────────────────────

MONTH_NAMES = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

SEVERITY_LABELS = {1: "Low", 2: "Moderate", 3: "High", 4: "Critical"}

DAY_ORDER = {
    "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3,
    "Friday": 4, "Saturday": 5, "Sunday": 6,
}

# ─────────────────────────────────────────────────────────────
#  SHARED HELPERS
# ─────────────────────────────────────────────────────────────

def _safe_round(val, decimals: int = 2):
    """Round a potentially-None float."""
    return round(float(val), decimals) if val is not None else None


def _parse_ints(param: str) -> list[int]:
    """Parse ?param=1,2,3 → [1, 2, 3]. Returns [] on missing/bad input."""
    raw = request.args.get(param, "").strip()
    if not raw:
        return []
    result = []
    for token in raw.split(","):
        token = token.strip()
        if token:
            try:
                result.append(int(token))
            except ValueError:
                pass
    return result


def _parse_strings(param: str) -> list[str]:
    """Parse ?param=CA,TX → ['CA', 'TX']. Returns [] on missing input."""
    raw = request.args.get(param, "").strip()
    if not raw:
        return []
    return [v.strip().upper() for v in raw.split(",") if v.strip()]


def _apply_filters_to_query(query, include_year: bool = True):
    """
    Apply all active query-string filters to a query that already has
    FactAccident, DimTime, and DimLocation joined.
    """
    if include_year:
        years = _parse_ints("year")
        if years:
            query = query.filter(DimTime.year.in_(years))

    severities = _parse_ints("severity")
    if severities:
        query = query.filter(FactAccident.severity.in_(severities))

    states = _parse_strings("state")
    if states:
        query = query.filter(DimLocation.state.in_(states))

    months = _parse_ints("month")
    if months:
        query = query.filter(DimTime.month.in_(months))

    return query


def _base_query():
    """
    FactAccident left-joined to all four dimensions.
    """
    return (
        db.session.query(FactAccident)
        .select_from(FactAccident)
        .join(DimTime, FactAccident.time_id == DimTime.time_id)
        .join(DimLocation, FactAccident.location_id == DimLocation.location_id)
        .join(DimWeather, FactAccident.weather_id == DimWeather.weather_id, isouter=True)
        .join(DimRoad, FactAccident.road_id == DimRoad.road_id, isouter=True)
    )


def _handle_missing_tables(exc: ProgrammingError):
    return jsonify({
        "error":      "Datamart tables not found",
        "detail":     "Run /etl/build-datamart first",
        "sql_detail": str(exc),
    }), 503


def _all_years_list() -> list[int]:
    """Return every distinct year in the datamart, ignoring active filters."""
    rows = (
        db.session.query(distinct(DimTime.year))
        .select_from(DimTime)
        .join(FactAccident, FactAccident.time_id == DimTime.time_id)
        .filter(DimTime.year.isnot(None))
        .order_by(DimTime.year)
        .all()
    )
    return [r[0] for r in rows]


# ─────────────────────────────────────────────────────────────
#  KPI 1 — OVERVIEW
# ─────────────────────────────────────────────────────────────

@stats_bp.route("/overview", methods=["GET"])
@jwt_required()
def overview():
    """KPI 1 — Total accidents headline card."""
    try:
        total = _apply_filters_to_query(_base_query()).count()

        query = _base_query()
        query = _apply_filters_to_query(query)
        agg_row = query.with_entities(
            func.avg(FactAccident.severity).label("avg_severity"),
            func.avg(FactAccident.duration_min).label("avg_duration"),
        ).one_or_none()

        all_years = _all_years_list()

        sev_query = _base_query()
        sev_query = _apply_filters_to_query(sev_query)
        sev_rows = sev_query.with_entities(
            FactAccident.severity_label,
            func.count().label("cnt"),
        ).group_by(FactAccident.severity_label).order_by(FactAccident.severity_label).all()
        
        severity_breakdown = {
            r.severity_label: r.cnt
            for r in sev_rows
            if r.severity_label
        }

        return jsonify({
            "years_covered":      all_years,
            "total_accidents":    total,
            "avg_severity":       _safe_round(agg_row.avg_severity if agg_row else None, 2),
            "avg_duration_min":   _safe_round(agg_row.avg_duration if agg_row else None, 1),
            "severity_breakdown": severity_breakdown,
        }), 200

    except ProgrammingError as exc:
        return _handle_missing_tables(exc)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ─────────────────────────────────────────────────────────────
#  KPI 2a — BY MONTH
# ─────────────────────────────────────────────────────────────

@stats_bp.route("/by-month", methods=["GET"])
@jwt_required()
def by_month():
    """KPI 2a — Monthly trend."""
    try:
        query = _base_query()
        query = _apply_filters_to_query(query)
        rows = query.with_entities(
            DimTime.month,
            func.count().label("count"),
            func.avg(FactAccident.severity).label("avg_severity"),
        ).filter(DimTime.month.isnot(None))\
         .group_by(DimTime.month)\
         .order_by(DimTime.month)\
         .all()

        data = [
            {
                "month":        r.month,
                "month_name":   MONTH_NAMES[r.month] if r.month else "?",
                "month_short":  MONTH_NAMES[r.month][:3] if r.month else "?",
                "count":        r.count,
                "avg_severity": _safe_round(r.avg_severity, 2),
            }
            for r in rows
        ]
        return jsonify({"data": data}), 200

    except ProgrammingError as exc:
        return _handle_missing_tables(exc)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ─────────────────────────────────────────────────────────────
#  KPI 2b — BY YEAR
# ─────────────────────────────────────────────────────────────

@stats_bp.route("/by-year", methods=["GET"])
@jwt_required()
def by_year():
    """KPI 2b — Year-over-year trend."""
    try:
        ignore_year = request.args.get("ignore_year_filter", "0") == "1"

        query = _base_query()
        if not ignore_year:
            query = _apply_filters_to_query(query, include_year=True)
        else:
            query = _apply_filters_to_query(query, include_year=False)
            
        rows = query.with_entities(
            DimTime.year,
            func.count().label("count"),
            func.avg(FactAccident.severity).label("avg_severity"),
            func.avg(FactAccident.duration_min).label("avg_duration"),
        ).filter(DimTime.year.isnot(None))\
         .group_by(DimTime.year)\
         .order_by(DimTime.year)\
         .all()

        data = [
            {
                "year":             r.year,
                "count":            r.count,
                "avg_severity":     _safe_round(r.avg_severity, 2),
                "avg_duration_min": _safe_round(r.avg_duration, 1),
            }
            for r in rows
        ]
        return jsonify({"data": data}), 200

    except ProgrammingError as exc:
        return _handle_missing_tables(exc)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ─────────────────────────────────────────────────────────────
#  KPI 3 — BY SEVERITY
# ─────────────────────────────────────────────────────────────

@stats_bp.route("/by-severity", methods=["GET"])
@jwt_required()
def by_severity():
    """KPI 3 — Severity distribution."""
    try:
        query = _base_query()
        query = _apply_filters_to_query(query)
        rows = query.with_entities(
            FactAccident.severity,
            FactAccident.severity_label,
            func.count().label("count"),
        ).group_by(FactAccident.severity, FactAccident.severity_label)\
         .order_by(FactAccident.severity)\
         .all()

        total = sum(r.count for r in rows) or 1
        data = [
            {
                "severity": r.severity,
                "label":    r.severity_label or SEVERITY_LABELS.get(r.severity, str(r.severity)),
                "count":    r.count,
                "pct":      round(r.count / total * 100, 1),
            }
            for r in rows
        ]
        return jsonify({"data": data, "total": total}), 200

    except ProgrammingError as exc:
        return _handle_missing_tables(exc)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ─────────────────────────────────────────────────────────────
#  KPI 4a — BY STATE
# ─────────────────────────────────────────────────────────────

@stats_bp.route("/by-state", methods=["GET"])
@jwt_required()
def by_state():
    """KPI 4a — Accidents by state."""
    try:
        limit = max(1, min(int(request.args.get("limit", 50)), 500))

        query = db.session.query(
            DimLocation.state,
            func.count().label("count"),
            func.avg(FactAccident.severity).label("avg_severity"),
        ).select_from(FactAccident)\
         .join(DimLocation, FactAccident.location_id == DimLocation.location_id)\
         .join(DimTime, FactAccident.time_id == DimTime.time_id)\
         .join(DimWeather, FactAccident.weather_id == DimWeather.weather_id, isouter=True)\
         .join(DimRoad, FactAccident.road_id == DimRoad.road_id, isouter=True)\
         .filter(DimLocation.state.isnot(None))

        years = _parse_ints("year")
        if years:
            query = query.filter(DimTime.year.in_(years))
        
        severities = _parse_ints("severity")
        if severities:
            query = query.filter(FactAccident.severity.in_(severities))
        
        states = _parse_strings("state")
        if states:
            query = query.filter(DimLocation.state.in_(states))
        
        months = _parse_ints("month")
        if months:
            query = query.filter(DimTime.month.in_(months))

        rows = query.group_by(DimLocation.state)\
                    .order_by(func.count().desc())\
                    .limit(limit)\
                    .all()

        data = [
            {
                "state":        r.state,
                "count":        r.count,
                "avg_severity": _safe_round(r.avg_severity, 2),
            }
            for r in rows
        ]
        return jsonify({"data": data}), 200

    except ProgrammingError as exc:
        return _handle_missing_tables(exc)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ─────────────────────────────────────────────────────────────
#  KPI 4b — MAP POINTS
# ─────────────────────────────────────────────────────────────

@stats_bp.route("/map-points", methods=["GET"])
@jwt_required()
def map_points():
    """KPI 4b — City hotspot map."""
    try:
        city_limit = max(1, min(int(request.args.get("city_limit", 200)), 500))

        state_query = db.session.query(
            DimLocation.state,
            DimLocation.us_region,
            func.count().label("count"),
            func.avg(FactAccident.severity).label("avg_severity"),
            func.avg(DimLocation.latitude).label("center_lat"),
            func.avg(DimLocation.longitude).label("center_lng"),
        ).select_from(FactAccident)\
         .join(DimLocation, FactAccident.location_id == DimLocation.location_id)\
         .join(DimTime, FactAccident.time_id == DimTime.time_id)\
         .join(DimWeather, FactAccident.weather_id == DimWeather.weather_id, isouter=True)\
         .join(DimRoad, FactAccident.road_id == DimRoad.road_id, isouter=True)\
         .filter(DimLocation.state.isnot(None))\
         .filter(DimLocation.latitude.isnot(None))

        years = _parse_ints("year")
        if years:
            state_query = state_query.filter(DimTime.year.in_(years))
        
        severities = _parse_ints("severity")
        if severities:
            state_query = state_query.filter(FactAccident.severity.in_(severities))
        
        states = _parse_strings("state")
        if states:
            state_query = state_query.filter(DimLocation.state.in_(states))
        
        months = _parse_ints("month")
        if months:
            state_query = state_query.filter(DimTime.month.in_(months))

        state_rows = state_query.group_by(DimLocation.state, DimLocation.us_region)\
                               .order_by(func.count().desc()).all()

        city_query = db.session.query(
            DimLocation.city,
            DimLocation.state,
            func.count().label("count"),
            func.avg(FactAccident.severity).label("avg_severity"),
            func.avg(DimLocation.latitude).label("lat"),
            func.avg(DimLocation.longitude).label("lng"),
        ).select_from(FactAccident)\
         .join(DimLocation, FactAccident.location_id == DimLocation.location_id)\
         .join(DimTime, FactAccident.time_id == DimTime.time_id)\
         .join(DimWeather, FactAccident.weather_id == DimWeather.weather_id, isouter=True)\
         .join(DimRoad, FactAccident.road_id == DimRoad.road_id, isouter=True)\
         .filter(DimLocation.city.isnot(None))\
         .filter(DimLocation.latitude.isnot(None))

        years = _parse_ints("year")
        if years:
            city_query = city_query.filter(DimTime.year.in_(years))
        
        severities = _parse_ints("severity")
        if severities:
            city_query = city_query.filter(FactAccident.severity.in_(severities))
        
        states = _parse_strings("state")
        if states:
            city_query = city_query.filter(DimLocation.state.in_(states))
        
        months = _parse_ints("month")
        if months:
            city_query = city_query.filter(DimTime.month.in_(months))

        city_rows = city_query.group_by(DimLocation.city, DimLocation.state)\
                             .order_by(func.count().desc())\
                             .limit(city_limit)\
                             .all()

        max_count = max((r.count for r in state_rows), default=1)

        return jsonify({
            "by_state": [
                {
                    "state":        r.state,
                    "region":       r.us_region,
                    "count":        r.count,
                    "avg_severity": _safe_round(r.avg_severity, 2),
                    "center_lat":   _safe_round(r.center_lat, 4),
                    "center_lng":   _safe_round(r.center_lng, 4),
                    "intensity":    round(r.count / max_count, 4),
                }
                for r in state_rows
            ],
            "top_cities": [
                {
                    "city":         r.city,
                    "state":        r.state,
                    "count":        r.count,
                    "avg_severity": _safe_round(r.avg_severity, 2),
                    "lat":          _safe_round(r.lat, 4),
                    "lng":          _safe_round(r.lng, 4),
                }
                for r in city_rows
            ],
        }), 200

    except ProgrammingError as exc:
        return _handle_missing_tables(exc)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ─────────────────────────────────────────────────────────────
#  KPI 5 — BY WEATHER
# ─────────────────────────────────────────────────────────────

@stats_bp.route("/by-weather", methods=["GET"])
@jwt_required()
def by_weather():
    """KPI 5 — Weather impact on severity."""
    try:
        limit = max(1, min(int(request.args.get("limit", 15)), 100))

        query = db.session.query(
            DimWeather.weather_condition,
            func.count().label("count"),
            func.avg(FactAccident.severity).label("avg_severity"),
        ).select_from(FactAccident)\
         .join(DimWeather, FactAccident.weather_id == DimWeather.weather_id)\
         .join(DimTime, FactAccident.time_id == DimTime.time_id)\
         .join(DimLocation, FactAccident.location_id == DimLocation.location_id, isouter=True)\
         .join(DimRoad, FactAccident.road_id == DimRoad.road_id, isouter=True)\
         .filter(DimWeather.weather_condition.isnot(None))

        years = _parse_ints("year")
        if years:
            query = query.filter(DimTime.year.in_(years))
        
        severities = _parse_ints("severity")
        if severities:
            query = query.filter(FactAccident.severity.in_(severities))
        
        states = _parse_strings("state")
        if states:
            query = query.filter(DimLocation.state.in_(states))
        
        months = _parse_ints("month")
        if months:
            query = query.filter(DimTime.month.in_(months))

        rows = query.group_by(DimWeather.weather_condition)\
                    .order_by(func.count().desc())\
                    .limit(limit)\
                    .all()

        total = sum(r.count for r in rows) or 1
        data = [
            {
                "weather_condition": r.weather_condition,
                "count":             r.count,
                "pct":               round(r.count / total * 100, 1),
                "avg_severity":      _safe_round(r.avg_severity, 2),
            }
            for r in rows
        ]
        return jsonify({"data": data, "total": total}), 200

    except ProgrammingError as exc:
        return _handle_missing_tables(exc)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ─────────────────────────────────────────────────────────────
#  KPI 7 — BY HOUR
# ─────────────────────────────────────────────────────────────

@stats_bp.route("/by-hour", methods=["GET"])
@jwt_required()
def by_hour():
    """KPI 7 — Peak hour heatmap."""
    try:
        query = db.session.query(
            DimTime.hour,
            DimTime.day_of_week,
            DimTime.day_name,
            func.count().label("count"),
        ).select_from(FactAccident)\
         .join(DimTime, FactAccident.time_id == DimTime.time_id)\
         .join(DimLocation, FactAccident.location_id == DimLocation.location_id, isouter=True)\
         .join(DimWeather, FactAccident.weather_id == DimWeather.weather_id, isouter=True)\
         .join(DimRoad, FactAccident.road_id == DimRoad.road_id, isouter=True)\
         .filter(DimTime.hour.isnot(None))\
         .filter(DimTime.day_of_week.isnot(None))

        years = _parse_ints("year")
        if years:
            query = query.filter(DimTime.year.in_(years))
        
        severities = _parse_ints("severity")
        if severities:
            query = query.filter(FactAccident.severity.in_(severities))
        
        states = _parse_strings("state")
        if states:
            query = query.filter(DimLocation.state.in_(states))
        
        months = _parse_ints("month")
        if months:
            query = query.filter(DimTime.month.in_(months))

        rows = query.group_by(DimTime.hour, DimTime.day_of_week, DimTime.day_name)\
                    .order_by(DimTime.day_of_week, DimTime.hour)\
                    .all()

        max_count = max((r.count for r in rows), default=1)

        grid = [
            {
                "hour":        r.hour,
                "day_of_week": r.day_of_week,
                "day_name":    r.day_name,
                "count":       r.count,
                "intensity":   _safe_round(r.count / max_count * 100, 1),
            }
            for r in rows
        ]

        hour_totals: dict[int, int] = {}
        for r in rows:
            hour_totals[r.hour] = hour_totals.get(r.hour, 0) + r.count
        summary = [
            {"hour": h, "total_count": c}
            for h, c in sorted(hour_totals.items())
        ]

        return jsonify({"grid": grid, "summary": summary}), 200

    except ProgrammingError as exc:
        return _handle_missing_tables(exc)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ─────────────────────────────────────────────────────────────
#  KPI 9 — BY ENV BUCKET
# ─────────────────────────────────────────────────────────────

@stats_bp.route("/by-env-bucket", methods=["GET"])
@jwt_required()
def by_env_bucket():
    """KPI 9 — Temperature and visibility bucket breakdown."""
    try:
        temp_query = db.session.query(
            DimWeather.temp_bucket,
            func.count().label("count"),
            func.avg(FactAccident.severity).label("avg_severity"),
        ).select_from(FactAccident)\
         .join(DimWeather, FactAccident.weather_id == DimWeather.weather_id)\
         .join(DimTime, FactAccident.time_id == DimTime.time_id)\
         .join(DimLocation, FactAccident.location_id == DimLocation.location_id, isouter=True)\
         .join(DimRoad, FactAccident.road_id == DimRoad.road_id, isouter=True)\
         .filter(DimWeather.temp_bucket.isnot(None))\
         .filter(DimWeather.temp_bucket != "Unknown")

        years = _parse_ints("year")
        if years:
            temp_query = temp_query.filter(DimTime.year.in_(years))
        
        severities = _parse_ints("severity")
        if severities:
            temp_query = temp_query.filter(FactAccident.severity.in_(severities))
        
        states = _parse_strings("state")
        if states:
            temp_query = temp_query.filter(DimLocation.state.in_(states))
        
        months = _parse_ints("month")
        if months:
            temp_query = temp_query.filter(DimTime.month.in_(months))

        temp_rows = temp_query.group_by(DimWeather.temp_bucket)\
                             .order_by(func.count().desc())\
                             .all()

        vis_query = db.session.query(
            DimWeather.visibility_bucket,
            func.count().label("count"),
            func.avg(FactAccident.severity).label("avg_severity"),
        ).select_from(FactAccident)\
         .join(DimWeather, FactAccident.weather_id == DimWeather.weather_id)\
         .join(DimTime, FactAccident.time_id == DimTime.time_id)\
         .join(DimLocation, FactAccident.location_id == DimLocation.location_id, isouter=True)\
         .join(DimRoad, FactAccident.road_id == DimRoad.road_id, isouter=True)\
         .filter(DimWeather.visibility_bucket.isnot(None))\
         .filter(DimWeather.visibility_bucket != "Unknown")

        years = _parse_ints("year")
        if years:
            vis_query = vis_query.filter(DimTime.year.in_(years))
        
        severities = _parse_ints("severity")
        if severities:
            vis_query = vis_query.filter(FactAccident.severity.in_(severities))
        
        states = _parse_strings("state")
        if states:
            vis_query = vis_query.filter(DimLocation.state.in_(states))
        
        months = _parse_ints("month")
        if months:
            vis_query = vis_query.filter(DimTime.month.in_(months))

        vis_rows = vis_query.group_by(DimWeather.visibility_bucket)\
                           .order_by(func.count().desc())\
                           .all()

        TEMP_ORDER = {"Freezing": 0, "Cold": 1, "Cool": 2, "Warm": 3, "Hot": 4}
        VIS_ORDER  = {"Poor": 0, "Moderate": 1, "Good": 2}

        temp_total = sum(r.count for r in temp_rows) or 1
        vis_total  = sum(r.count for r in vis_rows)  or 1

        temp_buckets = sorted(
            [
                {
                    "bucket":       r.temp_bucket,
                    "count":        r.count,
                    "pct":          _safe_round(r.count / temp_total * 100, 1),
                    "avg_severity": _safe_round(r.avg_severity, 2),
                }
                for r in temp_rows
            ],
            key=lambda x: TEMP_ORDER.get(x["bucket"], 99),
        )

        vis_buckets = sorted(
            [
                {
                    "bucket":       r.visibility_bucket,
                    "count":        r.count,
                    "pct":          _safe_round(r.count / vis_total * 100, 1),
                    "avg_severity": _safe_round(r.avg_severity, 2),
                }
                for r in vis_rows
            ],
            key=lambda x: VIS_ORDER.get(x["bucket"], 99),
        )

        return jsonify({
            "temp_buckets": temp_buckets,
            "vis_buckets":  vis_buckets,
        }), 200

    except ProgrammingError as exc:
        return _handle_missing_tables(exc)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ─────────────────────────────────────────────────────────────
#  UTILITY — FILTER OPTIONS
# ─────────────────────────────────────────────────────────────

@stats_bp.route("/filter-options", methods=["GET"])
@jwt_required()
def filter_options():
    """Returns all available filter values for the UI."""
    try:
        year_rows = (
            db.session.query(distinct(DimTime.year))
            .select_from(DimTime)
            .join(FactAccident, FactAccident.time_id == DimTime.time_id)
            .filter(DimTime.year.isnot(None))
            .order_by(DimTime.year)
            .all()
        )
        state_rows = (
            db.session.query(distinct(DimLocation.state))
            .select_from(DimLocation)
            .filter(DimLocation.state.isnot(None))
            .order_by(DimLocation.state)
            .all()
        )
        month_rows = (
            db.session.query(distinct(DimTime.month))
            .select_from(DimTime)
            .filter(DimTime.month.isnot(None))
            .order_by(DimTime.month)
            .all()
        )

        return jsonify({
            "years":      [r[0] for r in year_rows],
            "states":     [r[0] for r in state_rows],
            "months":     [r[0] for r in month_rows],
            "severities": [
                {"value": 1, "label": "Low"},
                {"value": 2, "label": "Moderate"},
                {"value": 3, "label": "High"},
                {"value": 4, "label": "Critical"},
            ],
        }), 200

    except ProgrammingError as exc:
        return _handle_missing_tables(exc)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ─────────────────────────────────────────────────────────────
#  ADDITIONAL METRICS (USED BY DASHBOARD)
# ─────────────────────────────────────────────────────────────

@stats_bp.route("/avg-duration", methods=["GET"])
@jwt_required()
def avg_duration():
    """Average Duration metric."""
    try:
        query = _base_query()
        query = _apply_filters_to_query(query)
        agg_row = query.with_entities(
            func.avg(FactAccident.duration_min).label("avg_duration"),
        ).one_or_none()

        return jsonify({
            "avg_duration_min": _safe_round(agg_row.avg_duration if agg_row else None, 1),
        }), 200

    except ProgrammingError as exc:
        return _handle_missing_tables(exc)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@stats_bp.route("/high-severity-rate", methods=["GET"])
@jwt_required()
def high_severity_rate():
    """High Severity Rate metric."""
    try:
        base_query = _base_query()
        filtered_query = _apply_filters_to_query(base_query)

        total_accidents = filtered_query.count()
        high_severity_accidents = filtered_query.filter(FactAccident.severity >= 3).count()

        high_severity_rate = _safe_round((high_severity_accidents / total_accidents * 100) if total_accidents > 0 else 0, 2)

        return jsonify({
            "high_severity_rate": high_severity_rate,
        }), 200

    except ProgrammingError as exc:
        return _handle_missing_tables(exc)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@stats_bp.route("/severity-by-road-feature", methods=["GET"])
@jwt_required()
def severity_by_road_feature():
    """Severity by Road Feature metric."""
    try:
        road_features = [
            'amenity', 'bump', 'crossing', 'give_way', 'junction', 
            'no_exit', 'railway', 'roundabout', 'station', 'stop', 
            'traffic_calming', 'traffic_signal', 'turning_loop'
        ]
        
        results = []
        
        years = _parse_ints("year")
        severities = _parse_ints("severity")
        states = _parse_strings("state")
        months = _parse_ints("month")
        
        for feature in road_features:
            query = db.session.query(
                func.count().label("count"),
                func.avg(FactAccident.severity).label("avg_severity"),
            ).select_from(FactAccident)\
             .join(DimRoad, FactAccident.road_id == DimRoad.road_id)\
             .join(DimTime, FactAccident.time_id == DimTime.time_id)\
             .join(DimLocation, FactAccident.location_id == DimLocation.location_id)\
             .join(DimWeather, FactAccident.weather_id == DimWeather.weather_id, isouter=True)\
             .filter(getattr(DimRoad, feature) == True)
            
            if years:
                query = query.filter(DimTime.year.in_(years))
            if severities:
                query = query.filter(FactAccident.severity.in_(severities))
            if states:
                query = query.filter(DimLocation.state.in_(states))
            if months:
                query = query.filter(DimTime.month.in_(months))
            
            row = query.one_or_none()
            
            if row and row.count > 0:
                results.append({
                    "road_feature": feature.replace('_', ' ').title(),
                    "count": row.count,
                    "avg_severity": _safe_round(row.avg_severity, 2),
                })
        
        results.sort(key=lambda x: x["count"], reverse=True)
        
        return jsonify({"data": results}), 200

    except ProgrammingError as exc:
        return _handle_missing_tables(exc)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@stats_bp.route("/risk-multiplier", methods=["GET"])
@jwt_required()
def risk_multiplier():
    """Risk Multiplier metric (based on average severity)."""
    try:
        query = _base_query()
        query = _apply_filters_to_query(query)
        agg_row = query.with_entities(
            func.avg(FactAccident.severity).label("avg_severity"),
        ).one_or_none()

        risk_val = _safe_round(agg_row.avg_severity if agg_row else None, 2)

        return jsonify({
            "risk_multiplier": risk_val,
        }), 200

    except ProgrammingError as exc:
        return _handle_missing_tables(exc)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@stats_bp.route("/rush-hour-severity-index", methods=["GET"])
@jwt_required()
def rush_hour_severity_index():
    """Rush Hour Severity Index metric."""
    try:
        RUSH_HOUR_MORNING_START = 6
        RUSH_HOUR_MORNING_END   = 9
        RUSH_HOUR_EVENING_START = 16
        RUSH_HOUR_EVENING_END   = 19

        query = _base_query()
        query = _apply_filters_to_query(query)

        query = query.filter(
            DimTime.day_of_week.in_([0, 1, 2, 3, 4]),
            (
                (DimTime.hour >= RUSH_HOUR_MORNING_START) & (DimTime.hour < RUSH_HOUR_MORNING_END) |
                (DimTime.hour >= RUSH_HOUR_EVENING_START) & (DimTime.hour < RUSH_HOUR_EVENING_END)
            )
        )

        agg_row = query.with_entities(
            func.avg(FactAccident.severity).label("avg_severity"),
        ).one_or_none()

        rush_hour_index = _safe_round(agg_row.avg_severity if agg_row else None, 2)

        return jsonify({
            "rush_hour_severity_index": rush_hour_index,
        }), 200

    except ProgrammingError as exc:
        return _handle_missing_tables(exc)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@stats_bp.route("/duration-by-severity", methods=["GET"])
@jwt_required()
def duration_by_severity():
    """Duration by Severity metric."""
    try:
        query = _base_query()
        query = _apply_filters_to_query(query)
        rows = query.with_entities(
            FactAccident.severity,
            FactAccident.severity_label,
            func.avg(FactAccident.duration_min).label("avg_duration"),
        ).filter(FactAccident.duration_min.isnot(None))\
         .group_by(FactAccident.severity, FactAccident.severity_label)\
         .order_by(FactAccident.severity)\
         .all()

        data = [
            {
                "severity":         r.severity,
                "label":            r.severity_label or SEVERITY_LABELS.get(r.severity, str(r.severity)),
                "avg_duration_min": _safe_round(r.avg_duration, 1),
            }
            for r in rows
        ]
        return jsonify({"data": data}), 200

    except ProgrammingError as exc:
        return _handle_missing_tables(exc)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@stats_bp.route("/night-risk-multiplier", methods=["GET"])
@jwt_required()
def night_risk_multiplier():
    """Night Risk Multiplier metric."""
    try:
        NIGHT_START_HOUR = 20
        NIGHT_END_HOUR   = 5

        base_query = _base_query()
        filtered_query = _apply_filters_to_query(base_query)

        night_query = filtered_query.filter(
            (DimTime.hour >= NIGHT_START_HOUR) | (DimTime.hour < NIGHT_END_HOUR)
        )
        night_agg = night_query.with_entities(func.avg(FactAccident.severity).label("avg_severity")).one_or_none()
        avg_severity_night = night_agg.avg_severity if night_agg else None

        day_query = filtered_query.filter(
            (DimTime.hour >= NIGHT_END_HOUR) & (DimTime.hour < NIGHT_START_HOUR)
        )
        day_agg = day_query.with_entities(func.avg(FactAccident.severity).label("avg_severity")).one_or_none()
        avg_severity_day = day_agg.avg_severity if day_agg else None

        night_risk_multiplier = 1.0
        if avg_severity_day and avg_severity_night and avg_severity_day > 0:
            night_risk_multiplier = _safe_round(avg_severity_night / avg_severity_day, 2)
        elif avg_severity_night and not avg_severity_day:
            night_risk_multiplier = _safe_round(avg_severity_night, 2)

        return jsonify({
            "night_risk_multiplier": night_risk_multiplier,
        }), 200

    except ProgrammingError as exc:
        return _handle_missing_tables(exc)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@stats_bp.route("/visibility-risk", methods=["GET"])
@jwt_required()
def visibility_risk():
    """Visibility Risk metric."""
    try:
        query = db.session.query(
            DimWeather.visibility_bucket,
            func.avg(FactAccident.severity).label("avg_severity"),
            func.count().label("count"),
        ).select_from(FactAccident)\
         .join(DimWeather, FactAccident.weather_id == DimWeather.weather_id)\
         .join(DimTime, FactAccident.time_id == DimTime.time_id, isouter=True)\
         .join(DimLocation, FactAccident.location_id == DimLocation.location_id, isouter=True)\
         .join(DimRoad, FactAccident.road_id == DimRoad.road_id, isouter=True)\
         .filter(DimWeather.visibility_bucket.isnot(None))\
         .filter(DimWeather.visibility_bucket != "Unknown")

        years = _parse_ints("year")
        if years:
            query = query.filter(DimTime.year.in_(years))
        
        severities = _parse_ints("severity")
        if severities:
            query = query.filter(FactAccident.severity.in_(severities))
        
        states = _parse_strings("state")
        if states:
            query = query.filter(DimLocation.state.in_(states))
        
        months = _parse_ints("month")
        if months:
            query = query.filter(DimTime.month.in_(months))

        rows = query.group_by(DimWeather.visibility_bucket)\
                    .having(func.count() > 5)\
                    .order_by(func.avg(FactAccident.severity).desc())\
                    .all()

        data = [
            {
                "visibility_bucket": r.visibility_bucket,
                "avg_severity":      _safe_round(r.avg_severity, 2),
            }
            for r in rows
        ]
        return jsonify({"data": data}), 200

    except ProgrammingError as exc:
        return _handle_missing_tables(exc)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500