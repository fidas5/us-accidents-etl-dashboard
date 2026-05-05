import json


def build_context(intent, endpoint, raw_data):
    """
    Normalize raw KPI data into structured AI context
    """

    # 1. Fix: raw_data can be string OR dict
    if isinstance(raw_data, str):
        try:
            raw_data = json.loads(raw_data)
        except Exception:
            raise ValueError("raw_data is not valid JSON")

    if raw_data is None:
        raw_data = {}

    data = raw_data.get("data", [])
    total = raw_data.get("total", 0)

    if not data:
        return {
            "error": "No data available",
            "kpi": endpoint
        }

    # 2. Dominant factor
    dominant = max(data, key=lambda x: x.get("count", 0))

    # 3. Rankings
    by_frequency = sorted(data, key=lambda x: x.get("count", 0), reverse=True)

    by_severity = sorted(data, key=lambda x: x.get("avg_severity", 0), reverse=True)

    by_risk = sorted(
        data,
        key=lambda x: (x.get("avg_severity", 1) * x.get("count", 1)),
        reverse=True
    )

    # 4. Insights (upgrade v2)
    insights = {
        "findings": [
            f"{dominant.get('weather_condition')} est dominant ({dominant.get('pct')}%)"
        ],
        "comparisons": [
            "Fréquence ≠ risque réel",
            "Fréquence ≠ sévérité"
        ],
        "recommendations": [
            "Comparer fréquence vs sévérité",
            "Analyser score de risque"
        ],
        "warnings": []
    }

    return {
        "kpi": endpoint,
        "intent": intent,

        "dominant": {
            "name": dominant.get("weather_condition"),
            "count": dominant.get("count"),
            "percentage": dominant.get("pct")
        },

        "metrics": {
            "total_accidents": total
        },

        "insights": insights,

        "ranking": {
            "by_frequency": by_frequency[:5],
            "by_severity": by_severity[:5],
            "by_risk": by_risk[:5]
        }
    }