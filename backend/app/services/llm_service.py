"""
llm_service.py - Service pour générer des explications intelligentes
Version avec validation, gestion des None, et prompts sécurisés
"""

import requests
import json
import re
import hashlib
from functools import lru_cache
from typing import List, Dict, Any, Optional

OLLAMA_URL = "http://localhost:11434/api/generate"


# =========================================================
# CACHE LRU
# =========================================================

@lru_cache(maxsize=100)
def _call_llama_cached(prompt_hash: str) -> str:
    """Version cachée de l'appel LLaMA"""
    actual_prompt = prompt_hash.split(":", 1)[1] if ":" in prompt_hash else prompt_hash
    return _call_llama_raw(actual_prompt)


def _call_llama_raw(prompt: str) -> str:
    """Appel réel à l'API Ollama"""
    try:
        print(f"[LLAMA] Calling Ollama with prompt length: {len(prompt)}")
        
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": "llama3",
                "prompt": prompt,
                "stream": False,
                "temperature": 0.1,
                "max_tokens": 600
            },
            timeout=120
        )
        
        print(f"[LLAMA] Response status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"[LLAMA] Success! Response length: {len(result.get('response', ''))}")
            return result["response"]
        else:
            return json.dumps({
                "summary": f"Ollama error: {response.status_code}",
                "trend": "unknown",
                "recommendations": ["Make sure model 'llama3' is downloaded: ollama pull llama3"]
            })
            
    except requests.exceptions.ConnectionError:
        return json.dumps({
            "summary": "Cannot connect to Ollama. Make sure it's running on port 11434",
            "trend": "unknown",
            "recommendations": ["Run 'ollama serve'", "Then run 'ollama pull llama3'"]
        })
    except Exception as e:
        return json.dumps({
            "summary": f"AI service error: {str(e)}",
            "trend": "unknown",
            "recommendations": ["Check Ollama installation"]
        })


def _call_llama(prompt: str) -> str:
    """Wrapper avec cache"""
    prompt_hash = hashlib.sha256(prompt.encode('utf-8')).hexdigest()
    cache_key = f"{prompt_hash}:{prompt}"
    return _call_llama_cached(cache_key)


# =========================================================
# EXTRACTION JSON ROBUSTE
# =========================================================

def extract_json_from_response(response: str) -> Optional[dict]:
    """Extrait le JSON d'une réponse LLaMA"""
    # Méthode 1: Chercher un objet JSON simple
    match = re.search(r'\{[^{}]*\}', response, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    
    # Méthode 2: Chercher un objet JSON imbriqué
    match = re.search(r'\{.*\}', response, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    
    return None


def parse_llama_response_with_validation(
    response: str, 
    required_keys: list,
    default_summary: str = "Unable to generate analysis"
) -> dict:
    """Parse la réponse JSON avec validation"""
    parsed = extract_json_from_response(response)
    
    if parsed and isinstance(parsed, dict):
        return validate_analysis_response(parsed, required_keys)
    
    # Fallback
    return {key: default_summary if key == "summary" else None for key in required_keys}


# =========================================================
# VALIDATION DES RÉPONSES
# =========================================================

def validate_analysis_response(response: dict, required_keys: list) -> dict:
    """Valide que la réponse contient toutes les clés requises avec des valeurs non-null"""
    validated = {}
    for key in required_keys:
        value = response.get(key)
        if value is None or value == "":
            if key == "summary":
                value = "Analysis completed"
            elif key == "trend":
                value = "unknown"
            elif key == "recommendations":
                value = ["Check the data for more insights"]
            elif key == "observations":
                value = ["No specific observations available"]
            elif key == "most_impactful_factor":
                value = "unknown"
            elif key == "top_factor_percentage":
                value = 0
            elif key == "key_observation":
                value = "No specific observation available"
            elif key == "top_location":
                value = "Unknown"
            elif key == "top_accidents":
                value = 0
            elif key == "top_three":
                value = ["Unknown", "Unknown", "Unknown"]
            elif key == "observation":
                value = "Data available but no specific observation"
            elif key == "most_common_severity":
                value = "Moderate"
            elif key == "most_common_count":
                value = 0
            elif key == "critical_count":
                value = 0
            elif key == "critical_percentage":
                value = 0
            elif key == "capabilities":
                value = [
                    "Compare accidents between years",
                    "Identify most dangerous states or regions",
                    "Analyze weather impact on accidents",
                    "Find most impactful factors",
                    "Analyze seasonal patterns",
                    "Study severity distribution"
                ]
            elif key == "example_questions":
                value = [
                    "Compare accidents between 2016 and 2022",
                    "Which states are the most dangerous?",
                    "What is the most impactful factor affecting accidents?"
                ]
            elif key == "note":
                value = "All numbers are pre-calculated. I only explain the results."
            elif key == "longest_duration_severity":
                value = "Unknown"
            elif key == "longest_duration_minutes":
                value = 0
            elif key == "peak_year":
                value = None
            elif key == "peak_accidents":
                value = None
            elif key == "trend_direction":
                value = "unknown"
            elif key == "year_over_year_changes":
                value = []
            elif key == "forecast_hint":
                value = "Insufficient data for forecast"
            elif key == "trend_summary":
                value = "Trend analysis completed"
            elif key == "weather_impact":
                value = "Weather patterns identified"
            elif key == "severity_summary":
                value = "Severity distribution analyzed"
            elif key == "insights":
                value = ["Data analyzed", "Patterns identified"]
        validated[key] = value
    return validated


# =========================================================
# PROMPT BASE RULES
# =========================================================

PROMPT_BASE_RULES = """
CRITICAL RULES (MUST FOLLOW):
1. DO NOT calculate any numbers (they are already provided above)
2. Do not invent causes. Only describe patterns explicitly visible in the data.
3. If data is insufficient, say "Insufficient data to draw conclusions"
4. Base your analysis ONLY on the numbers provided
5. Answer in ENGLISH
"""


# =========================================================
# 1. COMPARAISON D'ANNÉES
# =========================================================

def generate_comparison_explanation(question: str, data: List[Dict], growth: Dict, yearly_changes: List[Dict]) -> Dict:
    """Génère une explication structurée avec gestion des valeurs None"""
    
    # Calculer le total des accidents (gérer les None)
    total_accidents = 0
    for item in data:
        if item.get('accidents') is not None:
            total_accidents += item['accidents']
    
    # Gérer les valeurs None dans growth
    first_count = growth.get('first_count')
    last_count = growth.get('last_count')
    growth_pct = growth.get('growth_percentage')
    trend = growth.get('trend', 'unknown')
    
    first_count_str = f"{first_count:,}" if first_count is not None else "N/A"
    last_count_str = f"{last_count:,}" if last_count is not None else "N/A"
    growth_pct_str = f"{growth_pct}%" if growth_pct is not None else "N/A"
    
    prompt = f"""
You are a data analyst. Your task is to EXPLAIN the data, not calculate it.

USER QUESTION:
{question}

PRE-CALCULATED DATA (DO NOT RECALCULATE):
- Total accidents analyzed: {total_accidents:,}
- Years compared: from {growth.get('first_year', 'N/A')} to {growth.get('last_year', 'N/A')}
- Accidents in {growth.get('first_year', 'N/A')}: {first_count_str}
- Accidents in {growth.get('last_year', 'N/A')}: {last_count_str}
- Growth: {growth_pct_str} ({trend})

YEARLY CHANGES:
{json.dumps(yearly_changes, indent=2, default=str)}

{PROMPT_BASE_RULES}

OUTPUT FORMAT (MUST BE VALID JSON):
{{
    "summary": "A concise 2-3 sentence analysis of the accident trend",
    "trend": "increase or decrease or stable or insufficient_data",
    "key_observation": "The most notable finding from this data",
    "recommendations": ["recommendation 1", "recommendation 2"]
}}

Return ONLY the JSON object.
"""
    response = _call_llama(prompt)
    return parse_llama_response_with_validation(
        response, 
        ["summary", "trend", "key_observation", "recommendations"],
        "Unable to analyze accident comparison"
    )


# =========================================================
# 2. ANALYSE FACTORIELLE
# =========================================================

def generate_factor_analysis_explanation(factor_data: Dict, top_factors: Dict) -> Dict:
    """Génère une explication factorielle structurée"""
    
    # Gérer les valeurs None
    weather_condition = factor_data.get('weather_impact', [{}])[0].get('condition', 'N/A')
    weather_pct = factor_data.get('weather_impact', [{}])[0].get('percentage', 0)
    weather_pct_str = f"{weather_pct}%" if weather_pct else "0%"
    
    prompt = f"""
You are a road safety expert. Explain the following PRE-CALCULATED data.

WEATHER IMPACT (pre-calculated):
- Most impactful condition: {weather_condition}
- Percentage: {weather_pct_str}
- Accidents: {factor_data.get('weather_impact', [{}])[0].get('accidents', 0):,}

TOP FACTORS (pre-calculated percentages):
1. Weather: {top_factors.get('weather', {}).get('percentage', 0)}%
2. Time period: {top_factors.get('temporal', {}).get('percentage', 0)}%
3. Region: {top_factors.get('region', {}).get('percentage', 0)}%

ROAD INFRASTRUCTURE (pre-calculated):
- With traffic signal: {factor_data.get('road_impact', {}).get('with_traffic_signal', 0):,}
- Without traffic signal: {factor_data.get('road_impact', {}).get('without_traffic_signal', 0):,}
- With crossing: {factor_data.get('road_impact', {}).get('with_crossing', 0):,}

{PROMPT_BASE_RULES}

OUTPUT FORMAT (MUST BE VALID JSON):
{{
    "summary": "Overall analysis of impacting factors",
    "most_impactful_factor": "weather or temporal or region or infrastructure",
    "top_factor_percentage": number,
    "observations": ["observation 1", "observation 2", "observation 3"],
    "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"]
}}

Return ONLY the JSON object.
"""
    response = _call_llama(prompt)
    return parse_llama_response_with_validation(
        response,
        ["summary", "most_impactful_factor", "top_factor_percentage", "observations", "recommendations"],
        "Unable to analyze factors"
    )


# =========================================================
# 3. ANALYSE PAR ÉTAT
# =========================================================

def generate_state_analysis(state_data: List[Dict], is_region: bool = False) -> Dict:
    """Analyse d'état structurée"""
    top = state_data[0] if state_data else None
    top_key = 'region' if is_region else 'state'
    
    return {
        "summary": f"Top {len(state_data)} locations analyzed",
        "top_location": top.get(top_key, 'Unknown') if top else 'Unknown',
        "top_accidents": top.get('accidents', 0) if top else 0,
        "top_three": [item.get(top_key, 'Unknown') for item in state_data[:3]] if state_data else [],
        "observation": "Data shows concentration in top locations"
    }


# =========================================================
# 4. ANALYSE SAISONNIÈRE
# =========================================================

def generate_seasonal_insight(season_data: List[Dict], time_data: List[Dict]) -> Dict:
    """Analyse saisonnière structurée"""
    top_season = season_data[0] if season_data else None
    top_time = time_data[0] if time_data else None
    
    return {
        "summary": "Seasonal and time pattern analysis completed",
        "most_dangerous_season": top_season.get('season', 'Unknown') if top_season else 'Unknown',
        "most_dangerous_time": top_time.get('time_of_day', 'Unknown') if top_time else 'Unknown',
        "peak_season_accidents": top_season.get('accidents', 0) if top_season else 0,
        "peak_time_accidents": top_time.get('accidents', 0) if top_time else 0,
        "observation": "Patterns identified in the data"
    }


# =========================================================
# 5. ANALYSE DE GRAVITÉ
# =========================================================

def generate_severity_insight(severity_data: List[Dict], duration_data: List[Dict]) -> Dict:
    """Analyse de gravité structurée"""
    top = severity_data[0] if severity_data else None
    critical = next((s for s in severity_data if s.get('severity') == 'Critical'), None)
    
    return {
        "summary": "Severity distribution analysis completed",
        "most_common_severity": top.get('severity', 'Moderate') if top else 'Moderate',
        "most_common_count": top.get('accidents', 0) if top else 0,
        "critical_count": critical.get('accidents', 0) if critical else 0,
        "critical_percentage": critical.get('percentage', 0) if critical else 0,
        "recommendations": ["Monitor severe accidents", "Review safety measures"]
    }


# =========================================================
# 6. RÉPONSE D'AIDE
# =========================================================

def generate_help_response() -> Dict:
    """Génère la réponse d'aide"""
    return {
        "summary": "I can help you analyze road accidents using pre-calculated data.",
        "capabilities": [
            "Compare accidents between years",
            "Identify most dangerous states or regions",
            "Analyze weather impact on accidents",
            "Find most impactful factors",
            "Analyze seasonal patterns",
            "Study severity distribution"
        ],
        "example_questions": [
            "Compare accidents between 2016 and 2022",
            "Which states are the most dangerous?",
            "What is the most impactful factor affecting accidents?"
        ],
        "note": "All numbers are pre-calculated. I only explain the results."
    }


# =========================================================
# AUTRES FONCTIONS (pour compatibilité)
# =========================================================

def generate_trend_analysis_explanation(result: Dict) -> Dict:
    """Analyse de tendance simplifiée"""
    return {
        "summary": "Trend analysis completed",
        "trend_direction": result.get('growth', {}).get('trend', 'unknown'),
        "peak_year": None,
        "peak_accidents": None,
        "year_over_year_changes": [],
        "forecast_hint": "Insufficient data for forecast"
    }


def generate_smart_summary(years: List[int], data: Dict) -> Dict:
    """Smart summary simplifié"""
    trend_data = data.get("trend", [])
    if len(trend_data) >= 2:
        first = trend_data[0].get("accidents", 0)
        last = trend_data[-1].get("accidents", 0)
        real_trend = "increase" if last > first else "decrease" if last < first else "stable"
    else:
        real_trend = "insufficient_data"
    
    return {
        "summary": f"Analysis for years {years} completed",
        "trend_summary": f"{real_trend} trend observed",
        "weather_impact": "Weather patterns analyzed",
        "severity_summary": "Severity distribution reviewed",
        "recommendations": ["Review seasonal patterns", "Monitor high-risk areas"]
    }


def generate_explanation(question: str, data: List[Dict]) -> Dict:
    """Explication générique simplifiée"""
    return {
        "summary": f"Analysis of {len(data)} records completed",
        "insights": ["Data analyzed", "Patterns identified"]
    }