
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
                "intensity":   _safe_round(r.count / max_count * 100, 1),
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


# ─────────────────────────────────────────────────────────────
#  NEW KPIs (MUST HAVE)
# ─────────────────────────────────────────────────────────────

@stats_bp.route("/avg-duration", methods=["GET"])
@jwt_required()
def avg_duration():
    """
    MUST HAVE — Average Duration.

    Returns:
      avg_duration_min   — AVG(duration_min) with active filters
    """
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
    """
    MUST HAVE — High Severity Rate.

    Formula:
      (COUNT(fact_id) WHERE severity >= 3) / COUNT(fact_id) * 100
    Returns:
      high_severity_rate — Percentage of accidents with high severity (3 or 4)
    """
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
    """
    MUST HAVE — Severity by Road Feature.

    Formula:
      For each road feature (amenity, bump, crossing, etc.):
      COUNT(fact_id) WHERE feature = True
      AVG(severity) WHERE feature = True
    Returns: [{road_feature, count, avg_severity}] ordered by count desc
    """
    try:
        # List of road feature columns in DimRoad
        road_features = [
            'amenity', 'bump', 'crossing', 'give_way', 'junction', 
            'no_exit', 'railway', 'roundabout', 'station', 'stop', 
            'traffic_calming', 'traffic_signal', 'turning_loop'
        ]
        
        results = []
        
        # Apply filters once for all queries
        years = _parse_ints("year")
        severities = _parse_ints("severity")
        states = _parse_strings("state")
        months = _parse_ints("month")
        
        for feature in road_features:
            # Build query for this specific road feature
            query = db.session.query(
                func.count().label("count"),
                func.avg(FactAccident.severity).label("avg_severity"),
            ).select_from(FactAccident)\
             .join(DimRoad, FactAccident.road_id == DimRoad.road_id)\
             .join(DimTime, FactAccident.time_id == DimTime.time_id)\
             .join(DimLocation, FactAccident.location_id == DimLocation.location_id)\
             .join(DimWeather, FactAccident.weather_id == DimWeather.weather_id, isouter=True)\
             .filter(getattr(DimRoad, feature) == True)  # Only accidents where this feature is present
            
            # Apply filters
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
                    "road_feature": feature.replace('_', ' ').title(),  # Format nicely
                    "count": row.count,
                    "avg_severity": _safe_round(row.avg_severity, 2),
                })
        
        # Sort by count descending
        results.sort(key=lambda x: x["count"], reverse=True)
        
        return jsonify({"data": results}), 200

    except ProgrammingError as exc:
        return _handle_missing_tables(exc)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

@stats_bp.route("/risk-multiplier", methods=["GET"])
@jwt_required()
def risk_multiplier():
    """
    MUST HAVE — Risk Multiplier.

    This is a placeholder. A more complex calculation involving multiple factors
    (e.g., road features, weather, time of day) would be implemented here.
    For now, it returns a dummy value or a simple aggregation.
    Returns:
      risk_multiplier — A calculated risk multiplier.
    """
    try:
        # Placeholder for a more complex risk multiplier calculation.
        # For demonstration, let's return the average severity as a simple risk indicator.
        query = _base_query()
        query = _apply_filters_to_query(query)
        agg_row = query.with_entities(
            func.avg(FactAccident.severity).label("avg_severity"),
        ).one_or_none()

        risk_val = _safe_round(agg_row.avg_severity if agg_row else None, 2)
        # A more sophisticated calculation would involve weighting different factors.
        # For example: risk_multiplier = avg_severity * weather_factor * road_factor

        return jsonify({
            "risk_multiplier": risk_val,
            "note": "This is a simplified risk multiplier based on average severity. A more complex model would integrate multiple factors."
        }), 200

    except ProgrammingError as exc:
        return _handle_missing_tables(exc)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@stats_bp.route("/rush-hour-severity-index", methods=["GET"])
@jwt_required()
def rush_hour_severity_index():
    """
    MUST HAVE — Rush Hour Severity Index.

    Formula:
      AVG(severity) for accidents occurring during defined rush hours (e.g., 6-9 AM and 4-7 PM on weekdays).
    Returns:
      rush_hour_severity_index — Average severity during rush hours.
    """
    try:
        # Define rush hour periods (e.g., 6-9 AM and 4-7 PM on weekdays)
        # Weekdays are 0-4 (Monday-Friday) if Sunday is 6
        # Assuming DimTime.day_of_week is 0=Monday, 6=Sunday based on DAY_ORDER
        # Let's assume 0=Monday to 4=Friday for weekdays
        RUSH_HOUR_MORNING_START = 6
        RUSH_HOUR_MORNING_END   = 9
        RUSH_HOUR_EVENING_START = 16
        RUSH_HOUR_EVENING_END   = 19

        query = _base_query()
        query = _apply_filters_to_query(query)

        # Filter for weekdays (Monday=0 to Friday=4) and rush hour times
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


@stats_bp.route("/weather-severity-score", methods=["GET"])
@jwt_required()
def weather_severity_score():
    """
    MUST HAVE — Weather Severity Score.

    Formula:
      AVG(severity) grouped by weather conditions, potentially weighted.
      For simplicity, we'll return average severity for each weather condition.
    Returns: [{weather_condition, avg_severity}] ordered by avg_severity desc
    """
    try:
        query = db.session.query(
            DimWeather.weather_condition,
            func.avg(FactAccident.severity).label("avg_severity"),
            func.count().label("count"), # Include count to ensure enough data points
        ).select_from(FactAccident)\
         .join(DimWeather, FactAccident.weather_id == DimWeather.weather_id)\
         .join(DimTime, FactAccident.time_id == DimTime.time_id, isouter=True)\
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
        .having(func.count() > 5)\
        .order_by(func.avg(FactAccident.severity).desc())\
        .all()

        data = [
            {
                "weather_condition": r.weather_condition,
                "avg_severity":      _safe_round(r.avg_severity, 2),
            }
            for r in rows
        ]
        return jsonify({"data": data}), 200

    except ProgrammingError as exc:
        return _handle_missing_tables(exc)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ─────────────────────────────────────────────────────────────
#  NEW KPIs (IMPORTANT)
# ─────────────────────────────────────────────────────────────

@stats_bp.route("/duration-by-severity", methods=["GET"])
@jwt_required()
def duration_by_severity():
    """
    IMPORTANT — Duration by Severity.

    Formula:
      AVG(duration_min) GROUP BY severity
    Returns: [{severity, label, avg_duration_min}] ordered 1→4
    """
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


@stats_bp.route("/road-complexity-index", methods=["GET"])
@jwt_required()
def road_complexity_index():
    """
    IMPORTANT — Road Complexity Index.

    This is a placeholder. A more complex calculation involving road features,
    number of lanes, speed limits, etc., would be implemented here.
    For now, it returns a dummy value or a simple aggregation based on road features.
    Returns:
      road_complexity_index — A calculated road complexity index.
    """
    try:
        # Placeholder for a more complex road complexity calculation.
        # For demonstration, let's return the average severity as a simple indicator.
        query = _base_query()
        query = _apply_filters_to_query(query)
        agg_row = query.with_entities(
            func.avg(FactAccident.severity).label("avg_severity"),
        ).one_or_none()

        complexity_val = _safe_round(agg_row.avg_severity if agg_row else None, 2)
        # A more sophisticated calculation could involve weighting different road attributes.

        return jsonify({
            "road_complexity_index": complexity_val,
            "note": "This is a simplified road complexity index based on average severity. A more complex model would integrate various road attributes."
        }), 200

    except ProgrammingError as exc:
        return _handle_missing_tables(exc)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@stats_bp.route("/night-risk-multiplier", methods=["GET"])
@jwt_required()
def night_risk_multiplier():
    """
    IMPORTANT — Night Risk Multiplier.

    Formula:
      A multiplier indicating increased risk during night hours (e.g., 8 PM to 5 AM).
      For simplicity, we'll compare average severity during night vs. day.
    Returns:
      night_risk_multiplier — A multiplier representing night-time risk.
    """
    try:
        NIGHT_START_HOUR = 20 # 8 PM
        NIGHT_END_HOUR   = 5  # 5 AM

        base_query = _base_query()
        filtered_query = _apply_filters_to_query(base_query)

        # Average severity during night hours
        night_query = filtered_query.filter(
            (DimTime.hour >= NIGHT_START_HOUR) | (DimTime.hour < NIGHT_END_HOUR)
        )
        night_agg = night_query.with_entities(func.avg(FactAccident.severity).label("avg_severity")).one_or_none()
        avg_severity_night = night_agg.avg_severity if night_agg else None

        # Average severity during day hours
        day_query = filtered_query.filter(
            (DimTime.hour >= NIGHT_END_HOUR) & (DimTime.hour < NIGHT_START_HOUR)
        )
        day_agg = day_query.with_entities(func.avg(FactAccident.severity).label("avg_severity")).one_or_none()
        avg_severity_day = day_agg.avg_severity if day_agg else None

        night_risk_multiplier = 1.0
        if avg_severity_day and avg_severity_night and avg_severity_day > 0:
            night_risk_multiplier = _safe_round(avg_severity_night / avg_severity_day, 2)
        elif avg_severity_night and not avg_severity_day:
            night_risk_multiplier = _safe_round(avg_severity_night, 2) # If no day data, just return night severity

        return jsonify({
            "night_risk_multiplier": night_risk_multiplier,
            "note": "This multiplier compares average severity during night hours (8 PM - 5 AM) to day hours. A value > 1 indicates higher night risk."
        }), 200

    except ProgrammingError as exc:
        return _handle_missing_tables(exc)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@stats_bp.route("/visibility-risk", methods=["GET"])
@jwt_required()
def visibility_risk():
    """
    IMPORTANT — Visibility Risk.

    Formula:
      AVG(severity) grouped by visibility buckets, potentially weighted.
      For simplicity, we'll return average severity for each visibility bucket.
    Returns: [{visibility_bucket, avg_severity}] ordered by avg_severity desc
    """
    try:
        query = db.session.query(
            DimWeather.visibility_bucket,
            func.avg(FactAccident.severity).label("avg_severity"),
            func.count().label("count"), # Include count to ensure enough data points
        ).select_from(FactAccident)\
         .join(DimWeather, FactAccident.weather_id == DimWeather.weather_id)\
         .join(DimTime, FactAccident.time_id == DimTime.time_id, isouter=True)\
         .join(DimLocation, FactAccident.location_id == DimLocation.location_id, isouter=True)\
         .join(DimRoad, FactAccident.road_id == DimRoad.road_id, isouter=True)\
         .filter(DimWeather.visibility_bucket.isnot(None))\
         .filter(DimWeather.visibility_bucket != "Unknown")

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


# ─────────────────────────────────────────────────────────────
#  BONUS KPIs (for jury / advanced) - Future Enhancements
# ─────────────────────────────────────────────────────────────

@stats_bp.route("/predicted-severity-score", methods=["GET"])
@jwt_required()
def predicted_severity_score():
    """
    BONUS — Predicted Severity Score.

    This API would require a machine learning model to predict severity based on various factors.
    This is a placeholder for future enhancement.
    """
    return jsonify({"message": "Predicted Severity Score API is a future enhancement and not yet implemented."}), 200


@stats_bp.route("/global-risk-score", methods=["GET"])
@jwt_required()
def global_risk_score():
    """
    BONUS — Global Risk Score.

    This API would involve a complex aggregation of multiple risk factors across different dimensions.
    This is a placeholder for future enhancement.
    """
    return jsonify({"message": "Global Risk Score API is a future enhancement and not yet implemented."}), 200
