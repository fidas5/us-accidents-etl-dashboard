import requests

BASE_URL = "http://localhost:5050/api/stats/"


def fetch_kpi(endpoint: str, auth_header=None):
    try:
        headers = {}

        if auth_header:
            headers["Authorization"] = auth_header

        response = requests.get(
            BASE_URL + endpoint,
            headers=headers
        )

        if response.status_code == 200:
            return response.json()

        print("KPI ERROR:", response.status_code, response.text)
        return {"data": []}

    except Exception as e:
        print("KPI EXCEPTION:", e)
        return {"data": []}