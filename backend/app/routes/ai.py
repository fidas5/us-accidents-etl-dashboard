"""
ai.py - Routes pour l'assistant IA
Version avec validation stricte, sécurité renforcée, et fallback explicite
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
import re

from ..services.sql_service import (
    get_accidents_by_years_with_growth,
    get_accidents_trend_with_growth,
    get_accidents_by_state,
    get_accidents_by_region,
    get_accidents_by_weather,
    get_weather_trend_by_year,
    get_severity_distribution,
    get_severity_trend_by_year,
    get_accidents_by_season,
    get_accidents_by_time_of_day,
    get_avg_duration_by_severity,
    get_comprehensive_analysis,
    get_factor_impact_analysis
)
from ..services.llm_service import (
    generate_comparison_explanation,
    generate_factor_analysis_explanation,
    generate_state_analysis,
    generate_seasonal_insight,
    generate_severity_insight,
    generate_help_response,
    validate_analysis_response
)

ai_bp = Blueprint("ai", __name__, url_prefix="/ai")

# =========================================================
# CONSTANTES
# =========================================================

# Années valides dans le dataset (à ajuster selon vos données)
VALID_YEARS = {2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023}

# =========================================================
# VALIDATION STRICTE DES RÉPONSES
# =========================================================


def validate_years(years: list) -> list:
    """Valide que les années demandées existent dans le dataset"""
    if not years:
        return [2016, 2019, 2022]
    
    valid_years = [y for y in years if y in VALID_YEARS]
    
    # Si aucune année valide, retourner les années par défaut
    if not valid_years:
        return [2016, 2019, 2022]
    
    return valid_years


def get_allowed_years_range() -> dict:
    """Retourne la plage d'années disponible dans la base"""
    from .. import db
    from sqlalchemy import text
    
    try:
        result = db.session.execute(text("""
            SELECT MIN(year), MAX(year) FROM dim_time
        """)).fetchone()
        return {"min": result[0], "max": result[1]}
    except:
        return {"min": 2016, "max": 2023}


# =========================================================
# INTENTION DETECTION (score-based)
# =========================================================

def detect_intent(question: str) -> str:
    """Détecte l'intention avec ordre strict"""
    q = question.lower()
    
    # Sécurité : détection d'injection de prompt
    dangerous_patterns = [
        "ignore previous", "ignore instructions", "ignore rules",
        "pretend you are", "act as", "you are now",
        "disregard", "forget your", "new instruction"
    ]
    if any(pattern in q for pattern in dangerous_patterns):
        return "help"
    
    # Dictionnaire des mots-clés
    intent_keywords = {
        "factor": ["facteur", "factor", "affecte", "influence", "pourquoi", "le plus", "principale", "causes"],
        "compare_years": ["compare", "between", "versus", "vs", "comparaison", "différence"],
        "trend": ["trend", "tendance", "global", "général", "évolution globale", "overall"],
        "weather": ["weather", "meteo", "météo", "climate", "climat", "pluie", "température", "neige"],
        "state": ["state", "état", "etat", "region", "région", "top", "dangerous"],
        "severity": ["severity", "gravité", "grave", "serious", "critique"],
        "temporal": ["saison", "season", "heure", "hour", "time", "période", "moment", "nuit"],
        "duration": ["duration", "durée", "long", "how long", "combien de temps"],
        "help": ["help", "aide", "quoi", "que peux", "capacité"]
    }
    
    scores = {}
    for intent, keywords in intent_keywords.items():
        score = sum(1 for kw in keywords if kw in q)
        if score > 0:
            scores[intent] = score
    
    if scores:
        best_intent = max(scores, key=scores.get)
        # Blacklist: ne pas permettre "help" sauf si aucun autre intent
        if best_intent == "help" and len(scores) > 1:
            return max([i for i in scores if i != "help"], key=scores.get)
        return best_intent
    
    return "help"


# =========================================================
# HANDLERS
# =========================================================

def handle_compare_years(question: str) -> dict:
    """Handler pour la comparaison d'années (avec validation des années)"""
    # Extraire les années de la question
    years = re.findall(r"\b(20\d{2})\b", question)
    years = [int(y) for y in years]
    
    # Valider les années
    original_years = years.copy()
    valid_years = validate_years(years)
    
    # Si des années ont été modifiées, ajouter un avertissement
    year_warning = None
    if original_years and set(original_years) != set(valid_years):
        invalid = [y for y in original_years if y not in VALID_YEARS]
        year_warning = f"Note: Years {invalid} are not in dataset. Analyzing available years: {valid_years}"
    
    result = get_accidents_by_years_with_growth(question)
    
    # Utiliser les années valides pour l'analyse
    if valid_years != years:
        # Re-query avec les années valides si nécessaire
        modified_question = question
        for y in invalid:
            modified_question = modified_question.replace(str(y), "")
        result = get_accidents_by_years_with_growth(modified_question)
    
    # Générer l'explication
    analysis = generate_comparison_explanation(
        question=question,
        data=result["data"],
        growth=result["growth"],
        yearly_changes=result["yearly_changes"]
    )
    
    # Validation stricte de la réponse
    analysis = validate_analysis_response(analysis, ["summary", "trend", "key_observation", "recommendations"])
    
    response = {
        "intent": "compare_years",
        "data": result["data"],
        "growth": result["growth"],
        "yearly_changes": result["yearly_changes"],
        "total_accidents": result["total_accidents"],
        "analysis": analysis,
        "answer": analysis.get("summary", "Comparison completed")
    }
    
    if year_warning:
        response["warning"] = year_warning
    
    return response


def handle_factor_analysis(question: str) -> dict:
    """Handler pour l'analyse factorielle"""
    factor_data = get_factor_impact_analysis()
    top_factors = {
        "weather": factor_data['weather_impact'][0] if factor_data.get('weather_impact') else None,
        "temporal": factor_data['temporal_impact'][0] if factor_data.get('temporal_impact') else None,
        "region": factor_data['geo_impact'][0] if factor_data.get('geo_impact') else None
    }
    analysis = generate_factor_analysis_explanation(factor_data, top_factors)
    
    # Validation stricte
    analysis = validate_analysis_response(
        analysis, 
        ["summary", "most_impactful_factor", "top_factor_percentage", "observations", "recommendations"]
    )
    
    return {
        "intent": "factor_analysis",
        "data": factor_data,
        "top_factors": top_factors,
        "analysis": analysis,
        "answer": analysis.get("summary", "Analysis completed")
    }


def handle_state_analysis(question: str) -> dict:
    """Handler pour l'analyse par état"""
    if "region" in question or "région" in question:
        result_data = get_accidents_by_region()
        analysis = generate_state_analysis(
            [{"region": r["region"], "accidents": r["accidents"]} for r in result_data], 
            is_region=True
        )
    else:
        result_data = get_accidents_by_state(10)
        analysis = generate_state_analysis(result_data, is_region=False)
    
    analysis = validate_analysis_response(analysis, ["summary", "top_location", "top_accidents", "top_three", "observation"])
    
    return {
        "intent": "state_analysis",
        "data": result_data,
        "analysis": analysis,
        "answer": analysis.get("summary", "State analysis completed")
    }


def handle_weather_analysis(question: str) -> dict:
    """Handler pour l'analyse météo"""
    if "trend" in question:
        result_data = get_weather_trend_by_year()
        analysis = {
            "summary": "Weather trend analysis completed",
            "insights": ["Weather patterns show variation across years"]
        }
    else:
        result_data = get_accidents_by_weather()
        analysis = {
            "summary": f"Weather analysis based on {len(result_data)} conditions",
            "insights": [f"{item['weather']}: {item['percentage']}%" for item in result_data[:3]]
        }
    
    return {
        "intent": "weather_analysis",
        "data": result_data,
        "analysis": analysis,
        "answer": analysis.get("summary", "Weather analysis completed")
    }


def handle_severity_analysis(question: str) -> dict:
    """Handler pour l'analyse de gravité"""
    duration_data = get_avg_duration_by_severity()
    result_data = get_severity_distribution()
    
    analysis = {
        "summary": "Severity distribution analysis completed",
        "most_common_severity": result_data[0]["severity"] if result_data else "Unknown",
        "most_common_count": result_data[0]["accidents"] if result_data else 0,
        "critical_count": next((s["accidents"] for s in result_data if s["severity"] == "Critical"), 0),
        "critical_percentage": next((s["percentage"] for s in result_data if s["severity"] == "Critical"), 0),
        "recommendations": ["Monitor severe accidents", "Review safety measures"]
    }
    
    return {
        "intent": "severity_analysis",
        "data": result_data,
        "duration_data": duration_data,
        "analysis": analysis,
        "answer": analysis.get("summary", "Severity analysis completed")
    }


def handle_temporal_analysis(question: str) -> dict:
    """Handler pour l'analyse temporelle"""
    season_data = get_accidents_by_season()
    time_data = get_accidents_by_time_of_day()
    
    analysis = {
        "summary": "Temporal analysis completed",
        "most_dangerous_season": season_data[0]["season"] if season_data else "Unknown",
        "most_dangerous_time": time_data[0]["time_of_day"] if time_data else "Unknown",
        "peak_season_accidents": season_data[0]["accidents"] if season_data else 0,
        "peak_time_accidents": time_data[0]["accidents"] if time_data else 0,
        "observation": "Patterns identified in the data"
    }
    
    return {
        "intent": "temporal_analysis",
        "data": {"season": season_data, "time_of_day": time_data},
        "analysis": analysis,
        "answer": analysis.get("summary", "Temporal analysis completed")
    }


def handle_duration_analysis(question: str) -> dict:
    """Handler pour l'analyse de durée"""
    severity_data = get_severity_distribution()
    duration_data = get_avg_duration_by_severity()
    
    # Trouver la durée la plus longue
    longest = max(duration_data, key=lambda x: x.get("avg_duration_min", 0)) if duration_data else None
    
    analysis = {
        "summary": "Duration analysis completed",
        "longest_duration_severity": longest["severity"] if longest else "Unknown",
        "longest_duration_minutes": longest["avg_duration_min"] if longest else 0,
        "observation": f"Critical accidents last longest ({longest['avg_duration_min']} min on average)" if longest else "Data available",
        "recommendations": ["Review emergency response times"]
    }
    
    return {
        "intent": "duration_analysis",
        "data": {"severity": severity_data, "duration": duration_data},
        "analysis": analysis,
        "answer": analysis.get("summary", "Duration analysis completed")
    }


def handle_smart_summary(question: str) -> dict:
    """Handler pour le résumé intelligent"""
    years = [2016, 2019, 2022]
    if "2020" in question:
        years = [2020, 2021, 2022]
    
    analysis_data = get_comprehensive_analysis(years)
    
    # Calculer la tendance réelle (backend, pas LLM)
    trend_data = analysis_data.get("trend", [])
    if len(trend_data) >= 2:
        first = trend_data[0]["accidents"]
        last = trend_data[-1]["accidents"]
        real_trend = "increase" if last > first else "decrease" if last < first else "stable"
    else:
        real_trend = "insufficient_data"
    
    analysis = {
        "summary": f"Accident analysis for years {years} completed",
        "trend_summary": f"{real_trend} trend observed",
        "weather_impact": "Weather patterns analyzed",
        "severity_summary": "Severity distribution reviewed",
        "recommendations": ["Review seasonal patterns", "Monitor high-risk areas"]
    }
    
    return {
        "intent": "smart_summary",
        "data": analysis_data,
        "trend_backend": real_trend,
        "analysis": analysis,
        "answer": analysis.get("summary", "Summary completed")
    }


def handle_help(question: str) -> dict:
    """Handler pour l'aide"""
    analysis = generate_help_response()
    analysis = validate_analysis_response(analysis, ["summary", "capabilities", "example_questions", "note"])
    
    return {
        "intent": "help",
        "analysis": analysis,
        "answer": analysis.get("summary", "Help information")
    }


# =========================================================
# MAP DES INTENTIONS
# =========================================================

INTENT_HANDLERS = {
    "factor": handle_factor_analysis,
    "compare_years": handle_compare_years,
    "trend": handle_smart_summary,
    "state": handle_state_analysis,
    "weather": handle_weather_analysis,
    "severity": handle_severity_analysis,
    "temporal": handle_temporal_analysis,
    "duration": handle_duration_analysis,
    "help": handle_help,
}


# =========================================================
# ENDPOINT PRINCIPAL
# =========================================================

@ai_bp.route("/ask", methods=["POST"])
@jwt_required()
def ask_ai():
    """Endpoint principal avec validation stricte"""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request, JSON body required"}), 400
    
    question = data.get("question", "")
    if not question:
        return jsonify({"error": "Question is required"}), 400
    
    # Détection d'injection de prompt (couche de sécurité supplémentaire)
    dangerous = [
        "ignore previous", "ignore instructions", "ignore rules",
        "pretend you are", "act as", "you are now", "disregard",
        "forget your", "new instruction", "system prompt"
    ]
    if any(pattern in question.lower() for pattern in dangerous):
        return jsonify({
            "intent": "blocked",
            "answer": "I cannot process requests that attempt to override my instructions. Please ask a legitimate question about accident data.",
            "analysis": {"summary": "Request blocked for security reasons"}
        }), 200
    
    print(f"[AI] Question reçue: {question}")
    
    intent = detect_intent(question)
    print(f"[AI] Intent detected: {intent}")
    
    handler = INTENT_HANDLERS.get(intent, handle_help)
    response = handler(question)
    
    # Validation finale : s'assurer que "answer" existe toujours
    if "answer" not in response:
        response["answer"] = response.get("analysis", {}).get("summary", "Analysis completed")
    
    return jsonify(response), 200


# =========================================================
# ENDPOINTS UTILITAIRES
# =========================================================

@ai_bp.route("/health", methods=["GET"])
def ai_health():
    return jsonify({
        "status": "ok",
        "services": ["sql", "llama3"],
        "valid_years": list(VALID_YEARS),
        "year_range": get_allowed_years_range(),
        "security": "prompt injection protection enabled"
    }), 200


@ai_bp.route("/valid-years", methods=["GET"])
@jwt_required()
def get_valid_years():
    """Retourne la liste des années valides dans le dataset"""
    return jsonify({
        "valid_years": list(VALID_YEARS),
        "note": "Only these years can be queried for accident data"
    }), 200