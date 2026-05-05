def format_factor_response(data):
    # validation robuste
    if data is None:
        return "Données non disponibles."

    if not isinstance(data, list):
        return "Format de données invalide."

    if len(data) == 0:
        return "Aucune donnée disponible."

    # tri métier (important pour insight layer futur)
    sorted_data = sorted(data, key=lambda x: x.get("count", 0), reverse=True)

    top = sorted_data[0]

    weather = top.get("weather_condition", "inconnu")
    pct = top.get("pct", 0)
    count = top.get("count", 0)
    avg = top.get("avg_severity", 0)

    return (
        "📊 Analyse des facteurs d’accidents (météo)\n\n"
        f"🔹 Facteur dominant : {weather}\n"
        f"🔹 Part des accidents : {pct:.1f}%\n"
        f"🔹 Nombre de cas : {count:,}\n"
        f"🔹 Sévérité moyenne : {avg:.2f}\n\n"
        "🧠 Insight : les accidents surviennent majoritairement sous des conditions "
        f"'{weather}', ce qui indique que la météo normale ou légèrement dégradée "
        "reste un facteur clé dans la sécurité routière."
    )