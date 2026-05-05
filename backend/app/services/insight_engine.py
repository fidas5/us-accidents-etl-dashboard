def generate_insights(context):
    insights = []

    try:
        dominant = context.get("dominant_factor")

        if dominant:
            insights.append(
                f"{dominant['name']} représente le facteur dominant avec {dominant['percentage']}% des accidents"
            )

        insights.append("La fréquence ≠ causalité")
        insights.append("La sévérité doit être analysée séparément de la fréquence")

        return insights

    except Exception as e:
        return [f"Insight error: {str(e)}"]