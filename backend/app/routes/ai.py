from flask import Blueprint, request, jsonify
import requests

from app.services.intent_service import detect_intent, INTENT_MAP
from app.services.kpi_service import fetch_kpi
from app.services.context_builder import build_context
from app.services.insight_engine import generate_insights
from app.services.ollama_service import generate_ai_answer

ai_bp = Blueprint("ai", __name__, url_prefix="/ai")


@ai_bp.route("/ask", methods=["POST"])
def ask_ai():
    data = request.get_json()
    question = data.get("question", "")

    print("\n================ AI REQUEST ================")
    print("QUESTION:", question)

    # 1. intent
    intent = detect_intent(question)
    endpoint = INTENT_MAP.get(intent)

    print("INTENT:", intent)
    print("ENDPOINT:", endpoint)

    if not endpoint:
        return jsonify({
            "answer": "Je ne comprends pas encore cette question.",
            "intent": "unknown"
        })

    # 2. JWT forward (IMPORTANT FIX)
    auth_header = request.headers.get("Authorization")

    # 3. fetch KPI with token
    raw_data = fetch_kpi(endpoint, auth_header)

    print("\n--- RAW DATA ---")
    print(raw_data)

    # 4. context builder
    context = build_context(intent, endpoint, raw_data)

    # 5. insights
    insights = generate_insights(context)

    # 6. LLM (FIXED CALL)
    answer = generate_ai_answer(question, context, insights)

    return jsonify({
        "question": question,
        "intent": intent,
        "kpi": endpoint,
        "answer": answer,
        "context": context,
        "raw_data": raw_data
    })