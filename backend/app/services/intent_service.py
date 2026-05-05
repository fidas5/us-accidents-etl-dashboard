INTENT_MAP = {
    "factor": "by-weather",
    "weather": "by-weather",
    "severity": "by-severity",
    "trend": "by-month",
    "year": "by-year",
    "state": "by-state",
    "hour": "by-hour"
}


def detect_intent(question: str):
    q = question.lower()

    # FACTOR / CAUSES (IMPORTANT FIX)
    if any(word in q for word in [
        "facteur", "cause", "causes", "principal", "pourquoi", "raison", "origine"
    ]):
        return "factor"

    # WEATHER
    if "weather" in q or "météo" in q:
        return "weather"

    # SEVERITY
    if "severity" in q or "gravité" in q:
        return "severity"

    # TREND
    if "month" in q or "trend" in q or "tendance" in q:
        return "trend"

    # YEAR
    if "year" in q or "année" in q:
        return "year"

    # STATE
    if "state" in q or "état" in q:
        return "state"

    # HOUR
    if "hour" in q or "time" in q or "heure" in q:
        return "hour"

    return "unknown"
  