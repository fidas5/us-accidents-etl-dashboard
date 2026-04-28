"""
stats.py — Dashboard KPI endpoints
====================================
Queries run against the datamart star schema:
  fact_accident ← dim_time, dim_location, dim_weather, dim_road

Active KPIs (KPI 6 road-features and KPI 8 duration removed — see audit):
  KPI 1  /api/stats/overview          → total accidents, avg severity, years covered, severity breakdown
  KPI 2  /api/stats/by-month          → monthly trend (count + avg severity)
  KPI 2b /api/stats/by-year           → year-over-year comparison
  KPI 3  /api/stats/by-severity       → severity distribution (count + pct)
  KPI 4  /api/stats/by-state          → accidents per state (count + avg severity)
  KPI 4b /api/stats/map-points        → city-level bubbles for the map
  KPI 5  /api/stats/by-weather        → top weather conditions (count + avg severity)
  KPI 7  /api/stats/by-hour           → peak hour heatmap (hour × day_of_week grid)
  KPI 9  /api/stats/by-env-bucket     → temp bucket + visibility bucket breakdown

  Utility:
  GET /api/stats/filter-options       → available years, states, months for the UI

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
    """
    KPI 1 — Total accidents headline card.

    Returns:
      years_covered      — all years in datamart (for tab bar)
      total_accidents    — COUNT(fact_id) with active filters
      avg_severity       — AVG(severity) with active filters
      avg_duration_min   — AVG(duration_min) — stored but not shown as KPI
      severity_breakdown — {label: count} for the mini bar breakdown card
    """
    try:
        # Total count (filtered)
        total = _apply_filters_to_query(_base_query()).count()

        # Averages (filtered)
        query = _base_query()
        query = _apply_filters_to_query(query)
        agg_row = query.with_entities(
            func.avg(FactAccident.severity).label("avg_severity"),
            func.avg(FactAccident.duration_min).label("avg_duration"),
        ).one_or_none()

        # All years — never filtered so the tab bar always shows the full set
        all_years = _all_years_list()

        # Severity breakdown (filtered)
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
#  KPI 2a — BY MONTH  (monthly trend line)
# ─────────────────────────────────────────────────────────────

@stats_bp.route("/by-month", methods=["GET"])
@jwt_required()
def by_month():
    """
    KPI 2a — Monthly trend.

    Formula: COUNT(fact_id) GROUP BY month
    Returns: [{month, month_name, count, avg_severity}] Jan → Dec
    """
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
#  KPI 2b — BY YEAR  (year-over-year comparison)
# ─────────────────────────────────────────────────────────────

@stats_bp.route("/by-year", methods=["GET"])
@jwt_required()
def by_year():
    """
    KPI 2b — Year-over-year trend.

    Formula: COUNT(fact_id) GROUP BY year
    Returns: [{year, count, avg_severity, avg_duration_min}]

    Pass ?ignore_year_filter=1 to always return all years
    (useful for building the full YoY chart even when a year is selected).
    """
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
#  KPI 3 — BY SEVERITY  (distribution)
# ─────────────────────────────────────────────────────────────

@stats_bp.route("/by-severity", methods=["GET"])
@jwt_required()
def by_severity():
    """
    KPI 3 — Severity distribution.

    Formula:
      COUNT(fact_id) GROUP BY severity
      pct = count / SUM(count) * 100
    Returns: [{severity, label, count, pct}] ordered 1→4
    """
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
    """
    KPI 4a — Accidents by state.

    Formula:
      COUNT(fact_id) GROUP BY state
      AVG(severity) per state
    Returns: [{state, count, avg_severity}] ordered by count desc
    ?limit=N  default 50
    """
    try:
        limit = max(1, min(int(request.args.get("limit", 50)), 500))

        # Build base query with all joins
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

        # Apply filters manually
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
#  KPI 4b — MAP POINTS  (city-level bubbles)
# ─────────────────────────────────────────────────────────────

@stats_bp.route("/map-points", methods=["GET"])
@jwt_required()
def map_points():
    """
    KPI 4b — City hotspot map.

    Formula:
      COUNT(fact_id) GROUP BY city, state
      AVG(severity) per city
      AVG(latitude), AVG(longitude) → bubble centre
    ?city_limit=N  default 200
    """
    try:
        city_limit = max(1, min(int(request.args.get("city_limit", 200)), 500))

        # State-level aggregation (for choropleth / reference)
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

        # Apply filters manually
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

        # City-level aggregation
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

        # Apply filters manually for city query
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
#  KPI 5 — BY WEATHER  (condition impact)
# ─────────────────────────────────────────────────────────────

@stats_bp.route("/by-weather", methods=["GET"])
@jwt_required()
def by_weather():
    """
    KPI 5 — Weather impact on severity.

    Formula:
      COUNT(fact_id)    GROUP BY weather_condition
      AVG(severity)     GROUP BY weather_condition
    Returns: [{weather_condition, count, pct, avg_severity}] top N by count
    ?limit=N  default 15
    """
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

        # Apply filters manually
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
#  KPI 7 — BY HOUR  (peak hour heatmap)
# ─────────────────────────────────────────────────────────────

@stats_bp.route("/by-hour", methods=["GET"])
@jwt_required()
def by_hour():
    """
    KPI 7 — Peak hour heatmap.

    Formula:
      COUNT(fact_id) GROUP BY hour, day_of_week
      intensity = count / MAX(count) * 100   (normalised 0–100)
    Returns:
      grid: [{hour, day_of_week, day_name, count, intensity}]  (168 cells max)
      summary: [{hour, total_count}]  (24 rows, for the marginal bar)
    """
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

        # Apply filters manually
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
                "intensity":   round(r.count / max_count * 100, 1),
            }
            for r in rows
        ]

        # Marginal: total per hour across all days
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
#  KPI 9 — BY ENV BUCKET  (temp + visibility)
# ─────────────────────────────────────────────────────────────

@stats_bp.route("/by-env-bucket", methods=["GET"])
@jwt_required()
def by_env_bucket():
    """
    KPI 9 — Temperature and visibility bucket breakdown.

    Formula (temp):
      COUNT(fact_id) GROUP BY temp_bucket
      AVG(severity)  GROUP BY temp_bucket
      pct = count / SUM(count) * 100

    Formula (visibility):
      COUNT(fact_id) GROUP BY visibility_bucket
      AVG(severity)  GROUP BY visibility_bucket
      pct = count / SUM(count) * 100

    Returns:
      temp_buckets: [{bucket, count, pct, avg_severity}]
      vis_buckets:  [{bucket, count, pct, avg_severity}]
    """
    try:
        # Temperature buckets query
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

        # Apply filters manually for temp
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

        # Visibility buckets query
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

        # Apply filters manually for visibility
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

        # Bucket order for temperature (cold → hot)
        TEMP_ORDER = {"Freezing": 0, "Cold": 1, "Cool": 2, "Warm": 3, "Hot": 4}
        VIS_ORDER  = {"Poor": 0, "Moderate": 1, "Good": 2}

        temp_total = sum(r.count for r in temp_rows) or 1
        vis_total  = sum(r.count for r in vis_rows)  or 1

        temp_buckets = sorted(
            [
                {
                    "bucket":       r.temp_bucket,
                    "count":        r.count,
                    "pct":          round(r.count / temp_total * 100, 1),
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
                    "pct":          round(r.count / vis_total * 100, 1),
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
    """
    Returns all available filter values so the UI is fully data-driven.
    Year list is always the complete set regardless of active filters.
    """
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