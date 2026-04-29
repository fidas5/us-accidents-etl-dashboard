"""
sql_service.py - Service pour exécuter des requêtes SQL sur le datamart
Version SÉCURISÉE (paramètres SQLAlchemy) et OPTIMISÉE (CTE pour totaux)
"""

import re
from decimal import Decimal
from sqlalchemy import text
from .. import db


def convert_decimal(obj):
    """Convertit les objets Decimal en float ou int pour JSON"""
    if isinstance(obj, Decimal):
        return float(obj) if obj % 1 != 0 else int(obj)
    raise TypeError


def extract_years(question: str) -> list:
    """Extrait les années d'une question"""
    years = re.findall(r"\b(20\d{2})\b", question)
    return [int(y) for y in years]


# =========================================================
# 1. ANALYSE TEMPORELLE (années) - VERSION SÉCURISÉE
# =========================================================

def get_accidents_by_years(question: str) -> list:
    """Retourne le nombre d'accidents par année - SÉCURISÉ"""
    years = extract_years(question)
    if not years:
        years = [2016, 2019, 2022]
    
    query = text("""
        SELECT t.year, COUNT(*) AS accidents
        FROM fact_accident f
        JOIN dim_time t ON f.time_id = t.time_id
        WHERE t.year = ANY(:years)
        GROUP BY t.year
        ORDER BY t.year
    """)
    result = db.session.execute(query, {"years": years}).fetchall()
    return [{"year": int(r[0]), "accidents": r[1]} for r in result]


def get_accidents_trend() -> list:
    """Retourne la tendance des accidents sur toutes les années"""
    query = text("""
        SELECT t.year, COUNT(*) AS accidents
        FROM fact_accident f
        JOIN dim_time t ON f.time_id = t.time_id
        GROUP BY t.year
        ORDER BY t.year
    """)
    result = db.session.execute(query).fetchall()
    return [{"year": int(r[0]), "accidents": r[1]} for r in result]


# =========================================================
# 2. ANALYSE GÉOGRAPHIQUE (états / régions) - SÉCURISÉ
# =========================================================

def get_accidents_by_state(limit: int = 10) -> list:
    """Retourne le nombre d'accidents par état - SÉCURISÉ avec paramètre"""
    query = text("""
        SELECT l.state, COUNT(*) AS accidents
        FROM fact_accident f
        JOIN dim_location l ON f.location_id = l.location_id
        WHERE l.state IS NOT NULL AND l.state != ''
        GROUP BY l.state
        ORDER BY accidents DESC
        LIMIT :limit
    """)
    result = db.session.execute(query, {"limit": limit}).fetchall()
    return [{"state": r[0], "accidents": r[1]} for r in result]


def get_accidents_by_region() -> list:
    """Retourne le nombre d'accidents par région US"""
    query = text("""
        SELECT l.us_region, COUNT(*) AS accidents
        FROM fact_accident f
        JOIN dim_location l ON f.location_id = l.location_id
        WHERE l.us_region IS NOT NULL AND l.us_region != 'Unknown'
        GROUP BY l.us_region
        ORDER BY accidents DESC
    """)
    result = db.session.execute(query).fetchall()
    return [{"region": r[0], "accidents": r[1]} for r in result]


# =========================================================
# 3. ANALYSE MÉTÉO - OPTIMISÉE (CTE pour total)
# =========================================================

def get_accidents_by_weather() -> list:
    """Retourne le nombre d'accidents par condition météo - OPTIMISÉ"""
    query = text("""
        WITH total AS (SELECT COUNT(*) AS total FROM fact_accident)
        SELECT 
            w.weather_condition,
            w.temp_bucket,
            COUNT(*) AS accidents,
            ROUND(100.0 * COUNT(*) / total.total, 2) AS percentage
        FROM fact_accident f
        JOIN dim_weather w ON f.weather_id = w.weather_id
        CROSS JOIN total
        WHERE w.weather_condition IS NOT NULL
        GROUP BY w.weather_condition, w.temp_bucket, total.total
        ORDER BY accidents DESC
        LIMIT 15
    """)
    result = db.session.execute(query).fetchall()
    return [{"weather": r[0], "temp_bucket": r[1], "accidents": r[2], "percentage": float(r[3]) if r[3] else 0} for r in result]


def get_weather_trend_by_year() -> list:
    """Tendance météo par année"""
    query = text("""
        SELECT t.year, w.weather_condition, COUNT(*) AS accidents
        FROM fact_accident f
        JOIN dim_time t ON f.time_id = t.time_id
        JOIN dim_weather w ON f.weather_id = w.weather_id
        WHERE w.weather_condition IS NOT NULL
        GROUP BY t.year, w.weather_condition
        ORDER BY t.year, accidents DESC
    """)
    result = db.session.execute(query).fetchall()
    return [{"year": r[0], "weather": r[1], "accidents": r[2]} for r in result]


# =========================================================
# 4. ANALYSE DE GRAVITÉ - OPTIMISÉE
# =========================================================

def get_severity_distribution() -> list:
    """Distribution des niveaux de gravité"""
    query = text("""
        WITH total AS (SELECT COUNT(*) AS total FROM fact_accident)
        SELECT 
            severity_label, 
            COUNT(*) AS accidents,
            ROUND(100.0 * COUNT(*) / total.total, 2) AS percentage
        FROM fact_accident
        CROSS JOIN total
        GROUP BY severity_label, total.total
        ORDER BY severity_label
    """)
    result = db.session.execute(query).fetchall()
    return [{"severity": r[0], "accidents": r[1], "percentage": float(r[2]) if r[2] else 0} for r in result]


def get_severity_trend_by_year() -> list:
    """Tendance de gravité par année"""
    query = text("""
        SELECT t.year, f.severity_label, COUNT(*) AS accidents
        FROM fact_accident f
        JOIN dim_time t ON f.time_id = t.time_id
        GROUP BY t.year, f.severity_label
        ORDER BY t.year, accidents DESC
    """)
    result = db.session.execute(query).fetchall()
    return [{"year": r[0], "severity": r[1], "accidents": r[2]} for r in result]


# =========================================================
# 5. ANALYSE TEMPORELLE (saisons / heures) - OPTIMISÉE
# =========================================================

def get_accidents_by_season() -> list:
    """Accidents par saison - OPTIMISÉ avec CTE"""
    query = text("""
        WITH total AS (SELECT COUNT(*) AS total FROM fact_accident)
        SELECT 
            t.season, 
            COUNT(*) AS accidents,
            ROUND(100.0 * COUNT(*) / total.total, 2) AS percentage
        FROM fact_accident f
        JOIN dim_time t ON f.time_id = t.time_id
        CROSS JOIN total
        GROUP BY t.season, total.total
        ORDER BY accidents DESC
    """)
    result = db.session.execute(query).fetchall()
    return [{"season": r[0], "accidents": r[1], "percentage": float(r[2]) if r[2] else 0} for r in result]


def get_accidents_by_time_of_day() -> list:
    """Accidents par période de la journée - OPTIMISÉ avec CTE"""
    query = text("""
        WITH total AS (SELECT COUNT(*) AS total FROM fact_accident)
        SELECT 
            t.time_of_day, 
            COUNT(*) AS accidents,
            ROUND(100.0 * COUNT(*) / total.total, 2) AS percentage
        FROM fact_accident f
        JOIN dim_time t ON f.time_id = t.time_id
        CROSS JOIN total
        GROUP BY t.time_of_day, total.total
        ORDER BY accidents DESC
    """)
    result = db.session.execute(query).fetchall()
    return [{"time_of_day": r[0], "accidents": r[1], "percentage": float(r[2]) if r[2] else 0} for r in result]


# =========================================================
# 6. ANALYSE DE DURÉE - CORRIGÉE (PostgreSQL compatible)
# =========================================================

def get_avg_duration_by_severity() -> list:
    """Durée moyenne des accidents par gravité - Version PostgreSQL compatible"""
    query = text("""
        SELECT 
            severity_label,
            ROUND(AVG(duration_min)::numeric, 1) AS avg_duration,
            COUNT(*) AS accidents
        FROM fact_accident
        WHERE duration_min IS NOT NULL AND duration_min > 0
        GROUP BY severity_label
        ORDER BY accidents DESC
    """)
    result = db.session.execute(query).fetchall()
    return [{"severity": r[0], "avg_duration_min": float(r[1]) if r[1] else 0, "accidents": r[2]} for r in result]


# =========================================================
# 7. ANALYSE ROAD FEATURES - SÉCURISÉE
# =========================================================

def get_accidents_by_road_features() -> list:
    """Accidents par caractéristiques routières"""
    query = text("""
        SELECT 
            r.traffic_signal,
            r.crossing,
            r.railway,
            r.roundabout,
            COUNT(*) AS accidents
        FROM fact_accident f
        JOIN dim_road r ON f.road_id = r.road_id
        GROUP BY r.traffic_signal, r.crossing, r.railway, r.roundabout
        ORDER BY accidents DESC
        LIMIT 10
    """)
    result = db.session.execute(query).fetchall()
    return [{
        "traffic_signal": bool(r[0]),
        "crossing": bool(r[1]),
        "railway": bool(r[2]),
        "roundabout": bool(r[3]),
        "accidents": r[4]
    } for r in result]


# =========================================================
# 8. ANALYSE COMPARATIVE AVANCÉE - SÉCURISÉE
# =========================================================

def get_comprehensive_analysis(years: list) -> dict:
    """Analyse complète pour plusieurs années - SÉCURISÉ"""
    years = [int(y) for y in years]
    
    trend_query = text("""
        SELECT t.year, COUNT(*) AS accidents
        FROM fact_accident f
        JOIN dim_time t ON f.time_id = t.time_id
        WHERE t.year = ANY(:years)
        GROUP BY t.year
        ORDER BY t.year
    """)
    trend = db.session.execute(trend_query, {"years": years}).fetchall()
    
    weather_query = text("""
        SELECT t.year, w.weather_condition, COUNT(*) AS accidents
        FROM fact_accident f
        JOIN dim_time t ON f.time_id = t.time_id
        JOIN dim_weather w ON f.weather_id = w.weather_id
        WHERE t.year = ANY(:years) AND w.weather_condition IS NOT NULL
        GROUP BY t.year, w.weather_condition
        ORDER BY t.year, accidents DESC
    """)
    weather = db.session.execute(weather_query, {"years": years}).fetchall()
    
    severity_query = text("""
        SELECT t.year, f.severity_label, COUNT(*) AS accidents
        FROM fact_accident f
        JOIN dim_time t ON f.time_id = t.time_id
        WHERE t.year = ANY(:years)
        GROUP BY t.year, f.severity_label
        ORDER BY t.year, accidents DESC
    """)
    severity = db.session.execute(severity_query, {"years": years}).fetchall()
    
    return {
        "trend": [{"year": r[0], "accidents": r[1]} for r in trend],
        "weather": [{"year": r[0], "weather": r[1], "accidents": r[2]} for r in weather[:10]],
        "severity": [{"year": r[0], "severity": r[1], "accidents": r[2]} for r in severity]
    }


# =========================================================
# 9. ANALYSE FACTORIELLE COMPLÈTE - CORRIGÉE
# =========================================================

def get_factor_impact_analysis() -> dict:
    """
    Analyse l'impact de différents facteurs sur les accidents
    Version OPTIMISÉE avec CTE pour le total
    """
    
    # 1. Impact de la météo
    weather_query = text("""
        WITH total AS (SELECT COUNT(*) AS total FROM fact_accident)
        SELECT 
            w.weather_condition,
            w.temp_bucket,
            w.visibility_bucket,
            COUNT(*) AS accidents,
            ROUND(100.0 * COUNT(*) / total.total, 2) AS percentage
        FROM fact_accident f
        JOIN dim_weather w ON f.weather_id = w.weather_id
        CROSS JOIN total
        WHERE w.weather_condition IS NOT NULL
        GROUP BY w.weather_condition, w.temp_bucket, w.visibility_bucket, total.total
        ORDER BY accidents DESC
        LIMIT 10
    """)
    weather_impact = db.session.execute(weather_query).fetchall()
    
    # 2. Impact des infrastructures routières
    road_query = text("""
        SELECT 
            COUNT(CASE WHEN r.traffic_signal = true THEN 1 END) AS with_signal,
            COUNT(CASE WHEN r.traffic_signal = false THEN 1 END) AS without_signal,
            COUNT(CASE WHEN r.crossing = true THEN 1 END) AS with_crossing,
            COUNT(CASE WHEN r.roundabout = true THEN 1 END) AS with_roundabout,
            COUNT(CASE WHEN r.railway = true THEN 1 END) AS with_railway,
            COUNT(*) AS total
        FROM fact_accident f
        JOIN dim_road r ON f.road_id = r.road_id
    """)
    road_impact = db.session.execute(road_query).fetchone()
    
    # 3. Impact temporel
    temporal_query = text("""
        WITH total AS (SELECT COUNT(*) AS total FROM fact_accident)
        SELECT 
            t.season,
            t.time_of_day,
            t.is_weekend,
            COUNT(*) AS accidents,
            ROUND(100.0 * COUNT(*) / total.total, 2) AS percentage
        FROM fact_accident f
        JOIN dim_time t ON f.time_id = t.time_id
        CROSS JOIN total
        GROUP BY t.season, t.time_of_day, t.is_weekend, total.total
        ORDER BY accidents DESC
        LIMIT 10
    """)
    temporal_impact = db.session.execute(temporal_query).fetchall()
    
    # 4. Impact géographique
    geo_query = text("""
        WITH total AS (SELECT COUNT(*) AS total FROM fact_accident)
        SELECT 
            l.us_region,
            COUNT(*) AS accidents,
            ROUND(100.0 * COUNT(*) / total.total, 2) AS percentage
        FROM fact_accident f
        JOIN dim_location l ON f.location_id = l.location_id
        CROSS JOIN total
        WHERE l.us_region IS NOT NULL AND l.us_region != 'Unknown'
        GROUP BY l.us_region, total.total
        ORDER BY accidents DESC
    """)
    geo_impact = db.session.execute(geo_query).fetchall()
    
    # 5. Impact de la gravité sur la durée - CORRIGÉ
    severity_query = text("""
        SELECT 
            severity_label,
            ROUND(AVG(duration_min)::numeric, 1) AS avg_duration,
            COUNT(*) AS accidents
        FROM fact_accident
        WHERE duration_min IS NOT NULL AND duration_min > 0
        GROUP BY severity_label
        ORDER BY accidents DESC
    """)
    severity_impact = db.session.execute(severity_query).fetchall()
    
    # Convertir les Decimal en float/int pour JSON
    return {
        "weather_impact": [{"condition": r[0], "temp": r[1], "visibility": r[2], "accidents": int(r[3]) if r[3] else 0, "percentage": float(r[4]) if r[4] else 0} for r in weather_impact],
        "road_impact": {
            "with_traffic_signal": int(road_impact[0]) if road_impact[0] else 0,
            "without_traffic_signal": int(road_impact[1]) if road_impact[1] else 0,
            "with_crossing": int(road_impact[2]) if road_impact[2] else 0,
            "with_roundabout": int(road_impact[3]) if road_impact[3] else 0,
            "with_railway": int(road_impact[4]) if road_impact[4] else 0,
            "total_accidents": int(road_impact[5]) if road_impact[5] else 0
        },
        "temporal_impact": [{"season": r[0], "time_of_day": r[1], "is_weekend": r[2], "accidents": int(r[3]) if r[3] else 0, "percentage": float(r[4]) if r[4] else 0} for r in temporal_impact],
        "geo_impact": [{"region": r[0], "accidents": int(r[1]) if r[1] else 0, "percentage": float(r[2]) if r[2] else 0} for r in geo_impact],
        "severity_impact": [{"severity": r[0], "avg_duration_min": float(r[1]) if r[1] else 0, "accidents": int(r[2]) if r[2] else 0} for r in severity_impact]
    }


# =========================================================
# 10. CALCULS DE CROISSANCE (backend)
# =========================================================

def calculate_growth(data: list) -> dict:
    """Calcule la croissance entre la première et la dernière année"""
    if not data or len(data) < 2:
        return {
            "growth_percentage": None,
            "first_year": None,
            "first_count": None,
            "last_year": None,
            "last_count": None,
            "trend": "insufficient_data"
        }
    
    first = data[0]
    last = data[-1]
    
    first_count = first["accidents"]
    last_count = last["accidents"]
    
    if first_count == 0:
        growth = None
        trend = "cannot_calculate"
    else:
        growth = round(((last_count - first_count) / first_count) * 100, 2)
        if growth > 0:
            trend = "increase"
        elif growth < 0:
            trend = "decrease"
        else:
            trend = "stable"
    
    return {
        "growth_percentage": growth,
        "first_year": first["year"],
        "first_count": first_count,
        "last_year": last["year"],
        "last_count": last_count,
        "trend": trend
    }


def calculate_yearly_changes(data: list) -> list:
    """Calcule les changements année par année"""
    if not data or len(data) < 2:
        return []
    
    changes = []
    for i in range(1, len(data)):
        current = data[i]
        previous = data[i-1]
        
        current_count = current["accidents"]
        previous_count = previous["accidents"]
        
        if previous_count == 0:
            change_pct = None
        else:
            change_pct = round(((current_count - previous_count) / previous_count) * 100, 2)
        
        changes.append({
            "year": current["year"],
            "previous_year": previous["year"],
            "change_absolute": current_count - previous_count,
            "change_percentage": change_pct
        })
    
    return changes


def get_accidents_by_years_with_growth(question: str) -> dict:
    """Retourne le nombre d'accidents par année avec calculs de croissance"""
    years = extract_years(question)
    if not years:
        years = [2016, 2019, 2022]
    
    query = text("""
        SELECT t.year, COUNT(*) AS accidents
        FROM fact_accident f
        JOIN dim_time t ON f.time_id = t.time_id
        WHERE t.year = ANY(:years)
        GROUP BY t.year
        ORDER BY t.year
    """)
    result = db.session.execute(query, {"years": years}).fetchall()
    
    data = [{"year": int(r[0]), "accidents": r[1]} for r in result]
    
    growth_info = calculate_growth(data)
    yearly_changes = calculate_yearly_changes(data)
    
    return {
        "data": data,
        "growth": growth_info,
        "yearly_changes": yearly_changes,
        "total_accidents": sum(item["accidents"] for item in data),
        "years_count": len(data)
    }


def get_accidents_trend_with_growth() -> dict:
    """Retourne la tendance des accidents sur toutes les années avec croissance"""
    query = text("""
        SELECT t.year, COUNT(*) AS accidents
        FROM fact_accident f
        JOIN dim_time t ON f.time_id = t.time_id
        GROUP BY t.year
        ORDER BY t.year
    """)
    result = db.session.execute(query).fetchall()
    
    data = [{"year": int(r[0]), "accidents": r[1]} for r in result]
    
    growth_info = calculate_growth(data)
    yearly_changes = calculate_yearly_changes(data)
    
    return {
        "data": data,
        "growth": growth_info,
        "yearly_changes": yearly_changes,
        "total_accidents": sum(item["accidents"] for item in data),
        "years_count": len(data)
    }