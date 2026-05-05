import requests
import json

OLLAMA_URL = "http://localhost:11434/api/generate"


def generate_ai_answer(question, context, insights):
    prompt = f"""
Tu es un expert en analyse des accidents routiers.

QUESTION:
{question}

CONTEXTE:
{json.dumps(context, indent=2)}

INSIGHTS:
{insights}

Réponds en français uniquement avec:
- Résultat
- Explication
- Insight BI
"""

    try:
        response = requests.post(OLLAMA_URL, json={
            "model": "llama3",
            "prompt": prompt,
            "stream": False
        })

        return response.json().get("response", "")

    except Exception as e:
        return f"Erreur Ollama: {str(e)}"