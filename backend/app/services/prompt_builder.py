def build_factor_prompt(question: str, context: dict):

    top = context.get("dominant_factor", {})
    top5 = context.get("top_5_factors", [])

    return f"""
Tu es un analyste en data science (sécurité routière).

⚠️ RÈGLES STRICTES:
- Ne jamais dire "cause"
- Utiliser uniquement "corrélation"
- Séparer fréquence et sévérité
- Ne pas interpréter au-delà des données

DONNÉES:
- Condition la plus fréquente: {context["most_exposed_condition"]}
- Condition la plus sévère: {context["most_severe_condition"]}
- Top 5: {context["top_5_conditions"]}

QUESTION:
{question}

STRUCTURE:
1. Résultat factuel
2. Explication statistique
3. Insight BI (corrélation uniquement)
"""